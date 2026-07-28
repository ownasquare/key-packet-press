export type PacketRow = {
  sourceRow: number;
  guestLabel: string;
  roomLabel: string;
};

export type ReviewNotice = {
  kind: "ambiguous-guest" | "duplicate" | "missing-guest" | "missing-room";
  message: string;
  sourceRow: number;
};

export type RoomingListResult = {
  notices: ReviewNotice[];
  packets: PacketRow[];
  sourceRowCount: number;
};

export class RoomingListError extends Error {
  userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "RoomingListError";
    this.userMessage = userMessage;
  }
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_ROWS = 2_000;
// These caps guarantee that even the widest supported Helvetica/WinAnsi glyph
// fits the single-line staff-index columns at the renderer's 8pt minimum.
const MAX_GUEST_CODE_POINTS = 28;
const MAX_ROOM_CODE_POINTS = 11;
const MAX_GUEST_LINES = 3;
const MAX_ROOM_LINES = 2;
const WIN_ANSI_EXTRA_CODE_POINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

const GUEST_ALIASES = new Set([
  "guest",
  "guest name",
  "name",
  "packet name",
  "party",
  "party name",
]);

const ROOM_ALIASES = new Set(["room", "room id", "room no", "room number"]);

type ParsedRecord = {
  fields: string[];
  sourceRow: number;
};

type NaturalToken =
  | {
      digits: string;
      kind: "number";
    }
  | {
      kind: "text";
      text: string;
    };

export function decodeRoomingList(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new RoomingListError("Choose a CSV file smaller than 2 MiB and try again.");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RoomingListError("Choose a UTF-8 CSV file and try again.");
  }

  return decoded.startsWith("\uFEFF") ? decoded.slice(1) : decoded;
}

export function parseRoomingList(csvText: string): RoomingListResult {
  assertTextSize(csvText);

  const text = csvText.startsWith("\uFEFF") ? csvText.slice(1) : csvText;
  const records = parseCsv(text);
  const header = records[0];
  if (!header) {
    throw new RoomingListError(
      "Add one guest or party column and one room column to the CSV and try again.",
    );
  }

  assertNoHiddenControls(records);

  const normalizedHeaders = header.fields.map((field) => normalizeHeader(field));
  if (normalizedHeaders.some(isSensitiveHeader)) {
    throw new RoomingListError(
      "Remove payment, identity, medical, or accessibility details and try again.",
    );
  }

  const guestColumns = matchingColumns(normalizedHeaders, GUEST_ALIASES);
  const roomColumns = matchingColumns(normalizedHeaders, ROOM_ALIASES);
  assertRequiredColumns(guestColumns, roomColumns);

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_DATA_ROWS) {
    throw new RoomingListError("Keep the CSV to 2,000 data rows or fewer and try again.");
  }

  const guestColumn = guestColumns[0];
  const roomColumn = roomColumns[0];
  if (guestColumn === undefined || roomColumn === undefined) {
    throw new RoomingListError(
      "Add one guest or party column and one room column to the CSV and try again.",
    );
  }

  const notices: ReviewNotice[] = [];
  const candidates: PacketRow[] = [];
  let sourceRowCount = 0;

  for (const record of dataRecords) {
    if (record.fields.every((field) => field.trim() === "")) {
      continue;
    }

    sourceRowCount += 1;
    const guestLabel = (record.fields[guestColumn] ?? "").trim();
    const roomLabel = (record.fields[roomColumn] ?? "").trim();

    if (guestLabel === "") {
      notices.push({
        kind: "missing-guest",
        message: `Row ${record.sourceRow} needs a guest or party label.`,
        sourceRow: record.sourceRow,
      });
    }
    if (roomLabel === "") {
      notices.push({
        kind: "missing-room",
        message: `Row ${record.sourceRow} needs a room identifier.`,
        sourceRow: record.sourceRow,
      });
    }
    if (guestLabel === "" || roomLabel === "") {
      continue;
    }

    assertDisplayValue(
      guestLabel,
      record.sourceRow,
      MAX_GUEST_CODE_POINTS,
      MAX_GUEST_LINES,
      "guest",
    );
    assertDisplayValue(roomLabel, record.sourceRow, MAX_ROOM_CODE_POINTS, MAX_ROOM_LINES, "room");

    candidates.push({
      sourceRow: record.sourceRow,
      guestLabel,
      roomLabel,
    });
  }

  if (candidates.length === 0) {
    throw new RoomingListError("Add at least one complete guest and room row and try again.");
  }

  addDuplicateNotices(candidates, notices);
  addAmbiguousGuestNotices(candidates, notices);

  notices.sort(compareNotices);
  candidates.sort(comparePackets);

  return freezeResult(notices, candidates, sourceRowCount);
}

function assertTextSize(text: string): void {
  if (text.length > MAX_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new RoomingListError("Choose a CSV file smaller than 2 MiB and try again.");
  }
}

