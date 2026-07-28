# Key Packet Press

Key Packet Press turns one finalized rooming-list CSV into a printable PDF containing privacy-aware
fold-in key-packet inserts and a staff-only assembly index. It runs as a local browser tool: the CSV
is read in browser memory, and the application code does not upload it or call an external API.

The validated source release is public at
[ownasquare/key-packet-press](https://github.com/ownasquare/key-packet-press). GitHub publication is
source-distribution proof, not a hosted application or production deployment. See
[the current completion status](docs/key-packet-press/completion-status.md) for exact validation
and publication evidence.

## What it does

- Accepts exactly one finalized UTF-8 CSV, up to 2 MiB and 2,000 data rows.
- Finds one guest or party column and one room column from documented header aliases.
- Preserves the supplied labels, checks rows, and stops before PDF generation when review is needed.
- Sorts ready packets deterministically by room, guest or party label, and source row.
- Produces four fold-in inserts per US Letter page plus staff-only index pages.
- Generates the PDF locally with `pdf-lib` and its built-in Helvetica StandardFonts.
- Keeps room identifiers off the closed packet face and browser result preview.
- Marks the internal room surface and index with stale-room and secure-handling warnings.

It does **not** assign rooms, verify current room state or occupancy, encode keys, verify guest
identity, authorize access, modify a property-management system, or guarantee privacy or security.

## Minimum-interaction workflow

1. Drop a finalized CSV onto the file surface, or open the file chooser and select it.
2. Processing begins automatically because the local transformation is deterministic,
   non-destructive, and replaceable.
3. If the file is ready, review the closed-face preview and select **Download packet PDF**.
4. If the file is blocked, correct the named source rows and replace the CSV.

The file selection supplies the necessary source data. The download action is also necessary: it
lets the operator decide when the browser writes the generated artifact. There is no redundant
Run, Continue, Next, result-navigation, setup, account, mapping, or confirmation step.

## CSV contract

Exactly one header from each group is required:

| Role | Accepted aliases |
|---|---|
| Guest or party | `guest`, `guest name`, `name`, `packet name`, `party`, `party name` |
| Room | `room`, `room id`, `room no`, `room number` |

Header matching ignores case, punctuation, underscores, and surrounding whitespace, so
`guest_name` and `room_number` also match. Extra columns are not carried into the packet model or
PDF, but prohibited sensitive headers cause the entire file to be rejected.

Synthetic example:

```csv
guest_name,room_number
Northwind Tour,0102
Maya Ortiz,0205B
```

PDF generation is blocked when the file contains:

- a missing guest or party label;
- a missing room identifier;
- a repeated guest-and-room pair after case and whitespace normalization;
- the same normalized guest or party label mapped to different rooms;
- a header indicating payment, government identity, medical, or accessibility details;
- hidden control or bidirectional-control text;
- characters outside the WinAnsi-compatible PDF text repertoire;
- a guest label over 28 code points or three lines;
- a room identifier over 11 code points or two lines; or
- malformed CSV, invalid UTF-8, too many rows, an oversized file, or no complete packet row.

The exact parsing, comparison, character, and output rules are in
[the data contract](docs/key-packet-press/data-contract.md).

## PDF handling

Each insert prints a packet sequence and guest or party label on the exterior. The supplied room
identifier prints only on the inward-folded surface. The assembly index contains packet sequence,
guest or party label, supplied room, and source row and is marked:

- `INTERNAL — REMOVE BEFORE GUEST HANDOFF`
- `SECURE OR DESTROY AFTER ARRIVAL`
- `Reprint after any room move`

The downloaded PDF is not encrypted. Treat it and the assembly index as sensitive operational
material. Remove the index before guest handoff, secure printed materials, and regenerate the set
after any room move. More limits are documented in
[privacy and safety limits](docs/key-packet-press/privacy-safety-limits.md).

## Requirements

- Node.js 20.19 or newer
- npm with the committed lockfile
- A modern browser with ES modules, File and Blob APIs, object URLs, and programmatic downloads

The current automated browser evidence uses Playwright Chromium across desktop, tablet, and phone
viewports in light and dark appearance. Firefox and WebKit have not yet been evidenced.

## Local development

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4186`.

Useful commands:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:component
npm run build
npm run preview
npm run test:e2e
npm run audit
npm run validate
npm audit --audit-level=high
```

`test:component` records that a separate component-test layer is not applicable to this
framework-free UI. Playwright is the E2E runner.

`npm run audit` verifies the focused documentation tree, local-only source boundary, concise file
workflow, and permissive dependency licenses. It is one release gate, not a substitute for the full
validation and evidence described in
[completion status](docs/key-packet-press/completion-status.md).

## Local PDF generation and character compatibility

The PDF module is lazy-loaded only after a CSV passes review. It renders entirely in browser memory
with `pdf-lib` and the built-in `StandardFonts.Helvetica` and
`StandardFonts.HelveticaBold` fonts. No font file, font service, upload, or external document
conversion is involved.

PDF StandardFonts use WinAnsi encoding. Guest and room labels therefore accept printable ASCII,
Latin-1, and the defined Windows-1252 extension characters supported by that encoding. Other
printable code points fail closed with a row-specific correction message; the app does not
transliterate or silently replace them. See [the data contract](docs/key-packet-press/data-contract.md)
for the exact repertoire.

## Documentation

- [Product](docs/key-packet-press/product.md)
- [Architecture](docs/key-packet-press/architecture.md)
- [Data contract](docs/key-packet-press/data-contract.md)
- [Privacy and safety limits](docs/key-packet-press/privacy-safety-limits.md)
- [Monetization hypothesis](docs/key-packet-press/monetization-hypothesis.md)
- [Completion status](docs/key-packet-press/completion-status.md)

## Proof boundaries

The repository contains an implementation, automated tests, and local proof artifacts. It does not
currently establish hosted behavior, production behavior, provider integration, buyer intent,
payment, demand, usage, revenue, or product-market fit.

## License

MIT. See [LICENSE](LICENSE).
