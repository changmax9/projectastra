# AP Mock Exam Platform

一个完整可运行的 AP 风格模考网站 MVP，使用 Next.js App Router、React、TypeScript、Tailwind CSS、Supabase Auth/PostgreSQL/Storage、Zod、react-hook-form 和 Markdown + KaTeX 渲染搭建。

项目默认带 mock fallback：即使没有 Supabase 环境变量，也可以本地启动、登录 demo 账号、参加 seed 模考、提交并查看结果、进入后台体验题库/考试/Review Guide 管理。

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Storage
- Zod for JSON/form validation
- react-hook-form for admin question editor
- react-markdown, remark-gfm, remark-math, rehype-katex, rehype-slug, rehype-autolink-headings
- KaTeX for LaTeX rendering

## Local Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Supabase env values, the app runs in mock mode with in-memory data and local uploads under `public/uploads`.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAIL=
ADMIN_PASSWORD=
STUDENT_EMAIL=
STUDENT_PASSWORD=
SESSION_SECRET=
SHOW_DEMO_CREDENTIALS=false
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code. This project only reads it in server-side helpers and seed scripts.

## Deployment

Recommended current test deployment:

```text
Vercel Free + Supabase Free
```

Production data flow:

```text
.mock-db.json -> seed script -> Supabase
production app -> Supabase
```

Important deployment rules:

- Vercel production must configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Do not rely on `.mock-db.json` as the production database. It is only a local fallback and seed source.
- Local development can still fall back to mock mode when Supabase env values are missing.
- Files under `public/assets/questions` deploy with Vercel automatically.
- Do not commit `.env.local` or any real Supabase keys.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

Deployment prep commands:

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run predeploy
npm run build
```

Stop `npm run dev` before running `npm run build`.

Supabase seed/check commands:

```bash
npm run seed:supabase:dry
npm run seed:supabase
npm run check:supabase
```

Full Vercel Free deployment instructions live in [`docs/DEPLOY_VERCEL_FREE.md`](docs/DEPLOY_VERCEL_FREE.md).

VPS/self-host deployment is intentionally not documented yet; if this test deployment outgrows Vercel/Supabase Free, add a separate self-host guide later.

## Supabase Setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill the Supabase URL, anon key, and service role key.
3. Run every SQL migration in `supabase/migrations` in order using the Supabase SQL editor or Supabase CLI.
4. Ensure Storage buckets exist:
   - `question-media`
   - `pdf-uploads`
5. Run seed:

```bash
npm run seed:supabase
npm run check:supabase
```

The migration creates tables, constraints, indexes, `updated_at` triggers, profile creation trigger, RLS policies, and Storage buckets.

## Local Test Accounts

Set local-only `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STUDENT_EMAIL`, and `STUDENT_PASSWORD` values in `.env.local`.
Do not commit real passwords or publish demo credentials in client-facing pages.

Seed content is original AP-style material, not College Board/AP copyrighted questions.

## Database Tables

The migration creates:

- `profiles`
- `exams`
- `exam_sections`
- `questions`
- `question_images`
- `exam_questions`
- `exam_attempts`
- `section_progress`
- `student_answers`
- `frq_responses`
- `media_files`
- `pdf_uploads`
- `review_guides`
- `review_guide_questions`
- `admin_edits`

RLS rules enforce:

- Students only access their own attempts, section progress, answers, and FRQ responses.
- Students only see published exams and published review guides.
- Admins can manage exams, questions, media, PDFs, submissions, students, and review guides.
- Upload/admin operations are checked server-side with `requireAdmin()`.

## JSON Import Format

Admin page: `/admin/import`

Upload an array of question objects:

```json
[
  {
    "subject": "AP Physics 1",
    "unit": "Unit 3: Circular Motion and Gravitation",
    "topic": "Circular Motion",
    "difficulty": "medium",
    "type": "mcq",
    "question_text": "A block moves in a horizontal circle at constant speed. Which statement correctly describes the net force on the block?",
    "question_images": [
      {
        "id": "img_001",
        "url": "/uploads/questions/img_001.png",
        "caption": "Diagram for question 1"
      }
    ],
    "choices": [
      { "id": "A", "text": "The net force is directed toward the center of the circle.", "image_url": null },
      { "id": "B", "text": "The net force is directed tangent to the circle.", "image_url": null }
    ],
    "correct_answer": "A",
    "explanation": "For uniform circular motion, the acceleration and net force point toward the center.",
    "points": 1,
    "time_estimate_seconds": 90,
    "tags": ["centripetal force", "circular motion"],
    "source_pdf": "ap_physics_mock_01.pdf"
  }
]
```

FRQ items use `"type": "frq"`, `"choices": []`, and `"correct_answer": null`.

Validation is implemented in `lib/schemas.ts` with Zod. The import UI shows exact item index, field path, and error message before writing anything.

## PDF Workflow

Admin page: `/admin/pdfs`

Current review-first behavior:

1. Upload PDF and metadata.
2. Save the file record in `pdf_uploads`.
3. Start an async text/OCR import job.
4. Review page extraction status, warnings, source previews, and generated draft questions on `/admin/pdfs`.
5. Save only manually verified draft questions with `needs-admin-review`.

Imported questions are never published directly. OCR output and generated drafts are untrusted until the admin verifies them against source evidence.

Supabase mode requires `supabase/migrations/008_pdf_import_pipeline.sql`. Verify the connected project before testing:

```bash
npm run check:supabase:pdf-import
```

Local OCR uses Python, PyMuPDF, Pillow, pytesseract, and a Tesseract installation. If they are not on the default executable paths, configure:

```env
PDF_TEXT_PYTHON=
PDF_OCR_PYTHON=
TESSERACT_CMD=
```

Typical macOS setup:

```bash
brew install tesseract
python3 -m pip install pymupdf pillow pytesseract
```

## File Uploads

Admin page: `/admin/media`

- Supabase configured: uploads go to `question-media` or `pdf-uploads` Storage buckets.
- Mock mode: uploads are written to `public/uploads`.
- Media records are stored in `media_files`.
- Admin can insert image URLs into `question_images` or a choice `image_url`.

Local mock uploads are development-only. For production, use Supabase Storage or another persistent object store.

## Review Guide Markdown

Admin pages:

- `/admin/review-guides`
- `/admin/review-guides/new`
- `/admin/review-guides/[id]/edit`

Student pages:

- `/review`
- `/review/[slug]`

Supported Markdown:

- `#`, `##`, `###`
- Paragraphs, bold, italic
- Ordered/unordered lists
- Tables
- Blockquotes
- Code blocks
- Images
- Inline math: `$v = \omega r$`
- Block math:

