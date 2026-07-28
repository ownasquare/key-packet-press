import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PacketDocumentModel } from "../../src/core/packet-model";
import { buildPacketPages, generatePacketPdf, type TextCommand } from "../../src/core/packet-pdf";

function makeModel(count: number): PacketDocumentModel {
  return Object.freeze({
    generatedAtIso: "2026-07-28T00:00:00.000Z",
    inserts: Object.freeze(
      Array.from({ length: count }, (_, index) =>
        Object.freeze({
          guestLabel: `Guest ${String(index + 1).padStart(3, "0")}`,
          roomLabel: String(101 + index).padStart(4, "0"),
          sequence: index + 1,
          sourceRow: index + 2,
        }),
      ),
    ),
    sourceRowCount: count,
  });
}

function textCommands(model: PacketDocumentModel): TextCommand[] {
  return buildPacketPages(model).flatMap((page) =>
    page.commands.filter((command): command is TextCommand => command.kind === "text"),
  );
}

describe("buildPacketPages", () => {
  it.each([
    [1, 1, 1],
    [4, 1, 1],
    [5, 2, 1],
    [33, 9, 2],
  ])(
    "paginates %i packets into %i insert page(s) and %i index page(s)",
    (count, insertPageCount, indexPageCount) => {
      const pages = buildPacketPages(makeModel(count));

      expect(pages.filter((page) => page.kind === "inserts")).toHaveLength(insertPageCount);
      expect(pages.filter((page) => page.kind === "index")).toHaveLength(indexPageCount);
      expect(pages.every((page) => page.width === 612 && page.height === 792)).toBe(true);
    },
  );

  it("keeps supplied room identifiers off every exterior panel", () => {
    const model = makeModel(5);
    const exteriorText = textCommands(model)
      .filter((command) => command.surface === "exterior")
      .map((command) => command.text);

    for (const insert of model.inserts) {
      expect(exteriorText).toContain(insert.guestLabel);
      expect(exteriorText).not.toContain(insert.roomLabel);
    }
  });

  it("puts supplied rooms and stale-room warnings only inside or on staff index pages", () => {
    const model = makeModel(5);
    const commands = textCommands(model);
    const interiorText = commands
      .filter((command) => command.surface === "interior")
      .map((command) => command.text);
    const indexText = commands
      .filter((command) => command.surface === "index")
      .map((command) => command.text);

    for (const insert of model.inserts) {
      expect(interiorText).toContain(insert.roomLabel);
      expect(indexText).toContain(insert.roomLabel);
    }
    expect(interiorText).toContain("Not a current-room verification");
    expect(interiorText).toContain("Reprint after any room move");
  });

  it("repeats staff-only handling and room-move warnings on every index page", () => {
    const pages = buildPacketPages(makeModel(33)).filter((page) => page.kind === "index");

    for (const page of pages) {
      const text = page.commands
        .filter((command): command is TextCommand => command.kind === "text")
        .map((command) => command.text);
      expect(text).toContain("INTERNAL — REMOVE BEFORE GUEST HANDOFF");
      expect(text).toContain("SECURE OR DESTROY AFTER ARRIVAL");
      expect(text).toContain("Reprint after any room move");
      expect(text).toContain("Generated 2026-07-28 00:00 UTC");
    }
  });

  it("uses exact letter, margin, gutter, and four-card geometry", () => {
    const insertPage = buildPacketPages(makeModel(4))[0];
    const cards = insertPage.commands.filter((command) => command.kind === "card");

    expect(cards).toHaveLength(4);
    expect(cards).toEqual([
      expect.objectContaining({ x: 36, y: 405, width: 261, height: 351 }),
      expect.objectContaining({ x: 315, y: 405, width: 261, height: 351 }),
      expect.objectContaining({ x: 36, y: 36, width: 261, height: 351 }),
      expect.objectContaining({ x: 315, y: 36, width: 261, height: 351 }),
    ]);
    expect(cards.every((card) => card.foldY === card.y + 175.5)).toBe(true);
  });

  it("does not place a source filename or unrelated CSV field into its drawing model", () => {
    const model = makeModel(1);
    const serialized = JSON.stringify(buildPacketPages(model));

    expect(serialized).not.toContain("rooming-list.csv");
    expect(serialized).not.toContain("payment");
    expect(serialized).not.toContain("medical");
  });
});

describe("generatePacketPdf", () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [33, 11],
  ])("creates a parseable PDF for %i packets with %i pages", async (count, pages) => {
    const result = await generatePacketPdf(makeModel(count));
    const loaded = await PDFDocument.load(result.bytes);

    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    expect(loaded.getPageCount()).toBe(pages);
    expect(result.totalPageCount).toBe(pages);
    expect(result.insertPageCount).toBe(Math.ceil(count / 4));
    expect(result.filename).toBe("key-packets-2026-07-28.pdf");
    expect(loaded.getTitle()).toBe("Key Packet Press — Internal packet materials");
    expect(loaded.getSubject()).toBe("Fold-in key-packet inserts and staff-only assembly index");
  });

  it("sets deterministic metadata from the injected generation time", async () => {
    const first = await PDFDocument.load((await generatePacketPdf(makeModel(1))).bytes, {
      updateMetadata: false,
    });
    const second = await PDFDocument.load((await generatePacketPdf(makeModel(1))).bytes, {
      updateMetadata: false,
    });

    expect(first.getCreationDate()).toEqual(new Date("2026-07-28T00:00:00.000Z"));
    expect(first.getModificationDate()).toEqual(new Date("2026-07-28T00:00:00.000Z"));
    expect(second.getCreationDate()).toEqual(first.getCreationDate());
    expect(second.getModificationDate()).toEqual(first.getModificationDate());
  });

  it("renders the widest allowed labels without truncating the staff index", async () => {
    const model: PacketDocumentModel = Object.freeze({
      generatedAtIso: "2026-07-28T00:00:00.000Z",
      inserts: Object.freeze([
        Object.freeze({
          guestLabel: "@".repeat(28),
          roomLabel: "@".repeat(11),
          sequence: 1,
          sourceRow: 2,
        }),
      ]),
      sourceRowCount: 1,
    });

    const result = await generatePacketPdf(model);
    const loaded = await PDFDocument.load(result.bytes);

    expect(loaded.getPageCount()).toBe(2);
  });
});
