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

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Remote PDF worker configuration is incomplete: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Remote PDF worker configuration is complete.");
}
