import { describe, expect, it } from "vitest";
import type { RoomingListResult } from "../../src/core/rooming-list";
import { createPacketDocumentModel, PacketModelError } from "../../src/core/packet-model";

function cleanResult(): RoomingListResult {
  return {
    notices: [],
    packets: [
      { guestLabel: "Maya Ortiz", roomLabel: "0102", sourceRow: 3 },
      { guestLabel: "North Team", roomLabel: "205B", sourceRow: 2 },
    ],
    sourceRowCount: 2,
  };
}

describe("createPacketDocumentModel", () => {
  it("assigns stable packet sequences and preserves supplied display text", () => {
    const model = createPacketDocumentModel(cleanResult(), new Date("2026-07-28T00:00:00.000Z"));

    expect(model).toEqual({
      generatedAtIso: "2026-07-28T00:00:00.000Z",
      inserts: [
        {
          guestLabel: "Maya Ortiz",
          roomLabel: "0102",
          sequence: 1,
          sourceRow: 3,
        },
        {
          guestLabel: "North Team",
          roomLabel: "205B",
          sequence: 2,
          sourceRow: 2,
        },
      ],
      sourceRowCount: 2,
    });
  });

  it("does not copy source filenames, paths, ignored columns, or browser metadata", () => {
    const model = createPacketDocumentModel(cleanResult(), new Date("2026-07-28T00:00:00.000Z"));

    expect(Object.keys(model).sort()).toEqual(["generatedAtIso", "inserts", "sourceRowCount"]);
    expect(JSON.stringify(model)).not.toContain("csv");
  });

  it("blocks every result that still has a review notice", () => {
    const result = cleanResult();
    result.notices.push({
      kind: "duplicate",
      message: "Rows 2 and 4 repeat the same packet.",
      sourceRow: 2,
    });

    expect(() =>
      createPacketDocumentModel(result, new Date("2026-07-28T00:00:00.000Z")),
    ).toThrowError(PacketModelError);
  });

  it("blocks empty packet collections", () => {
    expect(() =>
      createPacketDocumentModel(
        { notices: [], packets: [], sourceRowCount: 0 },
        new Date("2026-07-28T00:00:00.000Z"),
      ),
    ).toThrowError("Replace the CSV because it has no packet rows ready to print.");
  });

  it("blocks invalid generated timestamps", () => {
    expect(() => createPacketDocumentModel(cleanResult(), new Date(Number.NaN))).toThrowError(
      "Choose the CSV again because the packet time could not be set.",
    );
  });

  it("returns fresh immutable values for each run", () => {
    const result = cleanResult();
    const first = createPacketDocumentModel(result, new Date("2026-07-28T00:00:00.000Z"));
    const second = createPacketDocumentModel(result, new Date("2026-07-28T00:00:00.000Z"));

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.inserts).not.toBe(second.inserts);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.inserts)).toBe(true);
  });
});
