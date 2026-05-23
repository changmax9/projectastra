# TODO

## PDF Import Pipeline Fault Fixes

- [done] Harden analyzer safety
  - Validate PDF magic bytes before OCR/render work.
  - Count pages without matching `/Type /Page` inside content streams.
  - Preserve embedded-text line breaks well enough for question boundaries.
  - Split answer/explanation/scoring sections before choice extraction.
  - Reject unusable OCR text instead of drafting garbled content.
  - Warn/fail closed for invalid OCR env config and invalid `PDF_OCR_MAX_PAGES`.
  - Mark page-limit skipped pages distinctly from unavailable OCR.
  - Add an analyzer-level OCR worker timeout and skip image/binary streams during embedded-text parsing.
  - Lower confidence and add explicit warnings for merged/corrupted choice drafts.

- [done] Improve draft save and review
  - Preserve select-two metadata into saved draft questions.
  - Prevent placeholder explanation text from being saved as real content.
  - Preserve imported scoring notes in the draft-save flow by carrying source scoring notes into the reviewed explanation field.
  - Surface source page image, OCR confidence, extraction method, and warnings in review.

- [done] Tighten data-layer parity
  - Make mock fallback reject missing `pdf_upload_id` like Supabase foreign keys.
  - Make missing draft-status updates fail loudly.
  - Prevent out-of-range draft asset links from becoming silent orphan kept assets.
  - Fix extracted-page metrics so rejected embedded text does not count as usable extraction.

- [done] Regression and adversarial checks
  - Run `tests/run-import-tests.cjs`, `tsc --noEmit`, `next lint`, and `scripts/predeploy-check.cjs`.
  - Re-run synthetic PDF probes after analyzer changes.
  - Re-run mock save probes after draft/data-layer changes.
  - Re-run real-PDF summary probes after major parser changes.

## New PDF Import Follow-Up TODOs

- [in progress] P1: Replace regex content-stream segmentation with geometry-aware extraction, ideally using PDF text spans/blocks. PyMuPDF block extraction is now preferred for text PDFs and reduced `qp-2024-chemistry.pdf` max choice merge from 25 to 8, but over-generation remains.
- [in progress] P1: Add figure/table/diagram candidate asset detection and review controls. OCR-rendered source-page candidates are now created for visual-reference drafts when a page image exists, but text-PDF visual pages still need rendered preview/cropping.
- [pending] P1: Build explicit answer-key association for separate answer-key pages with source-page citations. The safer current behavior excludes answer-key-like pages from segmentation and does not attach answers unless the question block itself contains explicit labels.
- [in progress] P2: Add a scoring-guide/FRQ classifier so scoring notes, rubrics, sample responses, and prompts are not treated as the same import type. Filename-based scoring-guide suppression and FRQ packet classification are implemented, but content-based classification still needs fixtures.
- [in progress] P2: Move long imports to an async job/progress model. `/admin/pdfs` now queues a processing job and a protected route completes processing while the same-page workspace polls; true page-by-page resumable chunking is still pending.
- [pending] P2: Add authenticated browser/E2E coverage for `/admin/pdfs` and `/admin/pdf-imports/[jobId]` with a seeded mock import job. Current browser smoke only verified compile plus auth redirect.
- [pending] P3: Normalize confidence units across embedded text and OCR pages so admin metrics do not mix `0.7` and `94` style values.
- [pending] P3: Add fixture-based regression tests for the ignored synthetic probes instead of relying mostly on source-string assertions.

## Train Log

- 2026-05-22: Started implementation pass from the PDF import fault reports. No standalone train log file exists, so this section records the requested train-style progress notes alongside the checklist.
- 2026-05-22: Completed the first TODO batch: analyzer fail-closed behavior, draft save/review metadata, mock/Supabase parity checks, source-page review context, OCR timeout guard, stream-skip latency fix, and regression/adversarial probes.
- 2026-05-22: New fault training notes: real PDFs no longer timed out in the summary probe after stream skipping, but geometry-aware segmentation, cropped visual assets, answer-key association, async imports, and authenticated admin E2E remain the next highest-impact work.
- 2026-05-23: Implemented the same-page `/admin/pdfs` import workspace, processing-job queue, protected process route, PyMuPDF text worker preference, scoring-guide suppression, FRQ packet classification, and visual source-page candidates where OCR page images exist.
- 2026-05-23: New fault training notes: async is currently queued/polled but not truly page-chunk resumable; `qp-2024-chemistry.pdf` improves but still over-generates; text-PDF visual references still need rendered page previews/crops; answer-key association remains conservative.
