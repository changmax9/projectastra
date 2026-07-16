# Next Codex Thread Prompt: PDF OCR Import Improvements

Paste this prompt into a new Codex conversation to continue the Project Astra PDF OCR/import work without losing the current context.

```text
You are continuing work on the Project Astra AP website PDF OCR/import pipeline.

Workspace:
D:\Codex\workspaces\projectastra\personal-ap-website-vercel

Primary goal:
Continue improving the admin PDF OCR/import experience so an admin can upload/select a PDF on /admin/pdfs, start/resume import, watch progress, review generated draft questions with source evidence, and save only manually verified draft/review-state questions. Do not publish imported questions directly.

Start-up rules:
1. Run `git status --short --branch` before doing anything else.
2. Read `docs/DEVELOPMENT_LOG.md` before changing or testing code.
3. Read `TODO.md`.
4. Read `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md`.
5. Preserve dirty and untracked work. Do not revert, delete, overwrite, stage, commit, or push unless explicitly asked.
6. Do not commit `.env.local`, Supabase credentials, or secrets.
7. Do not change Supabase data unless explicitly asked.
8. Do not publish imported questions directly.
9. Treat OCR output and generated drafts as untrusted until source evidence supports them.
10. Do not invent answer keys, explanations, scoring notes, diagrams, tables, or FRQ parts.
11. Existing tests are regression checks only. Passing tests do not prove OCR quality is good.

Current known dirty state:
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
- `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md`
- `ProjectAstra_PDF_Import_Local_Changes_Summary.zip`

Important current note:
`scripts/pdf-text-worker.py` has a recent in-progress edit that preserves PyMuPDF image blocks in `raw_blocks` with `kind: "image"` and text blocks with `kind: "text"`. This was preparation for automatic crop generation and has not been fully tested yet. Start by reviewing and stabilizing this before building on it.

What has already been improved locally:
- `/admin/pdfs` now behaves more like a same-page PDF import workspace with upload/list, selected PDF details, polling, inline draft review, save, and reject flows.
- `/admin/pdf-imports/[jobId]` remains as a fallback/deep-link review route.
- PDF validation rejects malformed/non-PDF files by magic bytes.
- Text extraction prefers PyMuPDF structured blocks before OCR.
- OCR confidence is normalized to `0..1`.
- Segmentation is more section-aware and avoids some table-of-contents, answer-key, scoring-guide, and sample-response traps.
- Explicit answer-key/explanation association uses source citations when source text supports it.
- Visual references and page previews are surfaced for review.
- Full-page PDF preview images are rejected from saved question image fields.
- Admin dashboard now exposes admin account/Supabase health.
- Mock fallback behavior should remain supported when Supabase env vars are absent.

Current unfinished priorities, in recommended order:

1. Stabilize the `scripts/pdf-text-worker.py` raw block/image block change.
   - Confirm text blocks still preserve geometry and reading order.
   - Confirm image blocks do not break TypeScript parsing or segmentation.
   - Run the regression and probe commands listed below.

2. Complete automatic crop image generation for visual/table/diagram evidence.
   - Preserve image/table/diagram candidate block bounding boxes.
   - Generate cropped PNGs from PDF page coordinates only for candidate visual evidence.
   - Keep crops as review-only candidate assets until the admin explicitly saves them.
   - Never auto-save full-page screenshots as question images.
   - Continue showing page previews for context.
   - Add warnings for prompts that mention a figure, table, graph, diagram, or "shown below" when no usable crop/source visual is available.

3. Improve real-PDF segmentation/filtering without over-generation.
   - `AP Chem 2023.pdf` previously improved from 134 to about 67 drafts: 60 MCQ, 7 FRQ.
   - `qp-2024-chemistry.pdf` previously improved from 73 to about 64 drafts: 57 MCQ, 7 FRQ, but it still under-extracts some MCQs.
   - Improve missing/noisy MCQ recovery for `qp-2024-chemistry.pdf` while preserving scoring-guide and answer-key suppression.
   - Do not treat headers, page numbers, rubrics, answer keys, sample responses, or copyright/watermark text as questions.

4. Implement true bounded page-chunk resumability.
   - The current route/polling flow exists, but processing still effectively performs a full analysis pass.
   - Process small bounded page batches per request.
   - Persist partial page audit state and progress.
   - Resume after interruption.
   - Respect `PDF_OCR_MAX_PAGES`, timeouts, and OCR failure states.
   - Use the same behavior for Supabase and mock fallback.

5. Strengthen product/UI verification for `/admin/pdfs`.
   - Verify upload/select/start/resume/progress/inline review/save/reject behavior.
   - Saved imports must create only `status: "draft"` questions with `needs-admin-review`.
   - No direct publish path should exist.
   - If Playwright/browser tooling is unavailable, document the blocker and add a scriptable smoke check where practical.

6. Supabase setup consistency is blocked unless the user explicitly authorizes live data changes.
   - Previous read-only check found 1 admin profile, 4 student profiles, 5 Auth users, and 0 profile/Auth mismatches.
   - Live Supabase has AP Physics 1 exam id `20230000-0000-4000-8000-000000000150`, but not mock seeded id `20000000-0000-4000-8000-000000000001`.
   - Do not alter live Supabase rows without explicit permission.

Regression commands:
Run these after major implementation changes, and record exact commands and results in `docs/DEVELOPMENT_LOG.md`.

```powershell
node tests/run-import-tests.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next lint
node scripts/predeploy-check.cjs
```

Probe commands, if the temporary probe folder is still present:

```powershell
node node_modules/typescript/bin/tsc -p tmp-pdf-import-fault-finding-20260521/tsconfig.probe.json
node tmp-pdf-import-fault-finding-20260521/build/tmp-pdf-import-fault-finding-20260521/probe-pdf-import.js
node tmp-pdf-import-fault-finding-20260521/probe-real-pdf-summaries.cjs
```

Fault checks to perform after each major improvement:
- Compare draft count, max choice count, confidence distribution, warnings, page states, and runtime against earlier probe reports.
- Confirm scoring-guide/sample-response PDFs produce zero or clearly warned drafts unless prompt content is explicit and separable.
- Confirm answer-key-at-end fixtures attach answers/explanations only with explicit source-page citations.
- Confirm neutral rubrics do not become FRQs.
- Confirm malformed renamed `.pdf` uploads fail early.
- Confirm visual/table/diagram prompts are not treated as complete unless evidence is preserved or warnings are shown.
- Confirm no full-page preview image is saved as a question image.

Documentation expectations:
- Update `docs/DEVELOPMENT_LOG.md` with concise entries after meaningful test or implementation work.
- Update `TODO.md` by removing completed items and adding newly discovered flaws.
- Keep `docs/PDF_IMPORT_LOCAL_CHANGES_SUMMARY.md` current if the user asks for another summary.

Safety/product principles:
- Generated questions are candidates, not proof of correctness.
- Same-page generation means visible draft generation and review on `/admin/pdfs`, not automatic publishing.
- Low-quality OCR, garbled embedded text, missing visual evidence, missing choices, duplicate choices, noisy labels, and likely scoring-guide content should be warned or rejected rather than accepted confidently.
- Preserve mock fallback behavior when Supabase env vars are absent.
```
