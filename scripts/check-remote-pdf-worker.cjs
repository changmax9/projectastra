const { createClient } = require("@supabase/supabase-js");
const { checkPdfImportSchema, loadEnvFile, repairSqlForResults, summarizeResults } = require("./pdf-import-schema-checks.cjs");

loadEnvFile();

if (!process.env.R2_SOURCE_BUCKET) process.env.R2_SOURCE_BUCKET = "astra-pdf-sources";
if (!process.env.R2_EVIDENCE_BUCKET) process.env.R2_EVIDENCE_BUCKET = "astra-pdf-evidence";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_SOURCE_BUCKET",
  "R2_EVIDENCE_BUCKET",
  "R2_EVIDENCE_PUBLIC_URL"
];

async function maybeCheckSupabaseSchema() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return checkPdfImportSchema(client);
}

async function main() {
  const missing = required.filter((key) => !process.env[key]);
  const schema = await maybeCheckSupabaseSchema();
  if (schema) {
    console.log(`Supabase project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
    console.table(summarizeResults(schema));
  }

  let failed = false;
  if (missing.length > 0) {
    console.error(`Remote PDF worker configuration is incomplete: ${missing.join(", ")}`);
    failed = true;
  }

  const missingSchema = (schema || []).filter((result) => !result.available);
  if (missingSchema.length > 0) {
    const repairSql = repairSqlForResults(schema);
    if (repairSql) {
      console.error("Remote PDF worker schema is incomplete. The current project appears to be missing the remote-worker columns from migration 009.");
      console.error("Run this SQL in the Supabase SQL editor, then re-run this check:");
      console.error(`\n${repairSql}\n`);
    } else {
      console.error("Remote PDF worker schema is incomplete. Apply Supabase migrations through 009_remote_pdf_worker.sql to this project.");
    }
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log("Remote PDF worker configuration is complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
