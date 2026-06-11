const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "..");
loadEnvConfig(root);

const python = process.env.PDF_OCR_PYTHON || process.env.PDF_TEXT_PYTHON || "D:\\Anaconda\\python.exe";
const tesseract = process.env.TESSERACT_CMD || "D:\\Codex\\tools\\tesseract-ocr\\tesseract.exe";
const pythonPath = process.env.PDF_OCR_PYTHONPATH || "D:\\Codex\\tools\\pdf-ocr-python";
const requiredPaths = [
  ["PDF OCR Python", python],
  ["Tesseract", tesseract],
  ["PDF OCR Python packages", pythonPath],
  ["Tesseract English model", path.join(path.dirname(tesseract), "tessdata", "eng.traineddata")]
];

const failures = [];
for (const [label, target] of requiredPaths) {
  if (!path.resolve(target).toUpperCase().startsWith("D:\\")) {
    failures.push(`${label} is not on D: ${target}`);
  } else if (!fs.existsSync(target)) {
    failures.push(`${label} was not found: ${target}`);
  }
}

if (failures.length === 0) {
  try {
    execFileSync(tesseract, ["--version"], { stdio: "pipe", windowsHide: true });
  } catch (error) {
    failures.push(`Tesseract could not run: ${error.message}`);
  }
  try {
    execFileSync(python, ["-c", "import fitz, PIL, pytesseract; print('ok')"], {
      env: { ...process.env, PYTHONPATH: [pythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
      stdio: "pipe",
      windowsHide: true
    });
  } catch (error) {
    failures.push(`Python OCR dependencies could not load: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error("Local OCR runtime check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Local OCR runtime check passed.");
  console.log(`Python: ${python}`);
  console.log(`Tesseract: ${tesseract}`);
  console.log(`Python packages: ${pythonPath}`);
}
