#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_EXAMS = ["ap-calculus-ab-2019-practice", "20000000-0000-4000-8000-000000000001"];
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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));
  const mockPath = path.join(ROOT, ".mock-db.json");
  const mockDb = fs.existsSync(mockPath) ? JSON.parse(fs.readFileSync(mockPath, "utf8")) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const tables = [
    "profiles",
    "exams",
    "exam_sections",
    "questions",
    "question_images",
    "exam_questions",
    "review_guides",
    "review_guide_questions",
    "exam_attempts",
    "section_progress",
    "student_answers",
    "frq_responses"
  ];

  const summary = {};
  for (const table of tables) summary[table] = await countRows(supabase, table);
  console.table(summary);

  if (mockDb) {
    const expected = {
      exams: (mockDb.exams || []).length,
      exam_sections: (mockDb.exams || []).reduce((sum, exam) => sum + (exam.sections || []).length, 0),
      questions: (mockDb.questions || []).length,
      question_images: (mockDb.questions || []).reduce((sum, question) => sum + (question.question_images || []).length, 0),
      exam_questions: (mockDb.examQuestions || []).length,
      review_guides: (mockDb.reviewGuides || []).length
    };
    const missing = Object.entries(expected).filter(([table, count]) => summary[table] < count);
    if (missing.length > 0) {
      throw new Error(
        `Supabase data is below expected seeded counts: ${missing
          .map(([table, count]) => `${table} expected at least ${count}, got ${summary[table]}`)
          .join("; ")}`
      );
    }
  }

  const { data: exams, error: examError } = await supabase
    .from("exams")
    .select("id,title,status")
    .in("id", REQUIRED_EXAMS);
  if (examError) throw examError;
  const foundExamIds = new Set((exams || []).map((exam) => exam.id));
  const missingExams = REQUIRED_EXAMS.filter((id) => !foundExamIds.has(id));
  if (missingExams.length > 0) {
    throw new Error(`Missing expected seeded exams: ${missingExams.join(", ")}`);
  }

  const { data: imageRows, error: imageError } = await supabase
    .from("question_images")
    .select("question_id,file_url");
  if (imageError) throw imageError;
  const forbidden = (imageRows || []).filter((row) =>
    FORBIDDEN_IMAGE_PATH_PARTS.some((part) => String(row.file_url || "").toLowerCase().includes(part))
  );
  if (forbidden.length > 0) {
    throw new Error(`Forbidden screenshot-like image paths found in Supabase: ${JSON.stringify(forbidden.slice(0, 5), null, 2)}`);
  }

  const { data: calcSections, error: calcError } = await supabase
    .from("exam_sections")
    .select("section,title,question_count,time_limit_minutes")
    .eq("exam_id", "ap-calculus-ab-2019-practice")
    .order("order_index", { ascending: true });
  if (calcError) throw calcError;
  if ((calcSections || []).length !== 4) {
    throw new Error("AP Calculus AB should have 4 sections after seeding.");
  }

  console.log("Supabase data check passed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
