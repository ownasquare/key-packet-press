# Changelog

All notable changes will be recorded in this file. The project intends to follow
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning after its first
public release.

Package metadata currently uses version `0.1.0`, but no public release, tag, or final commit exists.

## Unreleased

### Added

- Local UTF-8 rooming-list CSV parsing with explicit file, row, header, character, and label bounds.
- Fail-closed review notices for missing values, normalized duplicates, and ambiguous guest-to-room
  mappings.
- Deterministic packet ordering and an injected generation timestamp.
- US Letter fold-in packet inserts with room identifiers on the inward surface.
- Staff-only assembly index pages with source rows and stale-room handling warnings.
- Local in-browser PDF generation with `pdf-lib` built-in Helvetica StandardFonts.
- Fail-closed WinAnsi-compatible label handling without transliteration or silent replacement.
- Minimum-interaction browser workflow with automatic processing and an explicit download action.
- Unit tests for parsing, model creation, PDF layout and metadata, and UI state handling.
- Playwright E2E coverage for responsive light/dark states, accessibility, privacy boundaries,
  recovery, and PDF download readback.
- Focused product, architecture, data-contract, privacy-safety, monetization, and completion
  documentation.

### Not yet released

- Final release validation, screenshot and rendered-PDF inspection, validation receipts, commit and
  SHA evidence, public GitHub publication, and hosted or production proof remain pending.
