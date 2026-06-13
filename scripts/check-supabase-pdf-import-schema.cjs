const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
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

loadEnvFile(path.join(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const checks = [
  {
    table: "pdf_uploads",
    columns: "id,file_name,file_url,status,storage_provider,storage_bucket,storage_object_key,mime_type,size_bytes,upload_status"
  },
  {
    table: "pdf_import_jobs",
    columns: "id,pdf_upload_id,status,parser_version,ocr_provider,page_count,extracted_page_count,draft_question_count,warnings,error_message"
  },
  {
    table: "pdf_import_pages",
    columns: "id,job_id,pdf_upload_id,page_number,extraction_method,ocr_status,text_extracted,ocr_text,page_image_url,confidence,warnings,raw_blocks"
  },
  {
    table: "pdf_import_draft_questions",
    columns: "id,job_id,pdf_upload_id,question_number,source_page_start,source_page_end,type,question_text,choices,correct_answer,explanation,scoring_notes,frq_parts,question_images,confidence,warnings,review_status,saved_question_id"
  },
  {
    table: "pdf_import_draft_assets",
    columns: "id,job_id,pdf_upload_id,draft_question_id,page_number,asset_type,image_url,bbox,keep_for_question,status,notes"
  },
  {
    table: "pdf_import_batches",
    columns: "id,job_id,page_numbers,status,attempt_count,next_attempt_at,lease_owner,lease_expires_at,error_message"
  }
];

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const results = [];
  for (const { table, columns } of checks) {
    const { error } = await client.from(table).select(columns, { head: true, count: "exact" });
    results.push({
      table,
      available: !error,
      error: error?.message || null
    });
  }

  console.log(`Supabase project: ${new URL(supabaseUrl).hostname}`);
  console.table(results);
  if (results.some((result) => !result.available)) {
    console.error("PDF import schema is incomplete. Apply Supabase migrations through 009_remote_pdf_worker.sql to this project.");
    process.exit(1);
  }
  console.log("PDF import schema check passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
