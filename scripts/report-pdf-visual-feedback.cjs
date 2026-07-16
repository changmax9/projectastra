const { createClient } = require("@supabase/supabase-js");
const { loadEnvFile } = require("./pdf-import-schema-checks.cjs");

loadEnvFile();

function feedbackFromAsset(asset) {
  const bbox = asset.bbox && typeof asset.bbox === "object" && !Array.isArray(asset.bbox) ? asset.bbox : {};
  const feedback = typeof bbox.reviewer_feedback === "string" ? bbox.reviewer_feedback : "unlabeled";
  const notes = typeof bbox.reviewer_notes === "string" ? bbox.reviewer_notes : "";
  return { feedback, notes };
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to report visual feedback.");
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client
    .from("pdf_import_draft_assets")
    .select("id,job_id,page_number,asset_type,status,bbox,notes,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Number(process.env.PDF_VISUAL_FEEDBACK_REPORT_LIMIT || 500));
  if (error) throw new Error(error.message);

  const assets = (data || []).map((asset) => ({ ...asset, ...feedbackFromAsset(asset) }));
  const labeled = assets.filter((asset) => asset.feedback && asset.feedback !== "unlabeled");
  const counts = labeled.reduce((acc, asset) => {
    acc[asset.feedback] = (acc[asset.feedback] || 0) + 1;
    return acc;
  }, {});
  const byPage = labeled.reduce((acc, asset) => {
    const key = String(asset.page_number);
    acc[key] = acc[key] || { page_number: asset.page_number, total: 0, labels: {} };
    acc[key].total += 1;
    acc[key].labels[asset.feedback] = (acc[key].labels[asset.feedback] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    total_assets_scanned: assets.length,
    labeled_assets: labeled.length,
    counts,
    pages: Object.values(byPage).sort((a, b) => b.total - a.total || a.page_number - b.page_number),
    recent_labels: labeled.slice(0, 25).map((asset) => ({
      id: asset.id,
      job_id: asset.job_id,
      page_number: asset.page_number,
      asset_type: asset.asset_type,
      feedback: asset.feedback,
      notes: asset.notes,
      updated_at: asset.updated_at
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
