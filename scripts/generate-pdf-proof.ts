import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPacketDocumentModel } from "../src/core/packet-model";
import { generatePacketPdf } from "../src/core/packet-pdf";
import { parseRoomingList } from "../src/core/rooming-list";

const FIXED_GENERATED_AT = new Date("2026-07-28T00:00:00.000Z");
const outputDirectory = fileURLToPath(new URL("../proof/pdf/", import.meta.url));

type SyntheticRow = Readonly<{
  guestLabel: string;
  roomLabel: string;
}>;

type Scenario = Readonly<{
  filename: string;
  rows: ReadonlyArray<SyntheticRow>;
}>;

function numberedRows(count: number, prefix: string): SyntheticRow[] {
  return Array.from({ length: count }, (_, index) => ({
    guestLabel: `${prefix} Party ${String(index + 1).padStart(2, "0")}`,
    roomLabel: `B-${String(index + 101)}`,
  }));
}

function csvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function syntheticCsv(rows: ReadonlyArray<SyntheticRow>): string {
  return [
    "packet name,room number",
    ...rows.map(({ guestLabel, roomLabel }) => [guestLabel, roomLabel].map(csvField).join(",")),
  ].join("\n");
}

const scenarios: ReadonlyArray<Scenario> = [
  {
    filename: "01-one-packet.pdf",
    rows: [{ guestLabel: "Synthetic Harbor Party", roomLabel: "A-101" }],
  },
  {
    filename: "04-four-packets.pdf",
    rows: numberedRows(4, "Synthetic Cedar"),
  },
  {
    filename: "05-five-packets-with-staff-index.pdf",
    rows: numberedRows(5, "Synthetic Summit"),
  },
  {
    filename: "20-index-row-boundary.pdf",
    rows: numberedRows(20, "Synthetic Boundary"),
  },
  {
    filename: "21-index-page-overflow.pdf",
    rows: numberedRows(21, "Synthetic Overflow"),
  },
  {
    filename: "longest-practical-guest-label.pdf",
    rows: [{ guestLabel: "@".repeat(28), roomLabel: "@".repeat(11) }],
  },
];

await mkdir(outputDirectory, { recursive: true });

for (const scenario of scenarios) {
  const parsed = parseRoomingList(syntheticCsv(scenario.rows));
  const model = createPacketDocumentModel(parsed, new Date(FIXED_GENERATED_AT));
  const result = await generatePacketPdf(model);
  const outputPath = fileURLToPath(
    new URL(scenario.filename, new URL("../proof/pdf/", import.meta.url)),
  );

  await writeFile(outputPath, result.bytes);
  console.log(
    `${scenario.filename}: ${scenario.rows.length} packet(s), ${result.insertPageCount} insert page(s), ${result.totalPageCount} total page(s), ${result.bytes.byteLength} bytes`,
  );
}
