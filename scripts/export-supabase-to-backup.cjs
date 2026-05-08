#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups");
const PAGE_SIZE = 1000;
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

const EXPORT_TABLES = [
  {
    name: "profiles",
    select: "id,email,role",
    order: "email"
  },
  {
    name: "exams",
    select: "*",
    order: "id"
  },
  {
    name: "exam_sections",
    select: "*",
    order: "exam_id,order_index"
  },
  {
    name: "questions",
    select: "*",
    order: "id"
  },
  {
    name: "question_images",
    select: "*",
    order: "question_id,sort_order"
  },
  {
    name: "exam_questions",
    select: "*",
    order: "exam_id,order_index"
  },
  {
    name: "review_guides",
    select: "*",
    order: "id"
  },
  {
    name: "review_guide_questions",
    select: "*",
    order: "review_guide_id,order_index"
  }
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

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "-" + [pad(date.getHours()), pad(date.getMinutes())].join("-");
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

function applyOrdering(query, orderValue) {
  if (!orderValue) return query;
  return orderValue.split(",").reduce((current, column) => current.order(column.trim(), { ascending: true }), query);
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(table.name).select(table.select);
    query = applyOrdering(query, table.order).range(from, to);
    const { data, error } = await query;
    if (error) {
      console.error(`export ${table.name}: error`);
      console.error(formatSupabaseError(error));
      throw new Error(`${table.name}: export failed`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  console.log(`export ${table.name}: ${rows.length}`);
  return rows;
}

function checkForbiddenImagePaths(data) {
  const warnings = [];
  const questionsById = new Map((data.questions || []).map((question) => [question.id, question]));

  for (const image of data.question_images || []) {
    const imagePath = String(image.file_url || "");
    const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
    if (forbidden) {
      warnings.push(`Question ${image.question_id}: question_images.file_url contains "${forbidden}": ${imagePath}`);
    }
  }

  for (const question of data.questions || []) {
    for (const image of question.question_images || []) {
      const imagePath = String(image.url || image.path || image.file_url || "");
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) {
        warnings.push(`Question ${question.id}: questions.question_images contains "${forbidden}": ${imagePath}`);
      }
    }
    for (const choice of question.choices || []) {
      const imagePath = String(choice.image_url || "");
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => imagePath.toLowerCase().includes(part));
      if (forbidden) {
        warnings.push(`Question ${question.id} choice ${choice.id}: choice image contains "${forbidden}": ${imagePath}`);
      }
    }
  }

  for (const warning of warnings) {
    const match = warning.match(/Question ([^:]+)/);
    const question = match ? questionsById.get(match[1]) : null;
    if (question?.question_number) {
      console.warn(`WARNING: ${warning} (question number ${question.question_number})`);
    } else {
      console.warn(`WARNING: ${warning}`);
    }
  }
  return warnings;
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const data = {};
  for (const table of EXPORT_TABLES) {
    data[table.name] = await fetchAllRows(supabase, table);
  }

  const forbiddenImageWarnings = checkForbiddenImagePaths(data);
  const tableCounts = Object.fromEntries(EXPORT_TABLES.map((table) => [table.name, data[table.name].length]));
  const backup = {
    metadata: {
      exportedAt: new Date().toISOString(),
      projectUrl: url,
      tableCounts,
      forbiddenImageWarnings
    },
    data
  };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const outputPath = path.join(BACKUP_DIR, `supabase-question-bank-${formatTimestamp()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2) + "\n", "utf8");

  console.log("Backup written:");
  console.log(outputPath);
  console.log("Table counts:");
  console.table(tableCounts);
  if (forbiddenImageWarnings.length > 0) {
    console.warn(`Forbidden screenshot-like image path warnings: ${forbiddenImageWarnings.length}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
