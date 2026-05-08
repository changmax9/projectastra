#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

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

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, ".mock-db.json");
const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run") || !APPLY;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function readMockDb() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Missing ${DB_PATH}. Run the app once in mock mode or restore the stable mock database.`);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function normalizeImagePath(value) {
  return String(value || "").trim();
}

function checkForbiddenImagePaths(db) {
  const violations = [];
  for (const question of db.questions || []) {
    for (const image of question.question_images || []) {
      const imagePath = normalizeImagePath(image.url || image.path || image.file_url);
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) {
        violations.push(`Question ${question.id}: image path contains forbidden screenshot reference "${forbidden}": ${imagePath}`);
      }
    }
    for (const choice of question.choices || []) {
      const imagePath = normalizeImagePath(choice.image_url);
      if (!imagePath) continue;
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) {
        violations.push(`Question ${question.id} choice ${choice.id}: image path contains forbidden screenshot reference "${forbidden}": ${imagePath}`);
      }
    }
  }
  return violations;
}

function ensurePublicAssetsExist(db) {
  const missing = [];
  for (const question of db.questions || []) {
    const paths = [
      ...(question.question_images || []).map((image) => image.url || image.path || image.file_url),
      ...(question.choices || []).map((choice) => choice.image_url)
    ].filter(Boolean);
    for (const assetPath of paths) {
      if (!String(assetPath).startsWith("/assets/questions/")) continue;
      const absolute = path.join(ROOT, "public", String(assetPath));
      if (!fs.existsSync(absolute)) missing.push(`${question.id}: ${assetPath}`);
    }
  }
  return missing;
}

function withoutKeys(record, keys) {
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}

function questionImagesFromDb(db) {
  return (db.questions || []).flatMap((question) =>
    (question.question_images || []).map((image, index) => ({
      id: image.id,
      question_id: question.id,
      file_url: image.url || image.path || image.file_url,
      caption: image.caption || null,
      alt: image.alt || null,
      sort_order: index + 1
    }))
  );
}

function examSectionsFromDb(db) {
  return (db.exams || []).flatMap((exam) =>
    (exam.sections || []).map((section) => ({
      id: section.id,
      exam_id: exam.id,
      section: section.section,
      title: section.title,
      question_count: section.questionCount,
      time_limit_minutes: section.timeLimitMinutes,
      calculator_allowed: section.calculatorAllowed,
      order_index: section.order
    }))
  );
}

function chunk(items, size = 100) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function upsertChunks(supabase, table, rows, options = undefined) {
  if (!rows.length) return;
  for (const rowsChunk of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(rowsChunk, options);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function ensureUser(supabase, email, password, fullName, role) {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error } = await supabase.from("profiles").upsert({
      id: existing.id,
      email,
      full_name: fullName,
      role
    });
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (error || !data.user) throw error || new Error(`Unable to create ${email}`);
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role
  });
  if (profileError) throw profileError;
  return data.user.id;
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const db = readMockDb();
  const forbidden = checkForbiddenImagePaths(db);
  const missingAssets = ensurePublicAssetsExist(db);
  if (forbidden.length > 0) {
    throw new Error(`Forbidden full-page/question screenshot image paths found:\n${forbidden.join("\n")}`);
  }
  if (missingAssets.length > 0) {
    throw new Error(`Question image assets are missing from public/:\n${missingAssets.join("\n")}`);
  }

  const questionImages = questionImagesFromDb(db);
  const examSections = examSectionsFromDb(db);
  const summary = {
    profiles: (db.profiles || []).length,
    exams: (db.exams || []).length,
    examSections: examSections.length,
    questions: (db.questions || []).length,
    questionImages: questionImages.length,
    examQuestions: (db.examQuestions || []).length,
    reviewGuides: (db.reviewGuides || []).length,
    reviewGuideQuestions: (db.reviewGuideQuestions || []).length,
    skippedAttempts: (db.submissions || []).length,
    skippedAnswers: (db.answers || []).length
  };

  console.log(DRY_RUN ? "Supabase seed dry run" : "Applying Supabase seed");
  console.table(summary);

  if (DRY_RUN) {
    console.log("Dry run only. No Supabase writes were performed.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
  const studentEmail = process.env.STUDENT_EMAIL || "student@example.com";
  const studentPassword = process.env.STUDENT_PASSWORD || "student123456";
  const adminId = await ensureUser(supabase, adminEmail, adminPassword, "Platform Admin", "admin");
  await ensureUser(supabase, studentEmail, studentPassword, "Demo Student", "student");

  const exams = (db.exams || []).map((exam) => ({
    ...withoutKeys(exam, ["sections"]),
    created_by: adminId
  }));
  const questions = (db.questions || []).map((question) => ({
    ...question,
    created_by: adminId
  }));
  const guides = (db.reviewGuides || []).map((guide) => ({
    ...guide,
    created_by: adminId
  }));

  await upsertChunks(supabase, "exams", exams);
  await upsertChunks(supabase, "exam_sections", examSections, { onConflict: "exam_id,section" });
  await upsertChunks(supabase, "questions", questions);
  await upsertChunks(supabase, "question_images", questionImages);
  await upsertChunks(supabase, "exam_questions", db.examQuestions || [], { onConflict: "exam_id,question_id" });
  await upsertChunks(supabase, "review_guides", guides);
  await upsertChunks(supabase, "review_guide_questions", db.reviewGuideQuestions || [], {
    onConflict: "review_guide_id,question_id"
  });

  console.log("Supabase seed complete.");
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`Student: ${studentEmail} / ${studentPassword}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
