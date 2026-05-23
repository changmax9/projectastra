#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const FORBIDDEN_IMAGE_RE =
  /(?:\b(?:mcq|frq)-page(?:-\d+)?|page-screenshot|full-page|pdf-page|pdf-page-image|whole-page|question-screenshot|full-question)/i;

const NON_QUESTION_RE =
  /(?:table of contents|contents|exam instructions|general instructions|proctor|stop\s+end of section|unauthorized copying|copyright|college board|do not open|cover page|answer sheet|directions:|survey questions|complete this area|ap student pack|language —|have you lived|responses will not affect)/i;

const QUESTION_START_RE = /(?:^|\n)\s*(\d{1,3})[\).]\s+(?=\S)/g;
const CHOICE_MARKER_RE = /(?:^|\n|\s)\s*(?:\(([A-E])\)|([A-E])[\).])\s+(?=\S)/g;

function usage() {
  console.error("Usage: node scripts/convert-paddleocr-to-ap-draft.cjs input.json output.json");
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON file ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageText(page) {
  const markdownText = page?.markdown?.text;
  if (typeof markdownText === "string" && markdownText.trim()) {
    return normalizeWhitespace(markdownText);
  }

  const blocks = page?.prunedResult?.parsing_res_list;
  if (Array.isArray(blocks)) {
    return normalizeWhitespace(
      blocks
        .map((block) => block?.block_content)
        .filter((content) => typeof content === "string" && content.trim())
        .join("\n\n")
    );
  }

  return "";
}

function looksLikeQuestionPage(text) {
  if (!text) return false;
  if (NON_QUESTION_RE.test(text) && !/(?:\([A-E]\)|[A-E][\).])\s+.+(?:\([A-E]\)|[A-E][\).])/s.test(text)) {
    return false;
  }
  if (!QUESTION_START_RE.test(text)) {
    QUESTION_START_RE.lastIndex = 0;
    return false;
  }
  QUESTION_START_RE.lastIndex = 0;
  const lowValue = text.toLowerCase();
  const questionSignals = (lowValue.match(/\b(?:if|which|what|find|evaluate|let|given|shown|graph|function|table)\b/g) || []).length;
  const choiceSignals = (text.match(/\n\s*(?:\([A-E]\)|[A-E][\).])\s+/g) || []).length;
  return choiceSignals >= 2 || questionSignals >= 2 || !NON_QUESTION_RE.test(text);
}

function stripNoise(text) {
  return normalizeWhitespace(
    text
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^\d+\s*$/.test(trimmed)) return false;
        if (/^AP\s+.+Exam$/i.test(trimmed)) return false;
        if (/^©|copyright|unauthorized copying|go on to the next page/i.test(trimmed)) return false;
        return true;
      })
      .join("\n")
  );
}

function splitQuestions(text) {
  const cleaned = stripNoise(text);
  const matches = [...cleaned.matchAll(QUESTION_START_RE)];
  QUESTION_START_RE.lastIndex = 0;
  if (matches.length === 0) return [];

  return matches
    .map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = matches[index + 1]?.index ?? cleaned.length;
      const questionNumber = Number(match[1]);
      const body = normalizeWhitespace(cleaned.slice(start, end));
      return { questionNumber, body };
    })
    .filter((item) => item.questionNumber && item.body);
}

function splitChoices(body) {
  const matches = [...body.matchAll(CHOICE_MARKER_RE)];
  CHOICE_MARKER_RE.lastIndex = 0;
  if (matches.length < 2) {
    return { questionText: body, choices: [] };
  }

  const firstChoiceIndex = matches[0].index || 0;
  const questionText = normalizeWhitespace(body.slice(0, firstChoiceIndex));
  const choices = matches.map((match, index) => {
    const label = match[1] || match[2];
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    return {
      label,
      text: normalizeWhitespace(body.slice(start, end))
    };
  });

  return { questionText, choices };
}

function findImagePaths(value, results = []) {
  if (!value) return results;
  if (typeof value === "string") {
    if (/\.(?:png|jpe?g|webp|svg)$/i.test(value) && !FORBIDDEN_IMAGE_RE.test(value)) {
      results.push(value);
    }
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => findImagePaths(item, results));
    return results;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/image|img|path|url/i.test(key)) findImagePaths(nested, results);
    }
  }
  return results;
}

function pageFigures(page, pageNumber) {
  const blocks = page?.prunedResult?.parsing_res_list;
  if (!Array.isArray(blocks)) return [];
  const figures = [];
  for (const [index, block] of blocks.entries()) {
    const label = [
      block?.block_label,
      block?.block_type,
      block?.type,
      block?.sub_type,
      block?.category
    ]
      .map((item) => String(item || ""))
      .join(" ");
    if (!/(figure|image|diagram|graph|chart|plot|table)/i.test(label)) continue;
    const paths = [...new Set(findImagePaths(block))].filter((imagePath) => !FORBIDDEN_IMAGE_RE.test(imagePath));
    paths.forEach((imagePath, imageIndex) => {
      figures.push({
        id: `p${pageNumber}-figure-${index + 1}-${imageIndex + 1}`,
        path: imagePath,
        caption: block?.block_content ? normalizeWhitespace(block.block_content).slice(0, 160) : null,
        alt: `Figure from page ${pageNumber}`
      });
    });
  }
  return figures;
}

