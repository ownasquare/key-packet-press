import { type PDFFont, PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { PacketDocumentModel, PacketInsert } from "./packet-model";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const GUTTER = 18;
const CARD_WIDTH = 261;
const CARD_HEIGHT = 351;
const FOLD_HEIGHT = 175.5;
const INSERTS_PER_PAGE = 4;
const INDEX_ROWS_PER_PAGE = 20;

export type CommandSurface = "exterior" | "guide" | "index" | "interior";

export type CardCommand = Readonly<{
  foldY: number;
  height: number;
  kind: "card";
  width: number;
  x: number;
  y: number;
}>;

export type TextCommand = Readonly<{
  align?: "center" | "left" | "right";
  kind: "text";
  maxLines?: number;
  maxWidth: number;
  minSize?: number;
  size: number;
  surface: CommandSurface;
  text: string;
  weight?: "bold" | "regular";
  x: number;
  y: number;
}>;

export type RuleCommand = Readonly<{
  dashed?: boolean;
  kind: "rule";
  surface: CommandSurface;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}>;

export type PacketCommand = CardCommand | RuleCommand | TextCommand;

export type PacketPageModel = Readonly<{
  commands: ReadonlyArray<PacketCommand>;
  height: 792;
  kind: "index" | "inserts";
  width: 612;
}>;

export type PacketPdfResult = Readonly<{
  bytes: Uint8Array;
  filename: string;
  insertPageCount: number;
  totalPageCount: number;
}>;

function packetId(sequence: number): string {
  return `KP-${String(sequence).padStart(3, "0")}`;
}

function displayTimestamp(iso: string): string {
  return `Generated ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function insertCoordinates(index: number): { x: number; y: number } {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: MARGIN + column * (CARD_WIDTH + GUTTER),
    y: MARGIN + (1 - row) * (CARD_HEIGHT + GUTTER),
  };
}

function buildInsertCommands(
  insert: PacketInsert,
  indexOnPage: number,
  generatedAtIso: string,
): PacketCommand[] {
  const { x, y } = insertCoordinates(indexOnPage);
  const foldY = y + FOLD_HEIGHT;
  const centerX = x + CARD_WIDTH / 2;

  return [
    Object.freeze({
      foldY,
      height: CARD_HEIGHT,
      kind: "card" as const,
      width: CARD_WIDTH,
      x,
      y,
    }),
    Object.freeze({
      kind: "rule" as const,
      surface: "guide" as const,
      x1: x,
      x2: x + CARD_WIDTH,
      y1: foldY,
      y2: foldY,
      dashed: true,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 10,
      surface: "exterior" as const,
      text: packetId(insert.sequence),
      weight: "bold" as const,
      x: centerX,
      y: y + CARD_HEIGHT - 36,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxLines: 3,
      maxWidth: CARD_WIDTH - 36,
      minSize: 12,
      size: 19,
      surface: "exterior" as const,
      text: insert.guestLabel,
      weight: "bold" as const,
      x: centerX,
      y: y + CARD_HEIGHT - 76,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 8,
      surface: "guide" as const,
      text: "Fold room number inward before staging",
      x: centerX,
      y: foldY + 10,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 8,
      surface: "interior" as const,
      text: "SUPPLIED ROOM",
      weight: "bold" as const,
      x: centerX,
      y: foldY - 34,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxLines: 2,
      maxWidth: CARD_WIDTH - 36,
      minSize: 15,
      size: 30,
      surface: "interior" as const,
      text: insert.roomLabel,
      weight: "bold" as const,
      x: centerX,
      y: foldY - 66,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 8,
      surface: "interior" as const,
      text: "Not a current-room verification",
      x: centerX,
      y: y + 57,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 8,
      surface: "interior" as const,
      text: "Reprint after any room move",
      weight: "bold" as const,
      x: centerX,
      y: y + 40,
    }),
    Object.freeze({
      align: "center" as const,
      kind: "text" as const,
      maxWidth: CARD_WIDTH - 36,
      size: 7,
      surface: "interior" as const,
      text: displayTimestamp(generatedAtIso),
      x: centerX,
      y: y + 23,
    }),
  ];
}

function buildIndexPage(
  inserts: ReadonlyArray<PacketInsert>,
  generatedAtIso: string,
  pageNumber: number,
  pageCount: number,
): PacketPageModel {
  const commands: PacketCommand[] = [
    {
      align: "left",
      kind: "text",
      maxWidth: 540,
      size: 20,
      surface: "index",
      text: "INTERNAL ASSEMBLY INDEX",
      weight: "bold",
      x: MARGIN,
      y: 744,
    },
    {
      align: "left",
      kind: "text",
      maxWidth: 540,
      size: 10,
      surface: "index",
      text: "INTERNAL — REMOVE BEFORE GUEST HANDOFF",
      weight: "bold",
      x: MARGIN,
      y: 718,
    },
    {
      align: "left",
      kind: "text",
      maxWidth: 540,
      size: 9,
      surface: "index",
      text: "SECURE OR DESTROY AFTER ARRIVAL",
      weight: "bold",
      x: MARGIN,
      y: 700,
    },
    {
      align: "left",
      kind: "text",
      maxWidth: 540,
      size: 9,
      surface: "index",
      text: "Reprint after any room move",
      weight: "bold",
      x: MARGIN,
      y: 682,
    },
    {
      align: "left",
      kind: "text",
      maxWidth: 540,
      size: 8,
      surface: "index",
      text: displayTimestamp(generatedAtIso),
      x: MARGIN,
      y: 664,
    },
    {
      kind: "rule",
      surface: "index",
      x1: MARGIN,
      x2: PAGE_WIDTH - MARGIN,
      y1: 646,
      y2: 646,
    },
    {
      kind: "text",
      maxWidth: 55,
      size: 8,
      surface: "index",
      text: "PACKET",
      weight: "bold",
      x: 42,
      y: 626,
    },
    {
      kind: "text",
      maxWidth: 220,
      size: 8,
      surface: "index",
      text: "GUEST / PARTY",
      weight: "bold",
      x: 108,
      y: 626,
    },
    {
      kind: "text",
      maxWidth: 74,
      size: 8,
      surface: "index",
      text: "SUPPLIED ROOM",
      weight: "bold",
      x: 360,
      y: 626,
    },
    {
      kind: "text",
      maxWidth: 70,
      size: 8,
      surface: "index",
      text: "SOURCE ROW",
      weight: "bold",
      x: 484,
      y: 626,
    },
  ];

  inserts.forEach((insert, index) => {
    const y = 602 - index * 27;
    commands.push(
      {
        kind: "rule",
        surface: "index",
        x1: MARGIN,
        x2: PAGE_WIDTH - MARGIN,
        y1: y - 8,
        y2: y - 8,
      },
      {
        kind: "text",
        maxWidth: 55,
        size: 9,
        surface: "index",
        text: packetId(insert.sequence),
        weight: "bold",
        x: 42,
        y,
      },
      {
        kind: "text",
        maxLines: 1,
        maxWidth: 232,
        minSize: 8,
        size: 9,
        surface: "index",
        text: insert.guestLabel,
        x: 108,
        y,
      },
      {
        kind: "text",
        maxLines: 1,
        maxWidth: 94,
        minSize: 8,
        size: 9,
        surface: "index",
        text: insert.roomLabel,
        weight: "bold",
        x: 360,
        y,
      },
      {
        align: "right",
        kind: "text",
        maxWidth: 62,
        size: 9,
        surface: "index",
        text: String(insert.sourceRow),
        x: 552,
        y,
      },
    );
  });

  commands.push({
    align: "right",
    kind: "text",
    maxWidth: 180,
    size: 8,
    surface: "index",
    text: `Index ${pageNumber} of ${pageCount}`,
    x: PAGE_WIDTH - MARGIN,
    y: 24,
  });

  return Object.freeze({
    commands: Object.freeze(commands.map((command) => Object.freeze(command))),
    height: PAGE_HEIGHT,
    kind: "index",
    width: PAGE_WIDTH,
  });
}

export function buildPacketPages(model: PacketDocumentModel): ReadonlyArray<PacketPageModel> {
  if (model.inserts.length === 0) {
    throw new Error("The packet PDF needs at least one ready insert.");
  }

  const pages: PacketPageModel[] = [];
  for (let offset = 0; offset < model.inserts.length; offset += INSERTS_PER_PAGE) {
    const inserts = model.inserts.slice(offset, offset + INSERTS_PER_PAGE);
    const commands = inserts.flatMap((insert, index) =>
      buildInsertCommands(insert, index, model.generatedAtIso),
    );
    pages.push(
      Object.freeze({
        commands: Object.freeze(commands),
        height: PAGE_HEIGHT,
        kind: "inserts" as const,
        width: PAGE_WIDTH,
      }),
    );
  }

  const indexPageCount = Math.ceil(model.inserts.length / INDEX_ROWS_PER_PAGE);
  for (let page = 0; page < indexPageCount; page += 1) {
    pages.push(
      buildIndexPage(
        model.inserts.slice(page * INDEX_ROWS_PER_PAGE, (page + 1) * INDEX_ROWS_PER_PAGE),
        model.generatedAtIso,
        page + 1,
        indexPageCount,
      ),
    );
  }

  return Object.freeze(pages);
}

function splitLongToken(token: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const character of token) {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const originalWord of words) {
    const pieces =
      font.widthOfTextAtSize(originalWord, size) > maxWidth
        ? splitLongToken(originalWord, font, size, maxWidth)
        : [originalWord];
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = piece;
      } else {
        line = candidate;
      }
    }
  }

  if (line) {
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function fitText(command: TextCommand, font: PDFFont): { lines: string[]; size: number } {
  const minSize = command.minSize ?? command.size;
  const maxLines = command.maxLines ?? Number.POSITIVE_INFINITY;
  for (let size = command.size; size >= minSize; size -= 0.5) {
    const lines = wrapText(command.text, font, size, command.maxWidth);
    if (lines.length <= maxLines) {
      return { lines, size };
    }
  }
  throw new Error("A packet value is too long to print safely.");
}

function drawTextCommand(
  page: PDFPage,
  command: TextCommand,
  regular: PDFFont,
  bold: PDFFont,
): void {
  const font = command.weight === "bold" ? bold : regular;
  const { lines, size } = fitText(command, font);
  const lineHeight = size * 1.2;

  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, size);
    const x =
      command.align === "center"
        ? command.x - width / 2
        : command.align === "right"
          ? command.x - width
          : command.x;
    page.drawText(line, {
      color: rgb(0.08, 0.14, 0.13),
      font,
      size,
      x,
      y: command.y - index * lineHeight,
    });
  });
}

function renderPage(page: PDFPage, model: PacketPageModel, regular: PDFFont, bold: PDFFont): void {
  for (const command of model.commands) {
    if (command.kind === "card") {
      page.drawRectangle({
        borderColor: rgb(0.18, 0.29, 0.27),
        borderWidth: 0.8,
        height: command.height,
        width: command.width,
        x: command.x,
        y: command.y,
      });
      continue;
    }
    if (command.kind === "rule") {
      page.drawLine({
        color: rgb(0.42, 0.51, 0.48),
        dashArray: command.dashed ? [4, 4] : undefined,
        end: { x: command.x2, y: command.y2 },
        start: { x: command.x1, y: command.y1 },
        thickness: command.dashed ? 0.7 : 0.35,
      });
      continue;
    }
    drawTextCommand(page, command, regular, bold);
  }
}

export async function generatePacketPdf(model: PacketDocumentModel): Promise<PacketPdfResult> {
  const pages = buildPacketPages(model);
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = new Date(model.generatedAtIso);

  pdf.setTitle("Key Packet Press — Internal packet materials");
  pdf.setSubject("Fold-in key-packet inserts and staff-only assembly index");
  pdf.setAuthor("Key Packet Press");
  pdf.setCreator("Key Packet Press");
  pdf.setProducer("Key Packet Press");
  pdf.setKeywords(["key packets", "group arrival", "internal operations"]);
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  for (const pageModel of pages) {
    const page = pdf.addPage([pageModel.width, pageModel.height]);
    renderPage(page, pageModel, regular, bold);
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  const insertPageCount = pages.filter((page) => page.kind === "inserts").length;
  return Object.freeze({
    bytes: Uint8Array.from(bytes),
    filename: `key-packets-${model.generatedAtIso.slice(0, 10)}.pdf`,
    insertPageCount,
    totalPageCount: pages.length,
  });
}
