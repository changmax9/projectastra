# TODO

## Active PDF Import Goals

- [in progress] P1: Improve geometry-aware segmentation for real AP packets.
  PyMuPDF block extraction is now preferred, and section-aware filtering now excludes table-of-contents/scoring sections, fixes page-marker attribution, requires MCQ-section candidates to include choices, and filters out-of-sequence FRQ-like starts. `AP Chem 2023.pdf` improved from 134 drafts to 67 drafts (60 MCQ, 7 FRQ). `qp-2024-chemistry.pdf` improved from 73 drafts to 64 drafts (57 MCQ, 7 FRQ), but now under-extracts several MCQs instead of over-generating; next work should recover visually/noisily parsed MCQs without reintroducing false starts.

- [in progress] P1: Add precise visual/table/diagram crop proposals and review controls.
  Visual-reference drafts now get source-page previews for OCR and text PDFs, candidate evidence is not saved automatically, full-page PDF preview URLs are rejected from saved question images, and the review card has explicit cropped-asset URL/caption/bbox controls. PyMuPDF image blocks are now preserved without perturbing text reading order, and bounded crop candidates can be rendered from image-block bboxes into `/uploads/pdf-import-crops/...`. Remaining work is vector/table bbox detection, tighter crop-to-question association, and fixture coverage with real embedded image blocks.

- [in progress] P2: Make imports truly page-chunk resumable.
  `/admin/pdfs` now queues a processing job and polls a protected route, but the route still completes a full analysis pass. Next work should process bounded page batches, persist partial page states, and support resume after interruption.

- [pending] P2: Add authenticated browser/E2E coverage for `/admin/pdfs`.
  Live Supabase browser verification now covers authenticated upload, import start, progress completion, same-page inline draft display, and review-only persistence for `practice exam 2016(1).pdf`. Add a seeded mock admin test for resume, save-as-draft, reject, and no-direct-publish checks without mutating live question data.

- [blocked] P2: Resolve Supabase seed/account setup consistency.
  Local Supabase connectivity is confirmed, with one admin profile and no profile/Auth mismatches in the read-only probe. Read-only exam inspection found live Supabase has `20230000-0000-4000-8000-000000000150` (`AP Physics 1 2023 Practice Exam`) but not the mock seeded exam id/title `20000000-0000-4000-8000-000000000001` (`AP Physics 1 Mock Exam 1`). Completing this requires an explicit Supabase data-change decision because current rules prohibit seeding or changing live data.

## Train Log

- 2026-05-24: Cleared implemented items from this TODO. Historical completed work and command logs live in `docs/DEVELOPMENT_LOG.md`.
- 2026-05-24: Normalized confidence values to `0..1` in the analyzer/review path. Synthetic OCR probe max confidence is now `0.9404`, and garbled OCR reports `0.4429` instead of `44.29`.
- 2026-05-24: Implemented section-aware segmentation/filtering for real PDFs. The filter removes table-of-contents/scoring sections and out-of-sequence FRQ-like starts; `AP Chem 2023.pdf` now lands at 67 drafts, while `qp-2024-chemistry.pdf` lands at 64 drafts and still needs MCQ recovery work.
- 2026-05-24: Added conservative explicit answer-key association. Synthetic answer-key-at-end now attaches cited answers, real `practice exam 2016(1).pdf` matches 55 explicit MCQ answers, and `AP Chem 2023.pdf`/`qp-2024-chemistry.pdf` do not attach answers from scoring/question pages.
- 2026-05-24: Confirmed local Supabase is connected read-only and added admin dashboard account-health reporting. Live probe found 5 profiles, 1 admin profile, 4 student profiles, 5 Auth users, and no profile/Auth mismatches; `scripts/check-supabase-data.cjs` still reports a missing expected seeded exam.
- 2026-05-24: Implemented content-based scoring-guide/rubric/sample-response detection. A neutral-filename rubric probe now fails closed with zero drafts; real question-packet draft counts stayed stable (`AP Chem 2023.pdf` 67, `qp-2024-chemistry.pdf` 64, `ap25-frq-chemistry.pdf` 3 FRQ drafts).
- 2026-05-24: Added fixture-backed analyzer regression tests for explicit answers/explanations, neutral scoring packets, and mixed prompt/scoring packets. Also added explicit explanation-source association and safer visual review controls that require cropped asset URLs instead of saving full-page PDF previews.
- 2026-05-25: Stabilized PyMuPDF raw block handling so image blocks are preserved for crop candidates without affecting text reading order. Added bounded crop rendering for image-block candidates, explicit incomplete-visual warnings when no crop is available, and regression/source checks for the new crop path.
- 2026-05-31: Verified migration `008` is present in GitHub and complete in the configured live Supabase project. Hardened the schema preflight across all four PDF-import tables, replaced start-import runtime overlays with admin warnings, preserved Python worker stderr, added macOS `python3` fallback, and added read-only `npm run check:supabase:pdf-import`.
- 2026-06-01: Exercised the authenticated `/admin/pdfs` website against live Supabase with explicit authorization. Uploaded and analyzed `practice exam 2016(1).pdf` into review-only job `pdf_job_91clwyo1_mpv8vhcj`: 62 text pages, 56 pending drafts, 0 saved questions, and no direct publish.
- 2026-06-02: Added an admin-dashboard PDF-import review queue, direct review links, a pending-draft overview stat, and clearer `PDF Imports` sidebar wording after confirming that live Microeconomics OCR drafts were present but difficult to discover.
