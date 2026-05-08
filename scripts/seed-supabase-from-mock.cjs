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
const TABLE_COLUMNS = {
  exams: [
    "id",
    "title",
    "description",
    "subject",
    "course",
    "year",
    "section",
    "exam_type",
    "time_limit_minutes",
    "status",
    "created_by",
    "created_at",
    "updated_at"
  ],
  questions: [
    "id",
    "exam_name",
    "subject",
    "course",
    "year",
    "section",
    "exam_type",
    "question_number",
    "unit",
    "topic",
    "difficulty",
    "type",
    "selection_type",
    "required_selections",
    "max_selections",
    "question_text",
    "question_images",
    "choices",
    "correct_answer",
    "explanation",
    "source_pdf",
    "tags",
    "status",
    "points",
    "time_estimate_seconds",
    "created_by",
    "created_at",
    "updated_at"
  ],
  exam_sections: [
    "id",
    "exam_id",
    "section",
    "title",
    "question_count",
    "time_limit_minutes",
    "calculator_allowed",
    "order_index"
  ],
  question_images: ["id", "question_id", "file_url", "caption", "alt", "sort_order"],
  exam_questions: ["id", "exam_id", "question_id", "order_index", "points_override"],
  review_guides: [
    "id",
    "title",
    "slug",
    "description",
    "subject",
    "unit",
    "topic",
    "difficulty",
    "content_markdown",
    "status",
    "cover_image_url",
    "estimated_reading_time_minutes",
    "created_by",
    "created_at",
    "updated_at",
    "published_at"
  ],
  review_guide_questions: ["id", "review_guide_id", "question_id", "order_index"]
};

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

function inferSubjectFromCourse(course) {
  const value = String(course || "").toLowerCase();
  if (value.includes("calculus") || value.includes("statistics")) return "Math";
  if (value.includes("physics")) return "Physics";
  if (value.includes("chemistry") || value.includes("biology")) return "Science";
  if (value.includes("computer science")) return "Computer Science";
  if (value.includes("english")) return "English";
  if (
    value.includes("history") ||
    value.includes("government") ||
    value.includes("economics") ||
    value.includes("psychology")
  ) {
    return "Social Studies";
  }
  return course || "General";
}

function normalizeExamForSeed(exam, adminId) {
  const legacySubject = exam.subject || "";
  const course = exam.course || (legacySubject.startsWith("AP ") ? legacySubject : legacySubject || exam.title);
  const subject = legacySubject.startsWith("AP ") ? inferSubjectFromCourse(course) : legacySubject || inferSubjectFromCourse(course);
  return pickColumns(
    {
      ...withoutKeys(exam, ["sections"]),
      subject,
      course,
      year: exam.year ?? null,
      section: exam.section || "Full Exam",
      exam_type: exam.exam_type || "Practice Exam",
      status: exam.status || "draft",
      created_by: adminId
    },
    "exams"
  );
}

function normalizeQuestionForSeed(question, adminId) {
  const legacySubject = question.subject || "";
  const course = question.course || question.exam_name || (legacySubject.startsWith("AP ") ? legacySubject : legacySubject || "AP Physics 1");
  const subject = legacySubject.startsWith("AP ") ? inferSubjectFromCourse(course) : legacySubject || inferSubjectFromCourse(course);
  const isSelectTwo = (question.tags || []).includes("select-two") || (question.tags || []).includes("multi-select");
  return pickColumns(
    {
      ...question,
      exam_name: question.exam_name || course,
      subject,
      course,
      year: question.year ?? null,
      section: question.section || (question.type === "frq" || (question.tags || []).includes("frq") ? "FRQ" : "MCQ"),
      exam_type: question.exam_type || "Practice Exam",
      question_number: question.question_number ?? null,
      selection_type: question.selection_type || (isSelectTwo ? "multiple" : "single"),
      required_selections: question.required_selections ?? (isSelectTwo ? 2 : 1),
      max_selections: question.max_selections ?? (isSelectTwo ? 2 : 1),
      question_images: question.question_images || [],
      choices: question.choices || [],
      correct_answer: question.correct_answer ?? null,
      source_pdf: question.source_pdf ?? null,
      tags: question.tags || [],
      status: question.status || "draft",
      created_by: adminId
    },
    "questions"
  );
}

