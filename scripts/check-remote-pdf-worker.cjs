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

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function findR2ConfigErrors() {
  const errors = [];
  const evidencePublicUrl = process.env.R2_EVIDENCE_PUBLIC_URL || "";
  const endpoint = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (evidencePublicUrl.includes("<") || evidencePublicUrl.includes(">") || !validHttpUrl(evidencePublicUrl)) {
    errors.push("R2_EVIDENCE_PUBLIC_URL must be the real public r2.dev URL for the evidence bucket, not a placeholder.");
  }
  if (endpoint && !validHttpUrl(endpoint)) {
    errors.push("R2_ENDPOINT must be a valid http(s) URL.");
  }
  return errors;
}

function visualAiPreflight() {
  const rawMode = (process.env.PDF_VISUAL_AI_MODE || "off").trim().toLowerCase();
  const mode = rawMode === "audit" || rawMode === "assist" ? rawMode : "off";
  const provider = (process.env.PDF_VISUAL_AI_PROVIDER || "mistral").trim().toLowerCase();
  const errors = [];
  const warnings = [];
  if (!["off", "audit", "assist"].includes(rawMode)) {
    errors.push(`PDF_VISUAL_AI_MODE must be off, audit, or assist. Current value: ${process.env.PDF_VISUAL_AI_MODE}`);
  }
  if (mode !== "off") {
    if (!["mistral", "fixture"].includes(provider)) {
      errors.push(`PDF_VISUAL_AI_PROVIDER must be mistral or fixture when visual AI is enabled. Current value: ${provider}`);
    }
    if (provider === "mistral" && !process.env.PDF_VISUAL_AI_MISTRAL_API_KEY && !process.env.MISTRAL_API_KEY) {
      errors.push("PDF visual AI is enabled with Mistral, but PDF_VISUAL_AI_MISTRAL_API_KEY or MISTRAL_API_KEY is missing.");
    }
    if (provider === "fixture" && process.env.PDF_VISUAL_AI_ALLOW_FIXTURE_IN_PRODUCTION !== "1") {
      errors.push("PDF_VISUAL_AI_PROVIDER=fixture is for local/evaluation runs. Use mistral for production or set PDF_VISUAL_AI_MODE=off.");
    }
    if (mode === "assist") {
      warnings.push("PDF_VISUAL_AI_MODE=assist can influence crop-candidate generation; start production rollout with audit first.");
    }
  }
  const maxPages = Number(process.env.PDF_VISUAL_AI_MAX_PAGES || 8);
  if (!Number.isFinite(maxPages) || maxPages < 0) errors.push("PDF_VISUAL_AI_MAX_PAGES must be a non-negative number.");
  if (maxPages > 25) warnings.push("PDF_VISUAL_AI_MAX_PAGES is above 25; watch provider latency and cost before using this in production.");
  const timeoutMs = Number(process.env.PDF_VISUAL_AI_TIMEOUT_MS || 60000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    errors.push("PDF_VISUAL_AI_TIMEOUT_MS must be between 1000 and 300000.");
  }
  const maxImageBytes = Number(process.env.PDF_VISUAL_AI_MAX_IMAGE_BYTES || 10485760);
  if (!Number.isFinite(maxImageBytes) || maxImageBytes <= 0) errors.push("PDF_VISUAL_AI_MAX_IMAGE_BYTES must be positive.");
  return { enabled: mode !== "off", mode, provider, errors, warnings };
}

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
  const visualAi = visualAiPreflight();
  const r2ConfigErrors = findR2ConfigErrors();
  if (schema) {
    console.log(`Supabase project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
    console.table(summarizeResults(schema));
  }

  let failed = false;
  if (missing.length > 0) {
    console.error(`Remote PDF worker configuration is incomplete: ${missing.join(", ")}`);
    failed = true;
  }
  if (r2ConfigErrors.length > 0) {
    console.error(`R2 configuration is invalid: ${r2ConfigErrors.join(" ")}`);
    failed = true;
  }
  for (const warning of visualAi.warnings) console.warn(warning);
  if (visualAi.errors.length > 0) {
    console.error(`PDF visual AI configuration is invalid: ${visualAi.errors.join(" ")}`);
    failed = true;
  } else if (visualAi.enabled) {
    console.log(`PDF visual AI ${visualAi.mode} mode is configured with ${visualAi.provider}.`);
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
