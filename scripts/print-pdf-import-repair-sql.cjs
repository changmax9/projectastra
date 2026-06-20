const { createClient } = require("@supabase/supabase-js");
const { checkPdfImportSchema, loadEnvFile, repairSqlForResults, summarizeResults } = require("./pdf-import-schema-checks.cjs");

loadEnvFile();

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to inspect the Supabase PDF import schema.");
  }

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const results = await checkPdfImportSchema(client);
  console.error(`Supabase project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
  console.error(JSON.stringify(summarizeResults(results), null, 2));

  const repairSql = repairSqlForResults(results);
  if (!repairSql) {
    const incomplete = results.filter((result) => !result.available);
    if (incomplete.length === 0) {
      console.error("PDF import schema is complete. No repair SQL is needed.");
      return;
    }
    throw new Error("The missing schema shape is not covered by the targeted remote-worker repair SQL. Apply the full Supabase migrations in order.");
  }

  process.stdout.write(`${repairSql}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
