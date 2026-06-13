# Deploy on Vercel Free + Supabase Free

This guide is only for the current test deployment target: Vercel Free plus Supabase Free.

Do not use `.mock-db.json` as the production database. Production should read and write through Supabase. The mock database is only a local fallback and seed source.

## 1. Prerequisites

- A GitHub repository for this project.
- A Supabase project.
- Supabase migrations applied, including every file in `supabase/migrations`.
- Stable seed data imported into Supabase.
- The question assets committed under `public/assets/questions`.

## 2. Local Verification

Run these before deploying:

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run predeploy
npm run build
```

Do not run `npm run build` while `npm run dev` is still running. Stop the dev server with `Ctrl+C` first to avoid stale `.next` chunks.

## 3. Push to GitHub

```bash
git add .
git commit -m "prepare Vercel deployment"
git push
```

Do not commit `.env.local`, real Supabase keys, or local secrets.

## 4. Supabase Data Preparation

Apply migrations in Supabase first. You can use the Supabase SQL editor or Supabase CLI. Apply the migrations in order from `supabase/migrations`.

Then seed stable data from the local mock database:

```bash
npm run seed:supabase:dry
npm run seed:supabase
npm run check:supabase
```

The seed script imports:

- `exams`
- `exam_sections`
- `questions`
- `question_images`
- `exam_questions`
- `review_guides`
- `review_guide_questions`

It also creates or updates Supabase Auth users from server-only seed environment variables.
Do not hardcode or publish demo passwords.

The seed script does not import local test attempts, legacy per-section attempts, or local answer history. It rejects forbidden full-page/question screenshot-like image paths such as `mcq-page`, `frq-page`, `pdf-page`, `full-page`, `whole-page`, `full-question`, `question-screenshot`, and `page-screenshot`.

## 5. Vercel Project Setup

1. Log in to Vercel.
2. Choose **New Project**.
3. Import the GitHub repository.
4. Let Vercel auto-detect Next.js.
5. Use:
   - Install command: `npm install` or `npm ci`
   - Build command: `npm run build`
   - Output directory: leave default
6. Add environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe public values. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be used in client components or exposed to the browser.

## 6. Deployment Verification

After Vercel deploys, verify the student flow:

- Open `/`.
- Log in as the student account.
- Open `/available-exams`.
- Confirm AP Calculus AB and AP Physics are visible.
- Start AP Calculus AB.
- Confirm the flow: MCQ Non-Calculator → MCQ Calculator → Break → FRQ Calculator → FRQ Non-Calculator → Results.
- Confirm Save & Exit / Resume works.
- Confirm Submit / Results works.
- Confirm results do not show `0/0`, `1/99`, or raw status variables.

Verify the admin flow:

- Log in as the admin account.
- Open `/admin/questions`.
- Filter and edit questions.
- Use the needs-review workflow if any questions are tagged `needs-admin-review`.
- Confirm MathMarkdown / LaTeX preview renders.
- Confirm question images preview without cropping.

## 7. Common Issues

### Supabase env is missing

If Vercel production does not have Supabase env variables, the app may fall back to mock mode or fail depending on the route. Add all required variables in Vercel Project Settings → Environment Variables, then redeploy.

### Available Exams is empty

Migrations may not be applied, or the seed script may not have run. Apply all migrations, run `npm run seed:supabase`, then run `npm run check:supabase`.

### Images return 404

Question image paths under `/assets/questions/...` must exist in `public/assets/questions` and be committed to the repo. Vercel deploys files under `public` automatically.

### Build fails

Run locally:

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

If `npm run dev` is running, stop it before `npm run build`.

### Service role key exposure risk

Only use `SUPABASE_SERVICE_ROLE_KEY` in server-side helpers and scripts. Do not import the service-role Supabase client into client components. Do not prefix the service role env name with `NEXT_PUBLIC_`.

### CSS does not load

Confirm `app/layout.tsx` imports `./globals.css`, `app/globals.css` includes Tailwind directives, and `tailwind.config` content includes `app`, `components`, and related source directories.

### ChunkLoadError

This is usually stale browser cache or a stale `.next` build during local testing. Stop the dev server, clear `.next` if needed, rebuild, and hard refresh the browser.

### Server actions fail on Vercel

Check Vercel Function logs. Common causes are missing Supabase env variables, missing migrations, RLS/policy issues, or service-role key misconfiguration.

### Supabase table or migration missing

If errors mention missing `exam_attempts`, `section_progress`, `student_answers`, or `exam_sections`, apply all migrations in `supabase/migrations`, especially the production data-layer migration.

If PDF analysis says its import tables are missing, run `npm run check:supabase:pdf-import` locally and apply migrations through `supabase/migrations/009_remote_pdf_worker.sql` to the exact Supabase project reported by that command.

Production OCR is not executed inside Vercel. Apply `supabase/migrations/009_remote_pdf_worker.sql`, set `PDF_OCR_MODE=remote-worker`, configure Cloudflare R2 credentials, and deploy `Dockerfile.worker` as a single Railway worker before starting scanned-PDF imports.
