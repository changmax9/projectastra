#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
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
const SKIP_DIRS = new Set([".git", ".next", "node_modules", ".test-build", "tmp"]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".example",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx"
]);

const errors = [];
const warnings = [];

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) errors.push(`Missing ${relativePath}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function checkEnvExample() {
  requireFile(".env.example");
  if (!fs.existsSync(path.join(ROOT, ".env.example"))) return;
  const contents = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  for (const name of REQUIRED_ENV_NAMES) {
    if (!new RegExp(`^${name}=`, "m").test(contents)) errors.push(`.env.example is missing ${name}`);
  }
  if (fs.existsSync(path.join(ROOT, ".env.local"))) {
    warnings.push(".env.local exists locally. It is gitignored and must not be committed.");
  }
}

function checkPackageScripts() {
  const pkg = readJson("package.json");
  for (const scriptName of ["build", "start"]) {
    if (!pkg.scripts?.[scriptName]) errors.push(`package.json is missing scripts.${scriptName}`);
  }
  for (const scriptName of ["seed:supabase:dry", "seed:supabase", "check:supabase", "predeploy"]) {
    if (!pkg.scripts?.[scriptName]) errors.push(`package.json is missing scripts.${scriptName}`);
  }
}

function checkAssets() {
  const assetsPath = path.join(ROOT, "public", "assets", "questions");
  if (!fs.existsSync(assetsPath)) {
    errors.push("Missing public/assets/questions");
    return;
  }
  const files = collectFiles(assetsPath);
  if (files.length === 0) warnings.push("public/assets/questions exists but contains no files.");
}

function checkForbiddenMockImagePaths() {
  const mockPath = path.join(ROOT, ".mock-db.json");
  if (!fs.existsSync(mockPath)) {
    warnings.push(".mock-db.json is missing locally. That is fine for production, but seed scripts need it.");
    return;
  }
  warnings.push(".mock-db.json is a local fallback and seed source only. Vercel production should use Supabase.");
  const db = JSON.parse(fs.readFileSync(mockPath, "utf8"));
  const violations = [];
  for (const question of db.questions || []) {
    const imagePaths = [
      ...(question.question_images || []).map((image) => image.url || image.path || image.file_url),
      ...(question.choices || []).map((choice) => choice.image_url)
    ].filter(Boolean);
    for (const imagePath of imagePaths) {
      const forbidden = FORBIDDEN_IMAGE_PATH_PARTS.find((part) => String(imagePath).toLowerCase().includes(part));
      if (forbidden) violations.push(`${question.id}: ${imagePath}`);
    }
  }
  if (violations.length > 0) {
    errors.push(`Forbidden screenshot-like question image paths found:\n${violations.join("\n")}`);
  }
}

function checkServiceRoleSafety() {
  const files = collectFiles(ROOT).filter((file) => TEXT_EXTENSIONS.has(path.extname(file)) || file.endsWith(".env.example"));
  const suspicious = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file);
    if (relative === ".env.example") continue;
    const contents = fs.readFileSync(file, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const assignment = line.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+?)\s*$/);
      if (assignment && assignment[1].trim() && !assignment[1].includes("<") && assignment[1] !== "your-service-role-key") {
        suspicious.push(relative);
      }
    }
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(contents)) {
      suspicious.push(relative);
    }
  }
  if (suspicious.length > 0) {
    errors.push(`Possible hardcoded secret or JWT found in repo files: ${[...new Set(suspicious)].join(", ")}`);
  }
}

function warnIfDevServerRunning() {
  try {
    const result = childProcess.spawnSync("ps", ["-axo", "command"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status !== 0) throw new Error(result.stderr || "ps failed");
    const output = result.stdout;
    if (/next dev/.test(output)) {
      warnings.push("A Next dev server appears to be running. Stop it before running npm run build to avoid stale .next chunks.");
    }
  } catch {
    warnings.push("Could not inspect running processes for next dev.");
  }
}

checkEnvExample();
checkPackageScripts();
checkAssets();
checkForbiddenMockImagePaths();
checkServiceRoleSafety();
warnIfDevServerRunning();

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("Predeploy check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Predeploy check passed.");
