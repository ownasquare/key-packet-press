import type { RoomingListResult } from "./rooming-list";

export type PacketInsert = Readonly<{
  guestLabel: string;
  roomLabel: string;
  sequence: number;
  sourceRow: number;
}>;

export type PacketDocumentModel = Readonly<{
  generatedAtIso: string;
  inserts: ReadonlyArray<PacketInsert>;
  sourceRowCount: number;
}>;

export class PacketModelError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "PacketModelError";
    this.userMessage = userMessage;
  }
}

export function createPacketDocumentModel(
  result: RoomingListResult,
  generatedAt: Date,
): PacketDocumentModel {
  if (result.notices.length > 0) {
    throw new PacketModelError("Correct the listed rows, then replace the CSV.");
  }

  if (result.packets.length === 0) {
    throw new PacketModelError("Replace the CSV because it has no packet rows ready to print.");
  }

  if (Number.isNaN(generatedAt.getTime())) {
    throw new PacketModelError("Choose the CSV again because the packet time could not be set.");
  }

  const inserts = result.packets.map((packet, index) =>
    Object.freeze({
      guestLabel: packet.guestLabel,
      roomLabel: packet.roomLabel,
      sequence: index + 1,
      sourceRow: packet.sourceRow,
    }),
  );

  return Object.freeze({
    generatedAtIso: generatedAt.toISOString(),
    inserts: Object.freeze(inserts),
    sourceRowCount: result.sourceRowCount,
  });
}
