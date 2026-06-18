const { createClient } = require("@supabase/supabase-js");
const { checkPdfImportSchema, loadEnvFile, repairSqlForResults, summarizeResults } = require("./pdf-import-schema-checks.cjs");

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const results = await checkPdfImportSchema(client);

  console.log(`Supabase project: ${new URL(supabaseUrl).hostname}`);
  console.table(summarizeResults(results));
  const unavailable = results.filter((result) => !result.available);
  if (unavailable.length > 0) {
    const repairSql = repairSqlForResults(results);
    if (repairSql) {
      console.error("PDF import schema is incomplete. The current project appears to be missing the remote-worker columns from migration 009.");
      console.error("Run this SQL in the Supabase SQL editor, then re-run this check:");
      console.error(`\n${repairSql}\n`);
    } else {
      console.error("PDF import schema is incomplete. Apply Supabase migrations through 009_remote_pdf_worker.sql to this project.");
    }
    process.exit(1);
  }
  console.log("PDF import schema check passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