function parseCsv(text: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let recordStartLine = 1;
  let inQuotes = false;
  let justClosedQuote = false;
  let recordHasSyntax = false;

  const finishField = () => {
    fields.push(field);
    field = "";
    justClosedQuote = false;
  };

  const finishRecord = () => {
    finishField();
    records.push({
      fields,
      sourceRow: recordStartLine,
    });
    fields = [];
    recordHasSyntax = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
        continue;
      }

      if (character === "\r") {
        if (text[index + 1] === "\n") {
          field += "\r\n";
          index += 1;
        } else {
          field += "\r";
        }
        line += 1;
        continue;
      }
      if (character === "\n") {
        field += "\n";
        line += 1;
        continue;
      }

      field += character;
      continue;
    }

    if (justClosedQuote) {
      if (character === " " || character === "\t") {
        field += character;
        continue;
      }
      if (character === ",") {
        finishField();
        recordHasSyntax = true;
        continue;
      }
      if (character === "\r" || character === "\n") {
        finishRecord();
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        line += 1;
        recordStartLine = line;
        continue;
      }
      throwMalformedCsv();
    }

    if (character === '"') {
      if (field.trim() !== "") {
        throwMalformedCsv();
      }
      inQuotes = true;
      recordHasSyntax = true;
      continue;
    }
    if (character === ",") {
      finishField();
      recordHasSyntax = true;
      continue;
    }
    if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      line += 1;
      recordStartLine = line;
      continue;
    }

    field += character;
    recordHasSyntax = true;
  }

  if (inQuotes) {
    throwMalformedCsv();
  }
  if (recordHasSyntax || fields.length > 0 || field !== "") {
    finishRecord();
  }

  return records;
}

function throwMalformedCsv(): never {
  throw new RoomingListError(
    "This CSV could not be read; export it again as UTF-8 CSV, then choose it here.",
  );
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, " ")
    .trim();
}

function matchingColumns(normalizedHeaders: string[], aliases: Set<string>): number[] {
  const matches: number[] = [];
  for (const [index, header] of normalizedHeaders.entries()) {
    if (aliases.has(header)) {
      matches.push(index);
    }
  }
  return matches;
}

function assertRequiredColumns(guestColumns: number[], roomColumns: number[]): void {
  if (guestColumns.length > 1) {
    throw new RoomingListError("Keep only one guest or party column in the CSV and try again.");
  }
  if (roomColumns.length > 1) {
    throw new RoomingListError("Keep only one room column in the CSV and try again.");
  }
  if (guestColumns.length === 0) {
    throw new RoomingListError("Add one guest or party column to the CSV and try again.");
  }
  if (roomColumns.length === 0) {
    throw new RoomingListError("Add one room column to the CSV and try again.");
  }
}

function isSensitiveHeader(header: string): boolean {
  const paymentPatterns = [
    /\bpayment\b/u,
    /\bcredit card\b/u,
    /\bdebit card\b/u,
    /\bcard number\b/u,
    /\bcvv\b/u,
    /\bcvc\b/u,
    /\bbank account\b/u,
    /\brouting number\b/u,
    /\bbilling\b/u,
  ];
  const identityPatterns = [
    /\bpassport\b/u,
    /\bgovernment id\b/u,
    /\bnational id\b/u,
    /\bdriver s license\b/u,
    /\bdriver license\b/u,
    /\bsocial security\b/u,
    /\bssn\b/u,
    /\btax id\b/u,
  ];
  const medicalPatterns = [
    /\bmedical\b/u,
    /\bhealth\b/u,
    /\bdiagnosis\b/u,
    /\bmedication\b/u,
    /\ballerg(?:y|ies)\b/u,
  ];
  const accessibilityPatterns = [
    /\baccessibility\b/u,
    /\baccess needs?\b/u,
    /\bspecial needs?\b/u,
    /\bdisability\b/u,
    /\bada notes?\b/u,
  ];

  return [
    ...paymentPatterns,
    ...identityPatterns,
    ...medicalPatterns,
    ...accessibilityPatterns,
  ].some((pattern) => pattern.test(header));
}

function assertNoHiddenControls(records: ParsedRecord[]): void {
  for (const record of records) {
    for (const field of record.fields) {
      if ([...field].some((character) => isHiddenControl(character))) {
        throw new RoomingListError(
          `Row ${record.sourceRow} contains hidden control text; replace that row and try again.`,
        );
      }
    }
  }
}

function isHiddenControl(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint === 0x0a || codePoint === 0x0d) {
    return false;
  }
  return (
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function assertDisplayValue(
  value: string,
  sourceRow: number,
  maxCodePoints: number,
  maxLines: number,
  role: "guest" | "room",
): void {
  const codePoints = [...value];
  const lineCount = value.split(/\r\n|\r|\n/u).length;
  if (codePoints.length > maxCodePoints || lineCount > maxLines) {
    const label = role === "guest" ? "guest or party label" : "room identifier";
    throw new RoomingListError(
      `Row ${sourceRow} has a ${label} that is too long; shorten it and try again.`,
    );
  }

  if (codePoints.some((character) => !isSupportedDisplayCharacter(character))) {
    throw new RoomingListError(
      `Row ${sourceRow} uses text this printable file cannot display; replace that guest or room label and try again.`,
    );
  }
}

function isSupportedDisplayCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint === 0x0a || codePoint === 0x0d) {
    return true;
  }
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0x00a0 && codePoint <= 0x00ff) ||
    WIN_ANSI_EXTRA_CODE_POINTS.has(codePoint)
  );
}

