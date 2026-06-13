# Production OCR Deployment

The website runs on Vercel. Python/Tesseract runs in one Railway worker. Supabase stores queue/results, and Cloudflare R2 stores source PDFs and generated evidence.

## 1. Apply Supabase Migration

In the Supabase SQL editor for project `zivxtmxljqidiruogjpq`, run:

```text
supabase/migrations/009_remote_pdf_worker.sql
```

Then verify locally:

```bash
npm run check:supabase:pdf-import
```

## 2. Create Cloudflare R2 Storage

Create:

- Private bucket: `astra-pdf-sources`
- Public bucket: `astra-pdf-evidence`

Apply `infra/r2-source-cors.json` to the private source bucket. Create an R2 API token with object read/write access to both buckets. Record:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_SOURCE_BUCKET=astra-pdf-sources
R2_EVIDENCE_BUCKET=astra-pdf-evidence
R2_EVIDENCE_PUBLIC_URL=https://<public-evidence-domain>
```

## 3. Deploy Railway Worker

Create a Railway service from `changmax9/projectastra`, using `Dockerfile.worker`, with one replica. Configure:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_SOURCE_BUCKET=astra-pdf-sources
R2_EVIDENCE_BUCKET=astra-pdf-evidence
R2_EVIDENCE_PUBLIC_URL=
PDF_WORKER_BATCH_SIZE=12
PDF_WORKER_MAX_PAGES=2000
```

The worker logs should show `Astra PDF worker ... started.` Run `npm run check:ocr:remote` with the same environment before accepting imports.

## 4. Configure Vercel

Configure the R2 variables above plus:

```env
PDF_OCR_MODE=remote-worker
```

Do not configure D-drive Python/Tesseract paths on Vercel. The Vercel project must grant deployment access to the GitHub commit author or deploys will be rejected.

## 5. Verify Production

1. Upload page 610 and confirm FRQ 3, one structured part, two visual candidates, and raw OCR audit output.
2. Upload page 150 and confirm questions 6 and 7 with twelve crop candidates.
3. Upload the 90.2 MB packet and confirm multipart progress, queued/processing/finalizing phases, completed page batches, and eventual stable review drafts.
4. Cancel and retry a test job.
5. Delete a test upload and verify its private source and public evidence objects are removed.
