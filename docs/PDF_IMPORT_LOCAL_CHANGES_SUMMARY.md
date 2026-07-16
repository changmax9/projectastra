# PDF Import Local Changes Summary

Last updated: 2026-05-24

This file summarizes the current local workspace changes compared with `origin/main`. These changes are not staged, committed, or pushed.

## Scope

Current dirty files:

- `TODO.md`
- `app/admin/page.tsx`
- `components/admin/AdminStatsCards.tsx`
- `components/admin/PdfDraftQuestionReview.tsx`
- `components/admin/PdfImportWorkspace.tsx`
- `docs/DEVELOPMENT_LOG.md`
- `lib/data.ts`
- `lib/pdf.ts`
- `lib/question-import.ts`
- `scripts/pdf-ocr-worker.py`
- `scripts/pdf-text-worker.py`
- `tests/run-import-tests.cjs`
- `tests/tsconfig.import-tests.json`

Approximate diff size at the time this summary was written: 13 files changed, about 1205 insertions and 87 deletions.

## Major Improvements

### Same-page PDF import review experience

- `/admin/pdfs` now functions more like a same-page PDF import workspace.
- Admins can select an import job, see processing/review status, view page audit data, and review generated drafts inline.
- `/admin/pdf-imports/[jobId]` remains available as a deep-link fallback.
- Import jobs are queued as `processing` and processed through a protected route instead of doing all work in the upload form action.

### OCR and text extraction safety

- PDF magic-byte validation rejects renamed non-PDF uploads before OCR work.
- PyMuPDF structured text extraction is preferred over raw PDF stream parsing when available.
- Page-level raw blocks are stored for admin audit.
- OCR confidence values are normalized to `0..1`.
- OCR/page-limit and invalid OCR configuration warnings are explicit.
- Rejected embedded text and unusable OCR output are not treated as valid draft material.

### Segmentation and classification

- Table-of-contents pages are excluded from segmentation.
- Answer-key, scoring-guide, rubric, sample-response, and commentary pages are filtered more aggressively.
- MCQ/FRQ section tracking improves page attribution and reduces false starts.
- Out-of-sequence FRQ-like starts are filtered to avoid formula/subpart noise.
- Content-based scoring-guide detection suppresses draft generation even when filenames do not contain `sg` or `scoring`.

### Answer and explanation source handling

- Explicit answer-key pages are parsed conservatively.
- Answers are attached only when the numbered key entry matches the generated draft and parsed choice labels.
- Conflicting answer entries are refused.
- Explicit explanation/rationale entries can be attached by question number.
- Explanations are attached only from explicit numbered explanation/rationale sections.
- Draft warnings cite the answer/explanation source page.
- The importer still does not invent answers, explanations, scoring notes, diagrams, tables, or FRQ parts.

### Visual evidence review

- Visual-reference drafts can receive source-page preview candidates for both OCR and text PDFs.
- Candidate visual evidence is shown separately from saved `question_images`.
- Candidate full-page previews are not saved automatically.
- Saving full-page PDF preview images such as `/uploads/pdf-import-pages/.../page-001.png` is rejected by the import guard.
- The draft review card now includes explicit controls for a cropped asset URL, caption, alt text, and crop/source bbox metadata.
- `scripts/pdf-text-worker.py` has an in-progress change to preserve PyMuPDF image blocks in `raw_blocks`, intended to support automatic crop proposals.

### Admin account and Supabase visibility

- The admin dashboard now surfaces account health.
- It reports Supabase vs mock mode, admin profile count, student profile count, Auth user count, seed env status, admin emails, and profile/Auth mismatch warnings.
- Read-only Supabase checks confirmed:
  - 5 profile rows
  - 1 admin profile
  - 4 student profiles
  - 5 Auth users
  - 0 admin profile/Auth mismatches
  - 0 Auth-user/profile mismatches
- No Supabase data was changed.

## Tests and Probe Coverage Added

- `tests/run-import-tests.cjs` now includes fixture-backed analyzer tests, not only source-string assertions.
- Local PDF fixtures exercise:
  - explicit answer keys,
  - explicit explanations,
  - neutral-filename scoring/rubric packets,
  - mixed prompt/scoring packets,
  - forbidden full-page PDF preview image paths.
- The ignored fault-finding harness also includes a neutral-filename rubric probe.

## Representative Fault-check Results

- `answer-key-at-end` now attaches both explicit answers and explicit explanations from source page 2.
- Neutral scoring/rubric fixtures fail closed with zero drafts.
- `AP Chem 2023.pdf` remains at 67 drafts: 60 MCQ, 7 FRQ.
- `qp-2024-chemistry.pdf` remains at 64 drafts: 57 MCQ, 7 FRQ.
- `ap25-frq-chemistry.pdf` remains FRQ-only with 3 drafts.
- Scoring-guide packets remain failed/zero-draft.
- Draft creation is still not treated as OCR/import accuracy proof.

## Commands That Passed During This Work

- `node tests/run-import-tests.cjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/next/dist/bin/next lint`
- `node scripts/predeploy-check.cjs`
- `node node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json`
- `node tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js`
- `node tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs`

`git diff --check` passed with only CRLF normalization warnings.

## Still Unfinished or Blocked

### True page-chunk resumability

The admin route queues and resumes an import job, but the analyzer still performs a full-document analysis pass when processing starts. True page-batch processing still needs a larger analyzer/data-layer refactor that can persist partial page state and generate drafts after enough page context is available.

### Automatic visual crop generation

The UI now supports crop metadata and cropped asset URLs, and full-page preview saving is blocked. Automatic generation of cropped PNGs from proposed bboxes is not complete yet. The `scripts/pdf-text-worker.py` image-block preservation change is preparatory and still needs the crop-rendering path and verification.

### Authenticated browser/E2E coverage

Unauthenticated redirect smoke checks were done earlier. Full authenticated `/admin/pdfs` E2E coverage remains pending. Playwright is not currently available in the local repo/runtime.

### Supabase seed consistency

Supabase is connected read-only, but `scripts/check-supabase-data.cjs` still reports missing expected seeded exam `20000000-0000-4000-8000-000000000001`.

Read-only inspection found a live AP Physics 1 exam under `20230000-0000-4000-8000-000000000150`, but not the mock seeded exam id/title. Resolving this requires an explicit data decision: seed the missing exam, map the check to the live exam, or retire the expected mock id. No live Supabase data was changed.