function normalizeReviewGuideForSeed(guide, adminId) {
  return pickColumns(
    {
      ...guide,
      difficulty: guide.difficulty || "medium",
      cover_image_url: guide.cover_image_url || null,
      published_at: guide.published_at || null,
      created_by: adminId
    },
    "review_guides"
  );
}

function pickColumns(record, table) {
  const columns = TABLE_COLUMNS[table];
  if (!columns) return { ...record };
  return Object.fromEntries(columns.filter((column) => column in record).map((column) => [column, record[column]]));
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

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.error(`count ${table}: error`);
    console.error(formatSupabaseError(error));
    throw new Error(`${table}: unable to count rows`);
  }
  return count || 0;
}

async function upsertChunks(supabase, table, rows, options = undefined) {
  if (!rows.length) {
    console.log(`upsert ${table}: skipped 0 rows`);
    return 0;
  }
  let written = 0;
  for (const rowsChunk of chunk(rows)) {
    const sanitized = rowsChunk.map((row) => pickColumns(row, table));
    const { data, error } = await supabase.from(table).upsert(sanitized, options).select("id");
    if (error) {
      console.error(`upsert ${table}: error`);
      console.error(formatSupabaseError(error));
      console.error("First row attempted:");
      console.error(JSON.stringify(sanitized[0], null, 2));
      throw new Error(`${table}: upsert failed`);
    }
    written += data?.length || sanitized.length;
  }
  const currentCount = await countRows(supabase, table);
  console.log(`upsert ${table}: success ${written} rows attempted, table now has ${currentCount} rows`);
  return written;
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
    if (error) {
      console.error(`upsert profiles for ${email}: error`);
      console.error(formatSupabaseError(error));
      throw error;
    }
    console.log(`upsert profiles: ${email} exists, profile updated`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (error || !data.user) {
    if (error) console.error(formatSupabaseError(error));
    throw error || new Error(`Unable to create ${email}`);
  }
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role
  });
  if (profileError) {
    console.error(`upsert profiles for ${email}: error`);
    console.error(formatSupabaseError(profileError));
    throw profileError;
  }
  console.log(`upsert profiles: ${email} created`);
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

  const exams = (db.exams || []).map((exam) => normalizeExamForSeed(exam, adminId));
  const questions = (db.questions || []).map((question) => normalizeQuestionForSeed(question, adminId));
  const guides = (db.reviewGuides || []).map((guide) => normalizeReviewGuideForSeed(guide, adminId));

  await upsertChunks(supabase, "exams", exams);
  await upsertChunks(supabase, "exam_sections", examSections, { onConflict: "exam_id,section" });
  await upsertChunks(supabase, "questions", questions);
  await upsertChunks(supabase, "question_images", questionImages);
  await upsertChunks(supabase, "exam_questions", db.examQuestions || [], { onConflict: "exam_id,question_id" });
  await upsertChunks(supabase, "review_guides", guides);
  await upsertChunks(supabase, "review_guide_questions", db.reviewGuideQuestions || [], {
    onConflict: "review_guide_id,question_id"
  });

  const postSeedCounts = {
    exams: await countRows(supabase, "exams"),
    exam_sections: await countRows(supabase, "exam_sections"),
    questions: await countRows(supabase, "questions"),
    question_images: await countRows(supabase, "question_images"),
    exam_questions: await countRows(supabase, "exam_questions"),
    review_guides: await countRows(supabase, "review_guides"),
    review_guide_questions: await countRows(supabase, "review_guide_questions")
  };
  console.log("Post-seed table counts:");
  console.table(postSeedCounts);

  const expectedMinimums = {
    exams: summary.exams,
    exam_sections: summary.examSections,
    questions: summary.questions,
    question_images: summary.questionImages,
    exam_questions: summary.examQuestions,
    review_guides: summary.reviewGuides
  };
  const shortTables = Object.entries(expectedMinimums).filter(([table, expected]) => postSeedCounts[table] < expected);
  if (shortTables.length > 0) {
    throw new Error(
      `Seed completed with missing rows: ${shortTables
        .map(([table, expected]) => `${table} expected at least ${expected}, got ${postSeedCounts[table]}`)
        .join("; ")}`
    );
  }

  console.log("Supabase seed complete.");
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`Student: ${studentEmail} / ${studentPassword}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
