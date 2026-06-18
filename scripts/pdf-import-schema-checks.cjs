const fs = require("node:fs");
const path = require("node:path");

const PDF_IMPORT_SCHEMA_CHECKS = [
  {
    table: "pdf_uploads",
    columns: ["id", "file_name", "file_url", "status", "storage_provider", "storage_bucket", "storage_object_key", "mime_type", "size_bytes", "upload_status"]
  },
  {
    table: "pdf_import_jobs",
    columns: ["id", "pdf_upload_id", "status", "parser_version", "ocr_provider", "page_count", "extracted_page_count", "draft_question_count", "warnings", "error_message", "phase", "processed_page_count", "lease_owner", "lease_expires_at", "heartbeat_at", "cancel_requested_at", "attempt_count"]
  },
  {
    table: "pdf_import_pages",
    columns: ["id", "job_id", "pdf_upload_id", "page_number", "extraction_method", "ocr_status", "text_extracted", "ocr_text", "page_image_url", "confidence", "warnings", "raw_blocks"]
  },
  {
    table: "pdf_import_draft_questions",
    columns: ["id", "job_id", "pdf_upload_id", "question_number", "source_page_start", "source_page_end", "type", "question_text", "choices", "correct_answer", "explanation", "scoring_notes", "frq_parts", "question_images", "confidence", "warnings", "review_status", "saved_question_id"]
  },
  {
    table: "pdf_import_draft_assets",
    columns: ["id", "job_id", "pdf_upload_id", "draft_question_id", "page_number", "asset_type", "image_url", "bbox", "keep_for_question", "status", "notes"]
  },
  {
    table: "pdf_import_batches",
    columns: ["id", "job_id", "page_numbers", "status", "attempt_count", "next_attempt_at", "lease_owner", "lease_expires_at", "error_message"]
  }
];

const PDF_UPLOADS_REMOTE_STORAGE_COLUMNS = [
  "storage_provider",
  "storage_bucket",
  "storage_object_key",
  "mime_type",
  "size_bytes",
  "upload_status"
];

const PDF_IMPORT_JOBS_REMOTE_WORKER_COLUMNS = [
  "phase",
  "processed_page_count",
  "lease_owner",
  "lease_expires_at",
  "heartbeat_at",
  "cancel_requested_at",
  "attempt_count"
];

const PDF_UPLOADS_REMOTE_STORAGE_REPAIR_SQL = `alter table public.pdf_uploads
  add column if not exists storage_provider text not null default 'legacy',
  add column if not exists storage_bucket text,
  add column if not exists storage_object_key text,
  add column if not exists mime_type text not null default 'application/pdf',
  add column if not exists size_bytes bigint not null default 0,
  add column if not exists upload_status text not null default 'completed'
    check (upload_status in ('uploading', 'completed', 'failed', 'deleted'));

alter table public.pdf_uploads drop constraint if exists pdf_uploads_status_check;
alter table public.pdf_uploads
  add constraint pdf_uploads_status_check check (status in ('uploading', 'uploaded', 'parsed', 'failed', 'deleted'));`;

const PDF_IMPORT_JOBS_REMOTE_WORKER_REPAIR_SQL = `alter table public.pdf_import_jobs drop constraint if exists pdf_import_jobs_status_check;
alter table public.pdf_import_jobs
  alter column status set default 'queued',
  add constraint pdf_import_jobs_status_check check (
    status in ('queued', 'triaging', 'processing', 'finalizing', 'needs_review', 'completed', 'failed', 'cancelled')
  ),
  add column if not exists phase text not null default 'queued',
  add column if not exists processed_page_count integer not null default 0 check (processed_page_count >= 0),
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);`;

function loadEnvFile(filePath = path.join(process.cwd(), ".env.local")) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function checkPdfImportSchema(client) {
  const results = [];
  for (const check of PDF_IMPORT_SCHEMA_CHECKS) {
    const { error } = await client.from(check.table).select(check.columns.join(","), { head: true, count: "exact" });
    if (!error) {
      results.push({ table: check.table, available: true, missingColumns: [], error: null });
      continue;
    }

    const missingColumns = [];
    let firstError = error.message || error.details || error.code || null;
    for (const column of check.columns) {
      const { error: columnError } = await client.from(check.table).select(column, { head: true, count: "exact" });
      if (columnError) {
        missingColumns.push(column);
        if (!firstError) firstError = columnError.message || columnError.details || columnError.code || null;
      }
    }

    results.push({ table: check.table, available: false, missingColumns, error: firstError });
  }
  return results;
}

function repairSqlForResults(results) {
  const pdfUploads = results.find((result) => result.table === "pdf_uploads");
  const pdfImportJobs = results.find((result) => result.table === "pdf_import_jobs");
  const unavailable = results.filter((result) => !result.available);
  const unsupportedTables = unavailable.filter((result) => !["pdf_uploads", "pdf_import_jobs"].includes(result.table));
  if (unsupportedTables.length > 0) return null;

  const statements = [];
  if (pdfUploads && !pdfUploads.available) {
    const missing = new Set(pdfUploads.missingColumns || []);
    const onlyRemoteStorageColumns = PDF_UPLOADS_REMOTE_STORAGE_COLUMNS.every((column) => missing.has(column)) &&
      [...missing].every((column) => PDF_UPLOADS_REMOTE_STORAGE_COLUMNS.includes(column));
    if (!onlyRemoteStorageColumns) return null;
    statements.push(PDF_UPLOADS_REMOTE_STORAGE_REPAIR_SQL);
  }

  if (pdfImportJobs && !pdfImportJobs.available) {
    const missing = new Set(pdfImportJobs.missingColumns || []);
    const onlyRemoteWorkerColumns = PDF_IMPORT_JOBS_REMOTE_WORKER_COLUMNS.every((column) => missing.has(column)) &&
      [...missing].every((column) => PDF_IMPORT_JOBS_REMOTE_WORKER_COLUMNS.includes(column));
    if (!onlyRemoteWorkerColumns) return null;
    statements.push(PDF_IMPORT_JOBS_REMOTE_WORKER_REPAIR_SQL);
  }

  return statements.length > 0 ? statements.join("\n\n") : null;
}

function summarizeResults(results) {
  return results.map((result) => ({
    table: result.table,
    available: result.available,
    missing_columns: result.missingColumns.length ? result.missingColumns.join(", ") : "",
    error: result.error || ""
  }));
}

module.exports = {
  PDF_IMPORT_SCHEMA_CHECKS,
  checkPdfImportSchema,
  loadEnvFile,
  repairSqlForResults,
  summarizeResults
};
