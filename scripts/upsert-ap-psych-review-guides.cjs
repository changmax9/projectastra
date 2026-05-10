const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const guidesPath = path.join(root, "data", "ap-psychology-review-guides.json");
const apply = process.argv.includes("--apply");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function buildSupabase() {
  loadEnvFile(envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function loadGuides() {
  const raw = JSON.parse(fs.readFileSync(guidesPath, "utf8"));
  return raw.map(({ source_path: _sourcePath, ...guide }) => ({
    ...guide,
    updated_at: new Date().toISOString(),
    published_at: guide.status === "published" ? guide.published_at || new Date().toISOString() : null
  }));
}

async function main() {
  const guides = loadGuides();
  const supabase = buildSupabase();
  const ids = guides.map((guide) => guide.id);
  const { data: existing, error: readError } = await supabase
    .from("review_guides")
    .select("id, slug, title, updated_at")
    .in("id", ids);

  if (readError) throw readError;

  const existingById = new Map((existing || []).map((guide) => [guide.id, guide]));
  const summary = guides.map((guide) => ({
    action: existingById.has(guide.id) ? "update" : "insert",
    id: guide.id,
    slug: guide.slug,
    title: guide.title
  }));

  console.table(summary);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to upsert these AP Psychology guides.");
    return;
  }

  const { error: upsertError } = await supabase
    .from("review_guides")
    .upsert(guides, { onConflict: "id" });

  if (upsertError) throw upsertError;
  console.log(`Upserted ${guides.length} AP Psychology review guides.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