function inferCourse(allText) {
  const explicit = process.env.AP_COURSE;
  if (explicit) return explicit;
  const match = allText.match(/AP\s+(?:Calculus\s+AB|Calculus\s+BC|Statistics|Physics\s+C[^,\n]*|Physics\s+[12]|Chemistry|Biology|Psychology|Computer Science\s+(?:A|Principles)|English\s+(?:Language|Literature)|US History|World History|Government|Macroeconomics|Microeconomics)/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "AP Course";
}

function inferYear(allText) {
  if (process.env.AP_YEAR) return Number(process.env.AP_YEAR);
  const match = allText.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferExamId(course, year) {
  if (process.env.AP_EXAM_ID) return process.env.AP_EXAM_ID;
  return `${course.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${year || "draft"}`;
}

function inferSection(text) {
  if (process.env.AP_SECTION) return process.env.AP_SECTION;
  if (/free response|section ii|frq/i.test(text)) return "FRQ";
  if (/calculator/i.test(text) && /no calculator|non-calculator/i.test(text)) return "MCQ_NON_CALCULATOR";
  if (/calculator/i.test(text)) return "MCQ_CALCULATOR";
  return "MCQ";
}

function inferCalculatorAllowed(section, text) {
  if (process.env.AP_CALCULATOR_ALLOWED) return process.env.AP_CALCULATOR_ALLOWED === "true";
  if (/no calculator|non-calculator/i.test(section) || /no calculator|non-calculator/i.test(text)) return false;
  if (/calculator/i.test(section) || /calculator/i.test(text)) return true;
  return null;
}

function difficultyFromEnv() {
  const difficulty = String(process.env.AP_DIFFICULTY || "medium").toLowerCase();
  return ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
}

function validateQuestion(question, imageFilesMustExist) {
  const errors = [];
  if (!question.id) errors.push("id is required");
  if (!question.course) errors.push(`${question.id}: course is required`);
  if (!question.section) errors.push(`${question.id}: section is required`);
  if (!question.questionNumber) errors.push(`${question.id}: questionNumber is required`);
  if (!question.questionText && (!question.promptParts || question.promptParts.length === 0)) {
    errors.push(`${question.id}: questionText or promptParts is required`);
  }
  if (question.questionType.startsWith("mcq")) {
    if (!Array.isArray(question.choices) || question.choices.length < 2) {
      errors.push(`${question.id}: MCQ requires at least two choices`);
    }
  }
  for (const image of question.images || []) {
    if (FORBIDDEN_IMAGE_RE.test(image.path)) {
      errors.push(`${question.id}: forbidden whole-page image path ${image.path}`);
    }
    if (imageFilesMustExist && image.path.startsWith("/")) {
      const localPath = path.join(process.cwd(), "public", image.path);
      if (!fs.existsSync(localPath)) errors.push(`${question.id}: image file does not exist: ${image.path}`);
    }
  }
  return errors;
}

function convert(input) {
  const pages = Array.isArray(input) ? input : input?.layoutParsingResults;
  if (!Array.isArray(pages)) {
    throw new Error("Input root must be an array of page results or contain layoutParsingResults: [...]");
  }

  const pageRecords = pages.map((page, index) => ({
    page,
    pageNumber: index + 1,
    text: pageText(page)
  }));
  const allText = pageRecords.map((record) => record.text).join("\n\n");
  const course = inferCourse(allText);
  const year = inferYear(allText);
  const examId = inferExamId(course, year);
  const difficulty = difficultyFromEnv();
  const output = [];

  for (const record of pageRecords) {
    if (!looksLikeQuestionPage(record.text)) continue;
    const section = inferSection(record.text);
    const questionType = /frq/i.test(section) ? "frq" : "mcq_single";
    const calculatorAllowed = inferCalculatorAllowed(section, record.text);
    const figures = pageFigures(record.page, record.pageNumber);
    const questions = splitQuestions(record.text);

    for (const item of questions) {
      const { questionText, choices } = splitChoices(item.body);
      if (!questionText && choices.length === 0) continue;
      const id = `${examId}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(item.questionNumber).padStart(3, "0")}`;
      output.push({
        id,
        examId,
        course,
        year,
        section,
        questionNumber: item.questionNumber,
        questionType: questionType === "frq" ? "frq" : choices.length > 0 ? "mcq_single" : "frq",
        calculatorAllowed,
        questionText,
        choices,
        correctAnswer: null,
        promptParts: [],
        images: figures,
        topic: "Uncategorized",
        difficulty,
        tags: [
          "paddleocr-import",
          `source-page:${record.pageNumber}`,
          questionType === "frq" ? "frq" : "mcq"
        ],
        status: "draft",
        source: {
          provider: "PaddleOCR",
          page: record.pageNumber
        }
      });
    }
  }

  return output;
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) usage();

  const input = readJson(inputPath);
  const converted = convert(input);
  if (!Array.isArray(converted)) {
    throw new Error("Converter output must be an array.");
  }
  if (converted.length === 0) {
    throw new Error("No questions were extracted. Check the PaddleOCR JSON text blocks.");
  }

  const imageFilesMustExist = process.env.CHECK_IMAGE_FILES === "true";
  const errors = converted.flatMap((question) => validateQuestion(question, imageFilesMustExist));
  if (errors.length > 0) {
    console.error("Validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  writeJson(outputPath, converted);
  console.log(`Converted ${converted.length} questions.`);
  console.log(`Wrote ${outputPath}`);
}

main();
