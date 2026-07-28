# Key Packet Press validation report

Validated locally on 2026-07-27 PDT / 2026-07-28 UTC.

## Environment

- macOS 26.3 (`25D5112c`)
- npm execution environment: Node.js 23.6.0 and npm 11.6.0
- Browser runner: Playwright 1.62.0 with Chromium
- Test data: synthetic CSV fixtures and deterministic synthetic PDF scenarios only
- Network boundary: localhost application traffic only; the E2E request ledger was empty for
  non-local hosts

## Final passing gates

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 74 packages installed and audit reported zero vulnerabilities |
| `npm run validate` | Passed from start to finish |
| `npm audit --audit-level=high` | Passed; zero vulnerabilities |
| `npm ls --all` | Passed with exit code 0 |
| `npm pack --dry-run --json` | Passed; 18 package entries including the built app and focused product docs |
| `npm run proof:pdf` | Passed; six deterministic synthetic PDFs generated |
| `git diff --check` | Passed |

`npm run validate` included:

- Biome format check: 20 files, no changes required
- Biome lint: 21 files, no changes required
- TypeScript: passed with no emitted output
- Vitest: 64/64 tests passed across four files
- Component-test disposition: passed; the framework-free UI has no React component layer
- Vite production build: passed
- Release audit: passed for required files, secrets, dependency licenses, local-only source, and
  built HTML/JavaScript/CSS
- Playwright: 6/6 projects passed

The first complete-validation attempt stopped before tests because Biome requested one mechanical
format change in the new bundle-audit array. `npm run format` changed that array only. The complete
validation command then passed from the beginning.

## Browser workflow proof

The six Playwright projects were:

- desktop light and dark
- tablet light and dark
- phone light and dark

The suite proved:

- selecting or dropping the CSV starts processing automatically
- a clean CSV renders the result inline without a separate result-opening action
- the phone download action is inside the initial viewport
- the downloaded artifact is a parseable two-page PDF with the expected title and subject
- review notices fail closed with no download action
- malformed CSV recovery is short and direct
- browser previews do not contain supplied room identifiers
- axe found no serious, critical, or color-contrast violations
- the document has no horizontal overflow
- cookies, local storage, and session storage remain empty
- no console error, page error, or non-local request occurred
- keyboard focus indicators are visibly present on both interactive controls

All 11 current screenshots under `proof/browser/` were individually inspected after the final
Playwright run. No blank page, exception overlay, clipped control, horizontal overflow, room leak,
contrast defect, misleading current-room claim, or redundant interaction was observed.

## PDF proof

Six PDFs were generated twice from a fixed injected timestamp. SHA-256 hashes matched across both
runs:

| Artifact | SHA-256 | Pages |
| --- | --- | ---: |
| `proof/pdf/01-one-packet.pdf` | `874ec53ad0918a4a0b5d8d1a1e1e9ab062280aa7029472caff7fa05cd8e75ada` | 2 |
| `proof/pdf/04-four-packets.pdf` | `61e3e141cc1b7f4df1c4357e39495129f6675ff9ba7b0ad19cd2dabdcde582e3` | 2 |
| `proof/pdf/05-five-packets-with-staff-index.pdf` | `9deda019b1ce00ba5ba4861c92cea5718755c3ef21cc3e33a8ce11bd26e52861` | 3 |
| `proof/pdf/20-index-row-boundary.pdf` | `ff0132d85035b40854171629fbacce92c67b93bf27182662301161235be24e87` | 6 |
| `proof/pdf/21-index-page-overflow.pdf` | `01dadb4f1448030330ddf12a6096e57d5a89bc1d42011392a20f38d9de1bbfb4` | 8 |
| `proof/pdf/longest-practical-guest-label.pdf` | `70762deec1410c62fc6c9e1bf7e120de7f014ec2b1c23e16339c52b55c584b12` | 2 |

`pdfinfo` read back every file as unencrypted US Letter PDF 1.7 with no forms or JavaScript. All 23
rendered PNG pages were individually inspected. Text was visible; insert borders and fold lines
were complete; room identifiers stayed below the fold on exterior sheets; staff-index headers and
handling warnings repeated on overflow pages; and the proven 28-character guest / 11-character
room boundary fit without truncation.

## Audit and warning triage

- Dependency-license audit passed for every locked package.
- `npm ls --all` listed expected platform and optional-feature packages as unmet optional
  dependencies; the command exited 0 and the installed macOS ARM64 packages were present.
- The built-bundle audit allows one exact static `pdf-lib` project-metadata URL string. It does not
  make a request. All other absolute or protocol-relative remote URL literals remain blocked.
- Vite's local module-preload polyfill contains `fetch` for same-origin chunks. Source code forbids
  network APIs, the built bundle forbids remote URL literals, and Playwright independently proved
  that no non-local request occurred.
- No failing test, product warning, audit result, or accessibility violation was suppressed.
  Playwright only normalizes inherited terminal color variables.

## Proof boundaries

| Field | Status |
| --- | --- |
| Local artifact | Passed |
| Local workflow | Passed with synthetic CSV and downloaded-PDF readback |
| Browser proof | Passed |
| PDF render proof | Passed |
| GitHub publication | Pending at this report stage |
| Hosted application | Not attempted |
| Production application | Not attempted |
| Provider integration | Not attempted |
| Payment or revenue | Not attempted |
| Buyer, usage, or demand | Not proven |
