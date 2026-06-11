# Sample Physics 2: Raw OCR vs Vision Experiment

Date: 2026-06-11

## Isolation protocol

1. Selected 12 pages that were not used in the earlier OCR sample.
2. Rendered the pages without OCR.
3. Visually inspected the rendered images and fixed the result in `sample-physics2-vision-ground-truth.md`.
4. Only after the vision record existed, ran Tesseract directly on the same PNG files.
5. Raw Tesseract used no Astra normalization, no language-model cleanup, and no vision-derived hints.
6. Repeated raw OCR with Tesseract PSM 3 and PSM 6.

Raw OCR artifacts are stored outside the repository at:

- `D:\Codex\workspaces\projectastra\ocr-evaluation\astra-vision-eval\raw-tesseract`
- `D:\Codex\workspaces\projectastra\ocr-evaluation\astra-vision-eval\raw-tesseract-psm6`

## Comparison

| Page | Vision result | Raw OCR result | Main difference |
| --- | --- | --- | --- |
| 150 | Keep; two MCQs with diagram-only choices | Both stems detected | Two-column order is scrambled and graph/charge-distribution choices lose their meaning. |
| 170 | Keep as FRQ continuation with drawing grid | Prose and subparts detected | Grid becomes long noise; OCR cannot independently attach the continuation to its preceding FRQ. |
| 190 | Reject performance-data table | Title and many numbered rows detected | Raw OCR makes the page look question-like. This exposed a triage false-positive risk. |
| 205 | Keep; two MCQs with reservoir and energy-level diagrams | Both stems and much prose detected | Choice labels, equations, exponent, and diagram relationships are corrupted or omitted. |
| 255 | Keep; two MCQs | Both stems detected | Diagram-only choices for question 27 are not recoverable as structured choices. |
| 325 | Reject exam-description/reference page | Table contents detected | OCR loses the table hierarchy but does not produce a real prompt. |
| 365 | Reject answer-key page | Only heading/footer detected | Almost all answer entries are missed. |
| 405 | Reject formula/reference sheet | Large amount of text detected | Mathematical notation and table structure are heavily corrupted. |
| 525 | Reject scoring guideline | Heading and scoring prose detected well | Strong scoring phrases make rejection reliable. |
| 570 | Keep as FRQ continuation | Prose and subparts detected well | Diagram geometry and labels are incomplete; parent-question attachment still needs page context. |
| 610 | Keep as FRQ prompt | Prompt and data table mostly detected | Blank graph grid becomes a large block of garbage OCR text. |
| 650 | Reject scoring guideline | Scoring prose detected well | Equations are corrupted, but scoring signals remain clear. |

## Results

- Vision page selection: 12/12 correct against the fixed visual ground truth.
- Raw OCR found readable prompt prose on all 6 keep-pages.
- Raw OCR produced a complete, standalone structured question on 0/6 keep-pages because every selected question page depended on layout, diagrams, continuation context, or mathematical structure.
- Raw OCR preserved enough text to reject obvious scoring-guideline pages.
- Raw OCR created false-positive risk on the performance-data table and answer-list page.
- PSM 3 was generally better for multi-column/table coverage. PSM 6 sometimes produced shorter or more misleading text. Neither mode reliably preserved visual semantics.

## Changes made from the experiment

- Added performance-data and answer-list phrases to document-wide OCR triage exclusions.
- Added `raw_text` to the OCR worker before any deterministic normalization.
- Preserved untouched Tesseract output as a `tesseract-local-raw` page audit block.
- Kept normalized OCR text separate for segmentation.

## Recommended model boundary

- OCR model: recover raw characters and lines only.
- Astra deterministic processing: normalize narrowly, classify pages, segment prompts, and retain warnings.
- Vision benchmark: independently verify page type, layout, diagrams, and question completeness.
- Admin review: make the final keep/reject/save decision.

OCR output must never be described as vision-verified merely because Astra normalization improved it.
