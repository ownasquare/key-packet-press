# Product

## Product statement

Key Packet Press helps a hotel group-arrival or front-office coordinator turn one finalized
rooming-list CSV into ready-to-fold key-packet inserts and a staff assembly index. Its purpose is to
reduce manual packet sorting while limiting unnecessary open display of guest-room associations.

The triggering moment is narrow: the list is final, physical packet assembly is about to begin, and
the operator needs a repeatable printable artifact.

## Intended operator and job

| Dimension | Current definition |
|---|---|
| Operator | Hotel group-arrival or front-office coordinator |
| Arrival types | Tour, wedding, team, conference, or similar coordinated group |
| Trigger | A user-owned rooming list is finalized immediately before packet assembly |
| Input | One local CSV with a guest or party label and supplied room identifier |
| Transformation | Validate, fail closed on unsafe ambiguity, stable-sort, and compose a PDF |
| Outcome | Fold-in packet inserts plus a staff-only assembly index |
| Surface | Local browser file tool |

## Essential workflow

1. Drop or select the finalized CSV.
2. The safe local transformation starts automatically.
3. Ready output or correction notices render in the same surface.
4. Download the PDF when ready, or correct the identified rows and replace the file.

This is the current minimum-interaction contract. Selection is necessary to supply the operator's
data; download is necessary to authorize the artifact write; correction is necessary only when the
input fails a safety rule. No separate Run or view-results action is needed.

## User-visible states

- **Ready for file:** one file surface and concise input requirements.
- **Processing:** announces that the CSV is being checked locally.
- **Review blocked:** lists source rows requiring correction and produces no PDF.
- **File error:** provides a specific replacement action for type, size, encoding, formatting, or
  display failures.
- **Packets ready:** shows sequence and guest labels without room identifiers, the stale-room
  warning, and the download action.
- **Download recovery:** retains the ready object URL if the browser download action throws, so the
  operator can try again.

## Product boundaries

Key Packet Press does not:

- assign or recommend rooms;
- verify occupancy or whether a supplied room is current;
- encode, activate, revoke, or distribute electronic keys;
- verify identity or authorize room access;
- connect to or modify a property-management system;
- accept XLSX, scanned documents, images, or arbitrary spreadsheet formats;
- infer headers, locale rules, guest identity, or room semantics beyond the documented contract;
- store an operator profile, settings, CSV, or generated PDF; or
- provide a legal, regulatory, privacy, security, or operational guarantee.

## Acceptance characteristics

The current product is successful only when:

- a valid synthetic or appropriately authorized CSV produces deterministic packet ordering;
- no review-blocked file produces a PDF;
- labels outside the WinAnsi-compatible PDF repertoire fail closed without transliteration;
- room identifiers stay off the browser preview and packet exterior;
- each index page repeats internal-handling and room-move warnings;
- the app initiates no external API or telemetry request;
- replacement work cannot be overwritten by a slower prior job;
- the generated object URL is revoked on replacement, unload, or teardown; and
- each additional interaction remains essential and documented.

## Current evidence boundary

The repository contains a working implementation, tests, and local proof artifacts. The
qualification research indicates a plausible operational pain and commercial adjacency, but there
is no direct buyer interview, purchase, hosted usage, production usage, revenue, retention, or
product-market-fit proof.
