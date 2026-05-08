#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RESTORE_TABLES = [
  ["exams", "exams"],
  ["sections", "exam_sections"],
  ["questions", "questions"],
  ["images", "question_images"],
  ["examQuestions", "exam_questions"],
  ["reviewGuides", "review_guides"],
  ["reviewGuideQuestions", "review_guide_questions"]
];
const FORBIDDEN_IMAGE_PATH_PARTS = [
  "mcq-page",
  "frq-page",
  "pdf-page",
  "full-page",
  "whole-page",
  "full-question",
  "question-screenshot",
  "page-screenshot"
];

function latestBackupPath() {
  const backupDir = path.join(ROOT, "backups");
  if (!fs.existsSync(backupDir)) return null;
  const files = fs
    .readdirSync(backupDir)
    .filter((file) => /^supabase-question-bank-.*\.json$/.test(file))
    .sort();
  const latest = files.at(-1);
  return latest ? path.join(backupDir, latest) : null;
}

function resolveBackupPath() {
  const positional = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
  const candidate = positional || latestBackupPath();
  if (!candidate) {
    throw new Error("Missing backup file path. Usage: npm run restore:supabase:dry -- backups/supabase-question-bank-YYYY-MM-DD-HH-mm.json");
  }
  return path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
}

function checkForbiddenImagePaths(data) {
  const warnings = [];
  for (const image of data.question_images || []) {
    const imagePath = String(image.file_url || "");
    const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
    if (forbidden) warnings.push(`Question ${image.question_id}: question_images.file_url contains "${forbidden}": ${imagePath}`);
  }
  for (const question of data.questions || []) {
    for (const image of question.question_images || []) {
      const imagePath = String(image.url || image.path || image.file_url || "");
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) warnings.push(`Question ${question.id}: questions.question_images contains "${forbidden}": ${imagePath}`);
    }
    for (const choice of question.choices || []) {
      const imagePath = String(choice.image_url || "");
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) warnings.push(`Question ${question.id} choice ${choice.id}: choice image contains "${forbidden}": ${imagePath}`);
    }
  }
  return warnings;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) {
    throw new Error("Restore apply is intentionally not implemented. Use --dry-run only.");
  }

  const backupPath = resolveBackupPath();
  if (!fs.existsSync(backupPath)) throw new Error(`Backup file not found: ${backupPath}`);
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const data = backup.data || {};

  console.log("Supabase restore dry run");
  console.log(`Backup file: ${backupPath}`);
  if (backup.metadata?.exportedAt) console.log(`Exported at: ${backup.metadata.exportedAt}`);
  if (backup.metadata?.projectUrl) console.log(`Project URL: ${backup.metadata.projectUrl}`);

  const counts = Object.fromEntries(RESTORE_TABLES.map(([label, table]) => [label, (data[table] || []).length]));
  console.table(counts);

  const forbidden = checkForbiddenImagePaths(data);
  if (forbidden.length > 0) {
    console.warn("Forbidden screenshot-like image path warnings:");
    for (const warning of forbidden) console.warn(`- ${warning}`);
  }

  const blockedTables = ["exam_attempts", "section_progress", "student_answers", "frq_responses"];
  const includedBlocked = blockedTables.filter((table) => Array.isArray(data[table]) && data[table].length > 0);
  if (includedBlocked.length > 0) {
    throw new Error(`Backup includes student attempt/answer tables that should not be restored by this script: ${includedBlocked.join(", ")}`);
  }

  console.log("Dry run complete. No Supabase writes were performed.");
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
