import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeRoomingList, parseRoomingList, RoomingListError } from "../../src/core/rooming-list";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");
}

function expectRoomingListError(run: () => unknown): RoomingListError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RoomingListError);
    const roomingListError = error as RoomingListError;
    expect(roomingListError.userMessage).toBe(roomingListError.message);
    expect(roomingListError.userMessage).toMatch(/[.!?]$/u);
    return roomingListError;
  }
  throw new Error("Expected RoomingListError.");
}

describe("decodeRoomingList", () => {
  it("decodes strict UTF-8 and removes one leading BOM", () => {
    const body = new TextEncoder().encode("guest,room\nAlpha,101");
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...body]);

    expect(decodeRoomingList(bytes)).toBe("guest,room\nAlpha,101");
  });

  it("fails closed on invalid UTF-8 and files over 2 MiB", () => {
    expect(
      expectRoomingListError(() => decodeRoomingList(Uint8Array.from([0xc3, 0x28]))).userMessage,
    ).toBe("Choose a UTF-8 CSV file and try again.");

    expect(
      expectRoomingListError(() => decodeRoomingList(new Uint8Array(MAX_FILE_BYTES + 1)))
        .userMessage,
    ).toBe("Choose a CSV file smaller than 2 MiB and try again.");
  });
});

describe("parseRoomingList", () => {
  it("parses RFC 4180 quoting, escaped quotes, line endings, and quoted line breaks", () => {
    const result = parseRoomingList(
      'guest,room,unused\r\n"Acme, ""North""\nTeam",010,"kept out"\r\nBeta,2,x\n',
    );

    expect(result.sourceRowCount).toBe(2);
    expect(result.notices).toEqual([]);
    expect(result.packets).toEqual([
      {
        sourceRow: 4,
        guestLabel: "Beta",
        roomLabel: "2",
      },
      {
        sourceRow: 2,
        guestLabel: 'Acme, "North"\nTeam',
        roomLabel: "010",
      },
    ]);
  });

  it("accepts every documented guest and room alias", () => {
    const guestAliases = [
      "guest",
      "guest name",
      "guest_name",
      "name",
      "party",
      "party name",
      "packet name",
    ];
    const roomAliases = ["room", "room number", "room_number", "room no", "room_no", "room id"];

    for (const guestHeader of guestAliases) {
      for (const roomHeader of roomAliases) {
        expect(parseRoomingList(`${guestHeader},${roomHeader}\nAlpha,101`).packets).toEqual([
          {
            sourceRow: 2,
            guestLabel: "Alpha",
            roomLabel: "101",
          },
        ]);
      }
    }
  });

  it("normalizes only header case, punctuation, and surrounding whitespace for matching", () => {
    const result = parseRoomingList(
      "  PACKET___NAME!!!  ,  ROOM...NO  \n  McKay--O'Neil   III  ,  00A-7  ",
    );

    expect(result.packets).toEqual([
      {
        sourceRow: 2,
        guestLabel: "McKay--O'Neil   III",
        roomLabel: "00A-7",
      },
    ]);
  });

  it("fails when either required role is absent or matched more than once", () => {
    expect(expectRoomingListError(() => parseRoomingList("guest,notes\nAlpha,x")).userMessage).toBe(
      "Add one room column to the CSV and try again.",
    );
    expect(expectRoomingListError(() => parseRoomingList("room,notes\n101,x")).userMessage).toBe(
      "Add one guest or party column to the CSV and try again.",
    );
    expect(
      expectRoomingListError(() => parseRoomingList("guest,party,room\nAlpha,Team,101"))
        .userMessage,
    ).toBe("Keep only one guest or party column in the CSV and try again.");
    expect(
      expectRoomingListError(() => parseRoomingList("guest,room,room_no\nAlpha,101,101"))
        .userMessage,
    ).toBe("Keep only one room column in the CSV and try again.");
  });

  it("ignores fully blank data rows and counts only nonblank source records", () => {
    const result = parseRoomingList("guest,room\n\n  ,  \nAlpha,101\r\n,\r\nBeta,102\n");

    expect(result.sourceRowCount).toBe(2);
    expect(result.notices).toEqual([]);
    expect(result.packets.map((packet) => packet.sourceRow)).toEqual([4, 6]);
  });

  it("excludes incomplete rows and cites each missing value", () => {
    const result = parseRoomingList("guest,room\n,101\nBeta,\nAlpha,2");

    expect(result.packets).toEqual([
      {
        sourceRow: 4,
        guestLabel: "Alpha",
        roomLabel: "2",
      },
    ]);
    expect(result.notices).toEqual([
      {
        kind: "missing-guest",
        message: "Row 2 needs a guest or party label.",
        sourceRow: 2,
      },
      {
        kind: "missing-room",
        message: "Row 3 needs a room identifier.",
        sourceRow: 3,
      },
    ]);
  });

  it("cites every normalized duplicate occurrence without choosing an authoritative row", () => {
    const result = parseRoomingList(
      "guest,room\nAlpha Team,201\n alpha   team , 201 \nALPHA TEAM,201",
    );

    expect(result.packets).toHaveLength(3);
    expect(result.packets.map((packet) => packet.guestLabel)).toEqual([
      "alpha   team",
      "Alpha Team",
      "ALPHA TEAM",
    ]);
    expect(
      result.notices
        .filter((notice) => notice.kind === "duplicate")
        .map((notice) => notice.sourceRow),
    ).toEqual([2, 3, 4]);
  });

  it("retains a repeated room identifier when guest labels differ", () => {
    const result = parseRoomingList("guest,room\nAlex Morgan,402\nJamie Rivera,402");

    expect(result.notices).toEqual([]);
    expect(result.packets).toEqual([
      {
        sourceRow: 2,
        guestLabel: "Alex Morgan",
        roomLabel: "402",
      },
      {
        sourceRow: 3,
        guestLabel: "Jamie Rivera",
        roomLabel: "402",
      },
    ]);
  });

  it("cites every repeated normalized guest label when rooms differ", () => {
    const result = parseRoomingList(
      "guest,room\nHarbor   Crew,101\n harbor crew ,102\nHARBOR CREW,103",
    );

    expect(result.packets).toHaveLength(3);
    expect(
      result.notices
        .filter((notice) => notice.kind === "ambiguous-guest")
        .map((notice) => notice.sourceRow),
    ).toEqual([2, 3, 4]);
  });

  it("sorts rooms with a stable custom ASCII-digit natural order, then guests, then source row", () => {
    const result = parseRoomingList(
      "guest,room\nZulu,A10\nEcho,10\nBravo,A2\nZulu,2\nAlpha,02\nalpha,2",
    );

    expect(
      result.packets.map(
        ({ roomLabel, guestLabel, sourceRow }) => `${roomLabel}|${guestLabel}|${sourceRow}`,
      ),
    ).toEqual(["02|Alpha|6", "2|alpha|7", "2|Zulu|5", "10|Echo|3", "A2|Bravo|4", "A10|Zulu|2"]);
  });

  it("preserves display spelling and internal whitespace without inference, correction, or merging", () => {
    const result = parseRoomingList(
      "guest,room\n  MacKay  &  Co.  ,  Suite-00B  \nMacKay & Company,Suite-00C",
    );

    expect(result.packets).toEqual([
      {
        sourceRow: 2,
        guestLabel: "MacKay  &  Co.",
        roomLabel: "Suite-00B",
      },
      {
        sourceRow: 3,
        guestLabel: "MacKay & Company",
        roomLabel: "Suite-00C",
      },
    ]);
    expect(result.notices).toEqual([]);
  });

  it("rejects malformed quoting, more than 2,000 data records, and zero usable packets", () => {
    expect(
      expectRoomingListError(() => parseRoomingList('guest,room\n"Unclosed,101')).userMessage,
    ).toBe("This CSV could not be read; export it again as UTF-8 CSV, then choose it here.");

    const tooManyRows = [
      "guest,room",
      ...Array.from({ length: 2_001 }, (_, index) => `Guest ${index},${index}`),
    ].join("\n");
    expect(expectRoomingListError(() => parseRoomingList(tooManyRows)).userMessage).toBe(
      "Keep the CSV to 2,000 data rows or fewer and try again.",
    );

    expect(
      expectRoomingListError(() => parseRoomingList("guest,room\n,101\nBeta,\n,\n")).userMessage,
    ).toBe("Add at least one complete guest and room row and try again.");
  });

  it.each([
    "credit card number",
    "payment details",
    "passport_number",
    "government id",
    "medical notes",
    "medication",
    "accessibility notes",
    "access needs",
  ])("blocks the prohibited sensitive header %s", (sensitiveHeader) => {
    const error = expectRoomingListError(() =>
      parseRoomingList(`guest,room,${sensitiveHeader}\nAlpha,101,do not retain`),
    );

    expect(error.userMessage).toBe(
      "Remove payment, identity, medical, or accessibility details and try again.",
    );
  });

  it.each([
    ["NUL", "Alpha\u0000Team"],
    ["tab", "Alpha\tTeam"],
    ["escape", "Alpha\u001bTeam"],
    ["bidi override", "Alpha\u202eTeam"],
    ["bidi isolate", "Alpha\u2067Team"],
  ])("blocks %s control text in the implicated record", (_label, value) => {
    const error = expectRoomingListError(() => parseRoomingList(`guest,room\n${value},101`));

    expect(error.userMessage).toBe(
      "Row 2 contains hidden control text; replace that row and try again.",
    );
  });

  it("blocks labels that cannot fit instead of truncating them", () => {
    expect(
      expectRoomingListError(() => parseRoomingList(`guest,room\n${"@".repeat(29)},101`))
        .userMessage,
    ).toBe("Row 2 has a guest or party label that is too long; shorten it and try again.");
    expect(
      expectRoomingListError(() => parseRoomingList(`guest,room\nAlpha,${"@".repeat(12)}`))
        .userMessage,
    ).toBe("Row 2 has a room identifier that is too long; shorten it and try again.");
  });

  it("accepts WinAnsi accents and a curly apostrophe without changing display text", () => {
    const accepted = parseRoomingList("guest,room\nZoë d’Ávila,Étage 2");
    expect(accepted.packets[0]).toEqual({
      sourceRow: 2,
      guestLabel: "Zoë d’Ávila",
      roomLabel: "Étage 2",
    });
  });

  it("rejects U+0100 with a safe recovery message instead of transliteration", () => {
    const error = expectRoomingListError(() => parseRoomingList("guest,room\nĀlpha,101"));
    expect(error.userMessage).toBe(
      "Row 2 uses text this printable file cannot display; replace that guest or room label and try again.",
    );
  });

  it("omits benign unused fields from all returned data", () => {
    const result = parseRoomingList(
      "guest,room,meal preference,internal color\nAlpha,101,Vegan,Blue",
    );

    expect(result).toEqual({
      notices: [],
      packets: [
        {
          sourceRow: 2,
          guestLabel: "Alpha",
          roomLabel: "101",
        },
      ],
      sourceRowCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("Vegan");
    expect(JSON.stringify(result)).not.toContain("Blue");
  });

  it("parses the synthetic fixtures and returns deeply immutable fresh results", () => {
    const valid = parseRoomingList(fixture("valid-rooming-list.csv"));
    const review = parseRoomingList(fixture("review-rooming-list.csv"));

    expect(valid.packets).toHaveLength(3);
    expect(valid.notices).toEqual([]);
    expect(review.packets).toHaveLength(3);
    expect(review.notices.map((notice) => notice.sourceRow)).toEqual([2, 2, 3, 3, 4, 5, 6]);
    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.packets)).toBe(true);
    expect(Object.isFrozen(valid.packets[0])).toBe(true);
    expect(Object.isFrozen(valid.notices)).toBe(true);
    expect(parseRoomingList(fixture("valid-rooming-list.csv"))).not.toBe(valid);
  });
});