```md
$$
F_c = \frac{mv^2}{r}
$$
```

Callout MVP syntax uses blockquote prefixes:

```md
> Important: Centripetal force is not a new force.
> Common Mistake: Do not draw an extra centripetal force arrow.
> Exam Tip: Always identify which real force points toward the center.
```

Guides can be linked to question-bank items through `review_guide_questions`.

## Implemented Features

Student:

- Register/login/logout
- Protected dashboard
- Published exam list
- Exam start/continue
- Timed exam taking
- MCQ and FRQ rendering
- LaTeX rendering in questions
- Question and choice images
- Question navigator
- Answered/unanswered/flagged states
- Autosave answers
- Submit with confirmation
- MCQ auto scoring
- FRQ pending grading state
- Results with score, percentage, time, answer review, correct answer, explanation
- Review guide list and reading page with TOC, Markdown, LaTeX, callouts, related questions

Admin:

- Protected `/admin`
- Dashboard stats
- Student list and student detail
- Submission list and answer-level detail
- Exam create/edit/delete/publish/archive
- Add/remove/reorder exam questions
- Question create/edit/delete/filter
- JSON upload, validation, preview, batch import
- Image upload/list/delete/link to question/link to choice
- PDF upload/list/update metadata
- Review Guide create/edit/delete/publish via status, live preview, link questions

## MVP Placeholders

- Full Supabase SSR session refresh is simplified; login verifies Supabase Auth, then stores a server-only profile cookie. Production should replace this with `@supabase/ssr` session cookies.
- FRQ manual grading UI fields exist in DB, but the grading UI is not fully implemented yet.
- PDF import remains review-first. True bounded page-chunk resumability and more precise vector/table crop detection are still in progress.
- Mock mode stores data in memory, so submissions created in mock mode reset when the dev server restarts.
- Local mock uploads write to `public/uploads`, which is not production storage.

## Common Issues

- If Supabase login works but no profile exists, rerun the migration and seed script.
- If image/PDF upload fails with Supabase, confirm buckets `question-media` and `pdf-uploads` exist.
- If RLS blocks an admin action, confirm the logged-in user's profile row has `role = 'admin'`.
- If JSON import fails, check MCQ `correct_answer` matches a `choices[].id`, and FRQ has `choices: []` plus `correct_answer: null`.
- If PDF analysis says import tables are not installed, run `npm run check:supabase:pdf-import` and apply `supabase/migrations/008_pdf_import_pipeline.sql` to the exact Supabase project reported by that command.
- If PDF analysis reaches OCR but fails locally, install Python packages `pymupdf`, `pillow`, and `pytesseract`, install Tesseract, and set `PDF_TEXT_PYTHON`, `PDF_OCR_PYTHON`, or `TESSERACT_CMD` when the executables are not on the default paths.