function comparisonKey(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function addDuplicateNotices(candidates: PacketRow[], notices: ReviewNotice[]): void {
  const groups = new Map<string, PacketRow[]>();
  for (const candidate of candidates) {
    const key = `${comparisonKey(candidate.guestLabel)}\u0000${comparisonKey(candidate.roomLabel)}`;
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    for (const candidate of group) {
      notices.push({
        kind: "duplicate",
        message: `Row ${candidate.sourceRow} repeats the same guest and room.`,
        sourceRow: candidate.sourceRow,
      });
    }
  }
}

function addAmbiguousGuestNotices(candidates: PacketRow[], notices: ReviewNotice[]): void {
  const groups = new Map<string, PacketRow[]>();
  for (const candidate of candidates) {
    const key = comparisonKey(candidate.guestLabel);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  for (const group of groups.values()) {
    const rooms = new Set(group.map((candidate) => comparisonKey(candidate.roomLabel)));
    if (rooms.size < 2) {
      continue;
    }
    for (const candidate of group) {
      notices.push({
        kind: "ambiguous-guest",
        message: `Row ${candidate.sourceRow} repeats a guest or party label across different rooms.`,
        sourceRow: candidate.sourceRow,
      });
    }
  }
}

function compareNotices(left: ReviewNotice, right: ReviewNotice): number {
  const rowDifference = left.sourceRow - right.sourceRow;
  if (rowDifference !== 0) {
    return rowDifference;
  }

  const kindOrder: Record<ReviewNotice["kind"], number> = {
    duplicate: 0,
    "ambiguous-guest": 1,
    "missing-guest": 2,
    "missing-room": 3,
  };
  return kindOrder[left.kind] - kindOrder[right.kind];
}

function comparePackets(left: PacketRow, right: PacketRow): number {
  const roomDifference = compareNatural(left.roomLabel, right.roomLabel);
  if (roomDifference !== 0) {
    return roomDifference;
  }

  const guestDifference = compareCodePoints(
    left.guestLabel.toLowerCase(),
    right.guestLabel.toLowerCase(),
  );
  if (guestDifference !== 0) {
    return guestDifference;
  }

  return left.sourceRow - right.sourceRow;
}

function compareNatural(left: string, right: string): number {
  const leftTokens = tokenizeNatural(left);
  const rightTokens = tokenizeNatural(right);
  const tokenCount = Math.min(leftTokens.length, rightTokens.length);

  for (let index = 0; index < tokenCount; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    if (!leftToken || !rightToken) {
      continue;
    }

    let difference: number;
    if (leftToken.kind === "number" && rightToken.kind === "number") {
      difference = compareDigitRuns(leftToken.digits, rightToken.digits);
    } else {
      const leftText = leftToken.kind === "number" ? leftToken.digits : leftToken.text;
      const rightText = rightToken.kind === "number" ? rightToken.digits : rightToken.text;
      difference = compareCodePoints(leftText, rightText);
    }
    if (difference !== 0) {
      return difference;
    }
  }

  return leftTokens.length - rightTokens.length;
}

function tokenizeNatural(value: string): NaturalToken[] {
  const characters = [...value.toLowerCase()];
  const tokens: NaturalToken[] = [];
  let index = 0;

  while (index < characters.length) {
    const character = characters[index] ?? "";
    const isDigit = character >= "0" && character <= "9";
    let token = character;
    index += 1;

    while (index < characters.length) {
      const next = characters[index] ?? "";
      const nextIsDigit = next >= "0" && next <= "9";
      if (nextIsDigit !== isDigit) {
        break;
      }
      token += next;
      index += 1;
    }

    if (isDigit) {
      tokens.push({ digits: token, kind: "number" });
    } else {
      tokens.push({ kind: "text", text: token });
    }
  }

  return tokens;
}

function compareDigitRuns(left: string, right: string): number {
  const leftSignificant = left.replace(/^0+/u, "") || "0";
  const rightSignificant = right.replace(/^0+/u, "") || "0";
  const lengthDifference = leftSignificant.length - rightSignificant.length;
  if (lengthDifference !== 0) {
    return lengthDifference;
  }
  return compareCodePoints(leftSignificant, rightSignificant);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map((character) => character.codePointAt(0) ?? 0);
  const rightPoints = [...right].map((character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}

function freezeResult(
  notices: ReviewNotice[],
  packets: PacketRow[],
  sourceRowCount: number,
): RoomingListResult {
  const frozenNotices = notices.map((notice) => Object.freeze({ ...notice })) as ReviewNotice[];
  const frozenPackets = packets.map((packet) => Object.freeze({ ...packet })) as PacketRow[];

  return Object.freeze({
    notices: Object.freeze(frozenNotices) as unknown as ReviewNotice[],
    packets: Object.freeze(frozenPackets) as unknown as PacketRow[],
    sourceRowCount,
  });
}
