# Architecture

## Overview

Key Packet Press is a static TypeScript and Vite browser application. Runtime work stays in the
browser. The source contains no application-initiated fetch, WebSocket, beacon, or telemetry path,
and it has no server-side data component.

Data moves through a one-way pipeline:

```text
File or drop
  -> byte and UTF-8 checks
  -> CSV parsing and review notices
  -> immutable packet document model
  -> lazy-loaded PDF layout and rendering
  -> in-memory Blob URL
  -> operator-triggered download
```

## Module boundaries

| Module | Responsibility |
|---|---|
| `index.html` | Accessible file surface, status region, result mount, and static product boundary |
| `src/main.ts` | Application startup |
| `src/app.ts` | File/drop events, state transitions, race protection, lazy PDF import, object URLs, download |
| `src/core/rooming-list.ts` | Strict decoding, CSV parsing, header checks, value bounds, review notices, stable sorting |
| `src/core/packet-model.ts` | Fail-closed transition from parsed data to immutable sequenced inserts and injected timestamp |
| `src/core/packet-pdf.ts` | Letter-page command model, StandardFonts selection, PDF rendering, metadata, and filename |
| `src/styles.css` | Responsive light/dark presentation and interaction states |
| `tests/unit` | Parser, model, PDF, and UI state behavior |
| `tests/e2e` | Playwright browser workflow, accessibility, privacy, recovery, and download readback |

## Input and resource bounds

- Exactly one CSV per processing attempt.
- Extension `.csv` or MIME type `text/csv` or `application/csv`.
- Strict UTF-8 with one optional leading byte-order mark.
- Maximum 2 MiB at both File and decoded-text boundaries.
- Maximum 2,000 data records after the header.
- Exactly one guest or party column and one room column.
- Guest labels: 28 code points and three lines maximum.
- Room identifiers: 11 code points and two lines maximum.
- A WinAnsi-compatible printable-character allowlist matching the built-in PDF StandardFonts.

These bounds limit accidental resource use and make layout failures explicit. They are not a
malware scanner or a denial-of-service guarantee.

## Determinism

Header resolution and review rules are fixed. Display labels are trimmed at their edges but are not
silently corrected, merged, transliterated, or truncated. Comparison keys lowercase and collapse
whitespace only for duplicate and ambiguity checks. Ready rows sort by a custom ASCII-digit natural
room order, then case-folded guest label, then source row.

`createPacketDocumentModel` receives the generation time as a dependency. The ISO timestamp becomes
PDF metadata, the printed generated timestamp, and the date portion of the filename. Tests inject a
fixed time, which makes metadata and naming reproducible without pretending that PDF bytes are a
source-of-truth room snapshot.

## Fail-closed review transition

The parser may retain complete candidate rows while reporting missing, duplicate, or ambiguous
rows. The application treats any notice as blocking and does not call PDF generation. This avoids
printing a partial set that might appear complete to an operator.

Malformed encoding or CSV, prohibited headers, hidden controls, unsupported characters, excessive
length, missing required columns, size overflow, row overflow, and zero complete rows are fatal
file errors with correction-oriented messages.

## Minimum-interaction decision

Processing starts immediately after drop or selection because it is local, non-destructive, and can
be replaced. A separate Run action would repeat the already-expressed intent. Results render in the
same surface, so Continue, Next, and view-results actions would also be redundant.

The download remains explicit because writing the artifact is an operator-controlled side effect.
When review is blocked, replacing the corrected source is an essential recovery step.

There is no mapping UI. The product intentionally supports a narrow set of documented header
aliases; ambiguous or absent roles fail with a correction message. Adding a mapping screen would
increase interaction cost and invite interpretation of sensitive or unknown columns.

## Concurrency and object-URL lifecycle

Each processing attempt increments a token. Async read or PDF work checks that token before
rendering, so a slower earlier file cannot overwrite a newer result.

Only the latest PDF object URL is retained. It is revoked:

- before a replacement attempt;
- if a stale or destroyed task creates an unused URL;
- when the controller is destroyed; and
- on `beforeunload`.

If the browser download click throws, the current URL remains available for a retry.

## PDF composition

- Page size: US Letter, 612 by 792 PDF points.
- Page margin: 36 points.
- Insert grid: two columns by two rows, four inserts per page.
- Insert size: 261 by 351 points.
- Gutter: 18 points.
- Fold position: 175.5 points from the insert bottom.
- Staff index: 20 packet rows per page, emitted after all insert pages.

At the staff index's 8-point minimum text size, the widest allowed WinAnsi glyph is approximately
8.12 points. The 28-code-point guest cap fits inside the 232-point guest column, and the
11-code-point room cap fits inside the 94-point room column.

The exterior contains packet sequence and guest or party label. The supplied room is rendered only
on the inward surface and staff index. Every index page includes internal-only, secure-or-destroy,
and room-move warnings. The source filename and unused CSV fields never enter the document model.

The PDF is generated with `pdf-lib` and the built-in `StandardFonts.Helvetica` and
`StandardFonts.HelveticaBold` fonts. No separate font file, custom font runtime, remote font
service, or external conversion provider is part of the PDF path.

## Lazy-loading and local PDF generation

`src/app.ts` dynamically imports the PDF module only after a valid CSV passes review. Lazy loading
keeps the PDF renderer out of the initial application path. Layout, StandardFonts selection, PDF
serialization, Blob creation, and download preparation then happen in browser memory without
uploading the rooming list.

The StandardFonts use WinAnsi encoding. The parser accepts only the matching printable repertoire
and fails closed before PDF generation for other code points. This is a deliberate compatibility
boundary: values are preserved exactly when accepted and are never transliterated or silently
replaced.

## Threat model and limits

The main foreseeable disclosure is an unnecessary open association between a guest or party and a
room. The fold-in design, closed-face preview, staff-only index markings, and source-field omission
reduce exposure; they do not eliminate it.

The application does not authenticate users, encrypt PDFs, enforce print handling, validate that a
room is current, inspect the meaning of arbitrary cell values, or control a downloaded file.
Header screening is a coarse fail-closed guard, not a data-loss-prevention system. See
[privacy and safety limits](privacy-safety-limits.md).
