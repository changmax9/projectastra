#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DATA_PATH = path.join(ROOT, "data", "calc-ab-2019-explanations.json");
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const DATA_ARG = process.argv.find((arg) => arg.startsWith("--data="));
const DATA_PATH = DATA_ARG ? path.resolve(ROOT, DATA_ARG.slice("--data=".length)) : DEFAULT_DATA_PATH;

const PLACEHOLDER_RE =
  /would be provided|provided in the future|coming soon|admin review|source\s+page\s+image|attached\s+source|pdf\s+page|page\s+screenshot/i;

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

function loadExplanationData() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Missing explanation data file: ${DATA_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const explanations = Array.isArray(parsed) ? parsed : parsed.explanations;
  if (!Array.isArray(explanations)) {
    throw new Error("Explanation data must be an array or an object with an explanations array.");
  }
  return explanations.map((item) => ({
    questionNumber: Number(item.questionNumber),
    section: item.section ? String(item.section) : null,
    correctAnswer: item.correctAnswer ? String(item.correctAnswer).trim() : null,
    explanation: String(item.explanation || "").trim()
  }));
}

function isPlaceholder(value) {
  return !String(value || "").trim() || PLACEHOLDER_RE.test(String(value || ""));
}

function questionKey(question) {
  return `${question.section || "unknown"} #${question.question_number ?? "unknown"} (${question.id})`;
}

function formatSupabaseError(error) {
  return JSON.stringify(
    {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    },
    null,
    2
  );
}

async function fetchCalcQuestions(supabase) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, course, exam_name, year, section, question_number, correct_answer, explanation")
    .eq("course", "AP Calculus AB")
    .eq("year", 2019)
    .order("question_number", { ascending: true });

  if (error) throw new Error(formatSupabaseError(error));
  if (data && data.length > 0) return data;

  const fallback = await supabase
    .from("questions")
    .select("id, course, exam_name, year, section, question_number, correct_answer, explanation")
    .ilike("exam_name", "%Calculus AB%")
    .order("question_number", { ascending: true });

  if (fallback.error) throw new Error(formatSupabaseError(fallback.error));
  return fallback.data || [];
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const explanations = loadExplanationData().filter((item) => {
    if (!Number.isFinite(item.questionNumber)) return false;
    if (!item.explanation) return false;
    return true;
  });

  if (explanations.length === 0) {
    console.log(`No explanations found in ${path.relative(ROOT, DATA_PATH)}.`);
    console.log("Populate data/calc-ab-2019-explanations.json, then rerun this script.");
    return;
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const questions = await fetchCalcQuestions(supabase);
  console.log(`Found ${questions.length} AP Calculus AB 2019 candidate questions.`);

  const updates = [];
  const warnings = [];

  for (const item of explanations) {
    const matches = questions.filter((question) => Number(question.question_number) === item.questionNumber);
    const scopedMatches = item.section
      ? matches.filter((question) => String(question.section || "").toUpperCase() === item.section.toUpperCase())
      : matches;
    const question = scopedMatches[0] || matches[0];

    if (!question) {
      warnings.push(`No matching question found for questionNumber=${item.questionNumber}.`);
      continue;
    }
    if (item.correctAnswer && question.correct_answer && item.correctAnswer !== question.correct_answer) {
      warnings.push(
        `${questionKey(question)} answer mismatch: data file has ${item.correctAnswer}, database has ${question.correct_answer}.`
      );
    }
    if (!FORCE && !isPlaceholder(question.explanation)) {
      warnings.push(`${questionKey(question)} already has a non-placeholder explanation; skipped.`);
      continue;
    }
    updates.push({ question, explanation: item.explanation });
  }

  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  console.log(`${APPLY ? "Applying" : "Dry run:"} ${updates.length} explanation update(s).`);

  for (const update of updates) {
    console.log(`- ${questionKey(update.question)} -> ${update.explanation.slice(0, 90)}${update.explanation.length > 90 ? "..." : ""}`);
    if (!APPLY) continue;
    const { error } = await supabase
      .from("questions")
      .update({ explanation: update.explanation, updated_at: new Date().toISOString() })
      .eq("id", update.question.id);
    if (error) throw new Error(formatSupabaseError(error));
  }

  if (!APPLY) {
    console.log("No database rows were changed. Rerun with --apply to update Supabase.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
