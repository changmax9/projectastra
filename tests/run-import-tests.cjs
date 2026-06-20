const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildRoot = path.join(root, ".test-build");

execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    path.join(root, "tests", "tsconfig.import-tests.json")
  ],
  { cwd: root, stdio: "inherit" }
);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(buildRoot, request.slice(2));
    const withJs = `${target}.js`;
    if (fs.existsSync(withJs)) return withJs;
    if (fs.existsSync(target)) return target;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { parseAdminQuestionImportJson } = require(path.join(buildRoot, "lib", "ap-question-format.js"));
const { normalizeMathDelimiters } = require(path.join(buildRoot, "lib", "math-markdown.js"));
const { analyzePdfUpload } = require(path.join(buildRoot, "lib", "pdf.js"));

function source(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function pdfString(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function makeTextPdf(filePath, pages) {
  const objects = [];
  const fontObjectNumber = 3 + pages.length * 2;
  objects[0] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((item) => `${item} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`;

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const textOps = [
      "BT",
      "/F1 11 Tf",
      "50 760 Td",
      ...lines.flatMap((line, lineIndex) => [
        lineIndex === 0 ? "" : "0 -15 Td",
        `(${pdfString(line)}) Tj`
      ]).filter(Boolean),
      "ET"
    ].join("\n");
    objects[pageObject - 1] =
      `${pageObject} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObject} 0 R >>\nendobj\n`;
    objects[contentObject - 1] =
      `${contentObject} 0 obj\n<< /Length ${Buffer.byteLength(textOps, "binary")} >>\nstream\n${textOps}\nendstream\nendobj\n`;
  });

  objects[fontObjectNumber - 1] = `${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects.filter(Boolean)) {
    offsets.push(Buffer.byteLength(body, "binary"));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, "binary");
  body += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "binary");
}

function uploadFor(filePath, id) {
  return {
    id,
    file_name: path.basename(filePath),
    file_url: filePath,
    subject: "AP Physics 1",
    unit: "Fixture tests",
    topic: "PDF import",
    status: "uploaded",
    uploaded_by: null,
    created_at: new Date("2026-05-24T00:00:00.000Z").toISOString(),
    updated_at: new Date("2026-05-24T00:00:00.000Z").toISOString()
  };
}

async function runPdfFixtureAssertions() {
  const fixtureDir = path.join(buildRoot, "pdf-fixtures");
  const answerKeyPath = path.join(fixtureDir, "answer-key-with-explanations.pdf");
  const neutralRubricPath = path.join(fixtureDir, "neutral-rubric-content.pdf");
  const mixedPromptScoringPath = path.join(fixtureDir, "mixed-prompt-and-scoring.pdf");
  const questionGroupExportPath = path.join(fixtureDir, "question-group-export.pdf");

  makeTextPdf(answerKeyPath, [
    `1. Which claim is supported by the table below?
A. Energy is conserved
B. Momentum is always zero
C. Time is negative
D. Mass disappears

2. What quantity is a vector?
A. Speed
B. Displacement
C. Temperature
D. Time`,
    `Answer Key
1. A
2. B
Explanations
1. The table values support conservation across the listed states.
2. Displacement includes both magnitude and direction.`
  ]);
  makeTextPdf(neutralRubricPath, [
    `Sample Response A
Scoring criteria
One point is earned for identifying the independent variable.
One point is earned for connecting evidence to the claim.
The response does not earn the graph interpretation point.
Commentary: This student sample is partially correct.`,
    `Question 1
Scoring Guidelines
Maximum points: 4
Acceptable responses include a valid claim, evidence, and reasoning.
Row A: 1 point awarded for a claim.
Row B: 1 point awarded for evidence.`
  ]);
  makeTextPdf(mixedPromptScoringPath, [
    `1. Which claim is best supported by the graph shown below?
A. The slope is positive
B. The slope is negative
C. The y-value is constant
D. The x-value is zero`,
    `Scoring Guidelines
One point is earned for selecting the positive-slope claim.
The response does not earn the point if it describes an unrelated table.`
  ]);
  makeTextPdf(questionGroupExportPath, [
    `All Question Groups
Source: AP Statistics Practice
2
46
2
GROUPS
QUESTIONS
SECTIONS
CONTENTS
Section 0, Module 0: Section I
NORMAL
40 questions
Which of the following is closest to the 60th percentile of the distribution?
1
The dotplot shows fuel economy for 50 car models.
A. 20 mpg
B. 25 mpg
C. 30 mpg
D. 35 mpg
E. 45 mpg
Answer: D
Of the following, which is the best method for assigning treatments?
2
A school district will compare three plans using a randomized block design.
A. Randomly assigning all students among the three plans
B. Randomly assigning juniors among the three plans and seniors among the three plans
C. Assigning juniors to Plan A and seniors to Plan B
D. Letting students pick their preferred plan
E. Assigning all seniors to Plan C
Answer: B`
  ]);

  const answerKey = await analyzePdfUpload(uploadFor(answerKeyPath, "fixture-answer-key"));
  assert.equal(answerKey.status, "needs_review", "fixture answer-key PDF creates review drafts");
  assert.equal(answerKey.draftQuestions.length, 2, "fixture answer-key PDF creates two drafts");
  assert.equal(answerKey.draftQuestions[0].correct_answer, "A", "fixture answer key attaches explicit answer A");
  assert.equal(answerKey.draftQuestions[1].correct_answer, "B", "fixture answer key attaches explicit answer B");
  assert.match(answerKey.draftQuestions[0].explanation, /conservation/i, "fixture explanation is attached from explicit source text");
  assert.match(answerKey.draftQuestions[1].explanation, /magnitude and direction/i, "second fixture explanation is attached from explicit source text");
  assert.match(answerKey.warnings.join(" "), /Matched explicit explanation\/rationale entries to 2 draft/, "fixture job warns about cited explanation matching");
  assert.match(answerKey.draftQuestions[0].warnings.join(" "), /Explanation matched from explicit explanation\/rationale page 2/, "fixture draft cites explanation source page");

  const neutralRubric = await analyzePdfUpload(uploadFor(neutralRubricPath, "fixture-neutral-rubric"));
  assert.equal(neutralRubric.status, "failed", "neutral filename rubric fixture fails closed");
  assert.equal(neutralRubric.draftQuestions.length, 0, "neutral filename rubric fixture creates no drafts");
  assert.match(neutralRubric.warnings.join(" "), /Content-based scoring-guide detection suppressed draft generation/, "neutral rubric fixture uses content-based suppression");

  const mixedPromptScoring = await analyzePdfUpload(uploadFor(mixedPromptScoringPath, "fixture-mixed-prompt-scoring"));
  assert.equal(mixedPromptScoring.status, "needs_review", "mixed prompt/scoring fixture keeps valid prompt drafts");
  assert.equal(mixedPromptScoring.draftQuestions.length, 1, "mixed prompt/scoring fixture excludes scoring page without suppressing prompt page");
  assert.match(mixedPromptScoring.warnings.join(" "), /Excluded 1 scoring\/rubric-only page/, "mixed prompt/scoring fixture reports scoring page exclusion");

  const questionGroupExport = await analyzePdfUpload(uploadFor(questionGroupExportPath, "fixture-question-group-export"));
  assert.equal(questionGroupExport.status, "needs_review", "question-group export fixture creates review drafts");
  assert.equal(questionGroupExport.draftQuestions.length, 2, "answer-delimited export fallback creates two drafts");
  assert.equal(questionGroupExport.draftQuestions[0].question_number, 1, "answer-delimited export preserves question 1");
  assert.equal(questionGroupExport.draftQuestions[0].correct_answer, "D", "answer-delimited export attaches answer D");
  assert.equal(questionGroupExport.draftQuestions[1].question_number, 2, "answer-delimited export preserves question 2");
  assert.equal(questionGroupExport.draftQuestions[1].correct_answer, "B", "answer-delimited export attaches answer B");
  assert.match(questionGroupExport.warnings.join(" "), /answer-delimited MCQ fallback segmentation/, "question-group export warns about fallback segmentation");
}

function validDraft(overrides = {}) {
  return {
    id: "ap-physics1-2023-mcq-01",
    examName: "AP Physics 1",
    year: 2023,
    section: "MCQ",
    questionNumber: 1,
    questionText: "A cart starts from rest. What is its displacement?",
    choices: [
      { label: "A", text: "\\(4.0\\,m\\)" },
      { label: "B", text: "\\(8.0\\,m\\)" },
      { label: "C", text: "\\(16\\,m\\)" },
      { label: "D", text: "\\(32\\,m\\)" }
    ],
    answer: "C",
    explanation: "Use \\(x = \\frac12 at^2\\).",
    topic: "Kinematics",
    difficulty: "Easy",
    images: [],
    tags: ["unit-1"],
    sourcePdfPage: 2,
    status: "draft",
    ...overrides
  };
}

function expectInvalid(name, input, pattern) {
  const result = parseAdminQuestionImportJson([input]);
  assert.equal(result.ok, false, name);
  assert.match(result.errors.map((error) => error.message).join(" "), pattern, name);
}

expectInvalid(
  "rejects mcq-page image paths",
  validDraft({ images: [{ id: "bad", path: "/uploads/ap-physics-1-2023-mcq-page-2.png" }] }),
  /forbidden full-page screenshot reference/
);

expectInvalid(
  "rejects frq-page image paths",
  validDraft({ images: [{ id: "bad", path: "/uploads/ap-physics-1-2023-frq-page-3.png" }] }),
  /forbidden full-page screenshot reference/
);

expectInvalid(
  "rejects full-question image paths",
  validDraft({ images: [{ id: "bad", path: "/uploads/ap-physics-1-2023-full-question-3.png" }] }),
  /forbidden full-page screenshot reference/
);

expectInvalid(
  "rejects PDF import page preview images",
  validDraft({ images: [{ id: "bad", path: "/uploads/pdf-import-pages/job-1/page-001.png" }] }),
  /forbidden full-page screenshot reference/
);

expectInvalid(
  "rejects MCQ without choices",
  validDraft({ choices: [], answer: "A" }),
  /MCQ questions require choices/
);

expectInvalid(
  "rejects answers outside choice labels",
  validDraft({ questionNumber: 12, answer: "E" }),
  /answer "E" does not match choices A\/B\/C\/D/
);

expectInvalid(
  "rejects invalid status",
  validDraft({ status: "ready" }),
  /Invalid enum value|Invalid option/
);

const normalImage = parseAdminQuestionImportJson([
  validDraft({ images: [{ id: "figure-1", path: "/assets/questions/ap-physics1-2023-q1-figure1.png" }] })
]);
assert.equal(normalImage.ok, true, "allows cropped question figures");
assert.equal(normalImage.data.questions[0].question_images[0].url, "/assets/questions/ap-physics1-2023-q1-figure1.png");

const valid = parseAdminQuestionImportJson([validDraft()]);
assert.equal(valid.ok, true, "valid AP draft JSON imports");
assert.equal(valid.sourceFormat, "ap-draft");
assert.equal(valid.data.exam.subject, "Physics");
assert.equal(valid.data.exam.course, "AP Physics 1");
assert.equal(valid.data.questions[0].correct_answer, "C");

const calculus = parseAdminQuestionImportJson({
  exam: {
    id: "ap-calculus-ab-2024-mcq",
    title: "AP Calculus AB 2024 MCQ Practice",
    subject: "Math",
    course: "AP Calculus AB",
    year: 2024,
    section: "MCQ",
    examType: "Practice Exam",
    estimatedTimeMinutes: 90,
    status: "draft"
  },
  questions: [
    validDraft({
      id: "ap-calculus-ab-2024-mcq-01",
      examName: "AP Calculus AB",
      subject: "Math",
      course: "AP Calculus AB",
      year: 2024,
      questionText: "Find \\(f'(x)\\)."
    })
  ]
});
assert.equal(calculus.ok, true, "top-level exam metadata imports");
assert.equal(calculus.data.exam.subject, "Math");
assert.equal(calculus.data.exam.course, "AP Calculus AB");
assert.equal(calculus.data.questions[0].course, "AP Calculus AB");

assert.equal(
  normalizeMathDelimiters("\\(L_0/t_0\\)"),
  "$L_0/t_0$",
  "normalizes AP-style inline LaTeX delimiters"
);
assert.equal(
  normalizeMathDelimiters("\\[\\frac{2L_0}{3t_0}\\]"),
  "$$\n\\frac{2L_0}{3t_0}\n$$",
  "normalizes AP-style block LaTeX delimiters"
);

const questionImageAsset = source("components/exam/QuestionImageAsset.tsx");
assert.match(questionImageAsset, /h-auto max-w-full object-contain/, "QuestionImageAsset preserves image aspect ratio");
assert.doesNotMatch(questionImageAsset, /object-cover|max-h|overflow-hidden/, "QuestionImageAsset does not crop images");

const choiceList = source("components/exam/ChoiceList.tsx");
assert.match(choiceList, /MathMarkdown[\s\S]*content=\{choice\.text\}/, "ChoiceList renders choices through MathMarkdown");
assert.match(choiceList, /QuestionImageAsset/, "ChoiceList renders choice images through QuestionImageAsset");
assert.doesNotMatch(choiceList, /object-cover|max-h|overflow-hidden/, "ChoiceList does not crop choice images");

const questionRenderer = source("components/exam/QuestionRenderer.tsx");
assert.match(questionRenderer, /MathMarkdown content=\{question\.question_text\}/, "QuestionRenderer uses shared math renderer");
assert.match(questionRenderer, /QuestionImageAsset/, "QuestionRenderer uses shared image renderer");
assert.doesNotMatch(questionRenderer, /object-cover|max-h|overflow-hidden/, "QuestionRenderer does not crop question images");

const resultReview = source("components/exam/ResultQuestionReview.tsx");
assert.match(resultReview, /MathMarkdown content=\{explanation\}/, "explanations use shared math renderer");
assert.match(resultReview, /Explanation coming soon\./, "placeholder explanations are replaced for students");

const appHeader = source("components/layout/AppHeader.tsx");
assert.match(appHeader, /getCurrentProfile/, "AppHeader reads the server auth profile");
assert.match(appHeader, /href="\/dashboard"/, "logged-in header links to dashboard");
assert.match(appHeader, /href="\/login"/, "logged-out header links to login");
assert.match(appHeader, /signOutAction/, "logged-in header exposes sign out");

const homePage = source("app/page.tsx");
assert.match(homePage, /getCurrentProfile/, "home page reads auth state for CTA");
assert.match(homePage, /profile \? "\/dashboard" : "\/register"/, "logged-in Start practicing goes to dashboard");

const takeExamClient = source("components/exam/TakeExamClient.tsx");
assert.doesNotMatch(takeExamClient, /window\.confirm|window\.alert/, "exam flow does not use native browser dialogs");
assert.match(takeExamClient, /role="dialog"/, "exam confirmations use an in-app modal dialog");
assert.match(takeExamClient, /Save & Exit/, "exam page exposes Save & Exit");
assert.match(takeExamClient, /saveExamProgressAction/, "Save & Exit persists attempt progress");
assert.match(takeExamClient, /maxSelections=\{currentMaxSelections\}/, "Select Two questions pass a max-selection limit");
assert.match(takeExamClient, /timeSpentSeconds: elapsedSeconds\(\)/, "Submit uses the current elapsed time");
assert.match(takeExamClient, /onChange=\{handleChoiceChange\}/, "choice clicks update local state through a stable handler");
assert.doesNotMatch(takeExamClient, /updateResponse\(currentQuestion\.id, \{ selectedChoice: choiceId \}, true\)/, "choice clicks do not immediately persist and refresh the route");

const choiceListSource = source("components/exam/ChoiceList.tsx");
assert.match(choiceListSource, /type="button"/, "choice buttons cannot submit parent forms");
assert.match(choiceListSource, /next\.size < maxSelections/, "Select Two questions cannot exceed their max selection count");
assert.match(choiceListSource, /Select \{requiredSelections === 2 \? "TWO"/, "Select Two UI makes the required count clear");
assert.match(choiceListSource, /Eliminate choice/, "choice list exposes an option-elimination control");
assert.match(choiceListSource, /Restore choice/, "choice list exposes a restore control for eliminated choices");
assert.match(choiceListSource, /eliminatedChoiceIds\?: string\[\]/, "ChoiceList accepts eliminatedChoiceIds");
assert.match(choiceListSource, /onToggleEliminated\?: \(choiceId: string\) => void/, "ChoiceList accepts onToggleEliminated");
assert.match(choiceListSource, /event\.stopPropagation\(\)/, "eliminator clicks do not trigger answer selection");
assert.match(choiceListSource, /line-through/, "eliminated choices receive a cancel-out visual treatment");
assert.match(takeExamClient, /eliminatedChoiceIds/, "exam client tracks eliminated choices locally");
const responseSnapshotBlock = takeExamClient.slice(
  takeExamClient.indexOf("const responseSnapshot"),
  takeExamClient.indexOf("const elapsedSeconds")
);
assert.match(responseSnapshotBlock, /eliminatedChoiceIds/, "eliminated choices are included in progress snapshots for resume persistence");
const submitScoringBlock = source("lib/data.ts").slice(
  source("lib/data.ts").indexOf("export async function submitSubmission"),
  source("lib/data.ts").indexOf("export async function submitCurrentSection")
);
assert.doesNotMatch(submitScoringBlock, /eliminated_choice_ids|eliminatedChoiceIds/, "eliminated choices are ignored by scoring");

const actionsSource = source("app/actions.ts");
assert.doesNotMatch(actionsSource, /revalidatePath\(`\/exam\/\$\{submission\.exam_id\}\/take`\)/, "background answer saves do not revalidate the current exam route");
assert.doesNotMatch(actionsSource, /revalidatePath\(`\/exam\/\$\{input\.examId\}\/take`\)/, "Save & Exit does not revalidate the current exam route before leaving");
assert.match(actionsSource, /adminStartPdfImportAction/, "admin can start a PDF import analysis job");
assert.match(actionsSource, /adminSavePdfDraftQuestionAction/, "PDF import drafts use an explicit save action");
assert.match(actionsSource, /adminSavePdfDraftAssetFeedbackAction/, "PDF import visual evidence feedback has an explicit save action");
assert.match(actionsSource, /status: "draft"/, "PDF import drafts save as draft questions");
assert.match(actionsSource, /needs-admin-review/, "PDF import saved questions stay in the admin review queue");
assert.match(actionsSource, /createPdfImportJob/, "PDF import start action queues a processing job");
assert.doesNotMatch(actionsSource, /const analysis = await analyzePdfUpload\(pdf\)/, "PDF import start action does not synchronously OCR the PDF");
assert.match(actionsSource, /isPdfImportSchemaSetupError/, "PDF import start action catches missing-schema races");
assert.match(actionsSource, /import_error=start_failed/, "PDF import start action redirects unexpected queue failures to an admin warning");
assert.match(actionsSource, /selection_type/, "PDF import draft save preserves selection type metadata");
assert.match(actionsSource, /required_selections/, "PDF import draft save preserves required selection metadata");
assert.match(actionsSource, /max_selections/, "PDF import draft save preserves max selection metadata");

const pdfImportSource = source("lib/pdf.ts");
assert.match(pdfImportSource, /analyzePdfUpload/, "PDF import has an analyzer entry point");
assert.match(pdfImportSource, /unavailable-local-ocr/, "PDF import exposes a local OCR abstraction when OCR is unavailable");
assert.match(pdfImportSource, /tesseract-local/, "PDF import can use a local Tesseract OCR provider");
assert.match(pdfImportSource, /pdf-ocr-worker\.py/, "PDF import delegates rendering/OCR to the Python worker");
assert.match(pdfImportSource, /pdf-text-worker\.py/, "PDF import can use geometry-aware PyMuPDF text extraction");
assert.match(pdfImportSource, /pymupdf-text/, "PDF import records when structured text extraction is available");
assert.match(pdfImportSource, /raw_blocks: rawBlocks/, "PDF import stores structured page blocks for admin audit");
assert.match(pdfImportSource, /No explicit answer key was detected/, "PDF import warns instead of inventing answer keys");
assert.match(pdfImportSource, /embedded text appears font-encoded or garbled/, "PDF import rejects garbled embedded text before drafting");
assert.match(pdfImportSource, /function acceptedPageText/, "PDF import centralizes accepted page text selection");
assert.ok(pdfImportSource.includes("(?:^|\\n)\\s*(Answer\\s+Key|Answer|Correct\\s+Answer|Key|"), "PDF import only treats unpunctuated answer labels as labels at line starts");
assert.ok(pdfImportSource.includes("[ \\t]*\\n(?=[a-z])"), "PDF import recognizes lowercase formula text on the line after a numbered prompt without treating decimal measurements as question starts");
assert.match(pdfImportSource, /function normalizeConfidence/, "PDF import normalizes confidence values before storage and display");
assert.match(pdfImportSource, /value > 1 \? value \/ 100 : value/, "PDF import converts Tesseract percent confidence values to 0..1");
assert.match(pdfImportSource, /page\.extraction_method === "text"\) return page\.text_extracted/, "PDF import accepts embedded text only from accepted text pages");
assert.match(pdfImportSource, /page\.extraction_method === "ocr"\) return page\.ocr_text/, "PDF import accepts OCR text only from accepted OCR pages");
assert.match(pdfImportSource, /return "";\s*\}\s*function splitTrailingLabeledSections/, "PDF import does not segment rejected page text");
assert.match(pdfImportSource, /function isPdfBytes/, "PDF import validates PDF magic bytes before OCR work");
assert.match(pdfImportSource, /function stripPdfStreams/, "PDF import page counting ignores PDF stream contents");
assert.match(pdfImportSource, /function isImageOrBinaryStream/, "PDF import skips image/binary streams during embedded-text parsing");
assert.match(pdfImportSource, /function hasPdfTextOperators/, "PDF import only parses streams that look like PDF text content");
assert.match(pdfImportSource, /Invalid PDF_OCR_MAX_PAGES value/, "PDF import warns on invalid OCR page limit values");
assert.match(pdfImportSource, /Invalid PDF_OCR_PSM value/, "PDF import warns on invalid OCR page segmentation mode values");
assert.match(pdfImportSource, /function runLocalOcrTriage/, "PDF import can triage large image-only packets before full OCR");
assert.match(pdfImportSource, /function questionPageTriageScore/, "PDF import scores likely question pages during bounded OCR triage");
assert.match(pdfImportSource, /Document-wide OCR triage sampled/, "PDF import reports document-wide OCR triage decisions");
assert.match(pdfImportSource, /scoring\\s\+guidelines/, "PDF OCR triage penalizes scoring-guideline material");
assert.match(pdfImportSource, /question\\s\+descriptors\\s\+and\\s\+performance\\s\+data/, "PDF OCR triage penalizes performance-data tables");
assert.match(pdfImportSource, /answers\?\\s\+to\\s\+multiple-choice\\s\+questions/, "PDF OCR triage penalizes answer-list pages");
assert.match(pdfImportSource, /tesseract-local-raw/, "PDF import preserves untouched Tesseract output separately for audit");
assert.match(pdfImportSource, /ocr\?\.raw_blocks/, "PDF import preserves scanned-page OCR geometry blocks for visual crop proposals");
assert.match(pdfImportSource, /PDF_OCR_TIMEOUT_MS/, "PDF import has a configurable OCR worker timeout");
assert.match(pdfImportSource, /DEFAULT_OCR_TIMEOUT_PER_PAGE_MS/, "PDF import scales the default full-OCR timeout with the selected page count");
assert.match(pdfImportSource, /Local OCR worker timed out/, "PDF import reports OCR worker timeouts clearly");
assert.match(pdfImportSource, /Configured TESSERACT_CMD was not found/, "PDF import fails closed for invalid explicit Tesseract config");
assert.match(pdfImportSource, /skippedPageNumbers/, "PDF import distinguishes page-limit skipped OCR pages");
assert.match(pdfImportSource, /OCR text ignored/, "PDF import rejects unusable OCR text instead of drafting it");
assert.match(pdfImportSource, /function isAnswerKeyLikeText/, "PDF import excludes answer-key-like pages from segmentation");
assert.match(pdfImportSource, /function extractAnswerKeyEntries/, "PDF import parses explicit answer-key entries from answer-key-like pages");
assert.match(pdfImportSource, /function applyExplicitAnswerKeyEntries/, "PDF import can associate explicit answer-key entries with matching MCQ drafts");
assert.match(pdfImportSource, /Correct answer matched from explicit answer-key page/, "PDF import cites source pages when attaching explicit answer keys");
assert.match(pdfImportSource, /Conflicting explicit answer-key entries/, "PDF import refuses conflicting answer-key entries");
assert.match(pdfImportSource, /function extractExplanationEntries/, "PDF import parses explicit explanation entries from source pages");
assert.match(pdfImportSource, /function applyExplicitExplanationEntries/, "PDF import associates explanations only from explicit source entries");
assert.match(pdfImportSource, /Explanation matched from explicit explanation\/rationale page/, "PDF import cites source pages when attaching explanations");
assert.match(pdfImportSource, /Conflicting explicit explanation entries/, "PDF import refuses conflicting explanation entries");
assert.match(pdfImportSource, /function buildSegmentationSections/, "PDF import builds section-aware segmentation context");
assert.match(pdfImportSource, /firstGapMarker/, "PDF import prevents sparse OCR page clusters from merging across unprocessed page gaps");
assert.match(pdfImportSource, /followingEnd = chunkMarkers\[markerIndex \+ 1\]\?\.index \?\? effectiveChunk\.length/, "PDF import excludes trailing next-page markers that have no question text");
assert.match(pdfImportSource, /isTableOfContentsLikeText/, "PDF import filters table-of-contents pages before question segmentation");
assert.match(pdfImportSource, /isScoringSectionStart/, "PDF import filters answer and scoring sections before question segmentation");
assert.match(pdfImportSource, /filterDuplicateMcqDrafts/, "PDF import filters broader duplicate MCQ candidates caused by instruction-page starts");
assert.match(pdfImportSource, /filterOutOfSequenceFrqDrafts/, "PDF import filters out-of-sequence FRQ-like starts caused by formulas or subparts");
assert.match(pdfImportSource, /hasExplicitFrqPart/, "PDF import accepts explicit single-subpart FRQ pages with a clear prompt verb");
assert.match(pdfImportSource, /extractFrqParts\(block\.text, true\)/, "PDF import structures a single visible subpart only after classifying the block as FRQ");
assert.match(pdfImportSource, /function choiceDiagnostics/, "PDF import warns on suspicious choice parsing");
assert.match(pdfImportSource, /merged or corrupted choices/, "PDF import explicitly flags severe merged-choice drafts");
assert.match(pdfImportSource, /Candidate source page for a visual reference/, "PDF import creates visual source-page asset candidates");
assert.match(pdfImportSource, /function draftNeedsVisualEvidence/, "PDF import detects drafts that need source-page visual evidence");
assert.match(pdfImportSource, /function buildVisualCropCandidates/, "PDF import proposes visual crop candidates from structured page blocks");
assert.match(pdfImportSource, /function visualBlockAssociationScore/, "PDF import ranks visual crop candidates against their draft question anchors");
assert.match(pdfImportSource, /matches below-reference cue/, "PDF import prefers nearby visual regions that match below-reference cues");
assert.match(pdfImportSource, /normalizedHorizontalDistance/, "PDF import associates scanned visual regions using horizontal as well as vertical proximity");
assert.match(pdfImportSource, /likelyVisualChoices/, "PDF import keeps a broader review-only crop set when scanned answer choices are likely visual");
assert.match(pdfImportSource, /\["image", "table", "vector"\]/, "PDF import accepts bounded raster, table, and vector crop evidence blocks");
assert.match(pdfImportSource, /runLocalVisualCropRender/, "PDF import renders cropped visual evidence candidates separately from page previews");
assert.match(pdfImportSource, /pdf-import-crops/, "PDF import stores generated crop candidates outside full-page preview paths");
assert.match(pdfImportSource, /No usable crop candidate was found/, "PDF import warns when visual prompts lack a usable crop candidate");
assert.match(pdfImportSource, /function workerFailureMessage/, "PDF import preserves worker stderr for actionable local OCR failures");
assert.match(pdfImportSource, /stringFromChildOutput/, "PDF import worker diagnostics include captured stderr or stdout");
assert.match(pdfImportSource, /spawnSync\(candidate, \["--version"\]/, "PDF import checks whether local worker commands actually run");
assert.match(pdfImportSource, /"python3", "python"/, "PDF import supports the common macOS python3 executable");
assert.match(pdfImportSource, /PDF_RENDER_MAX_PAGES/, "PDF import limits render-only source-page preview work");
assert.match(pdfImportSource, /--render-only/, "PDF import can render source-page previews without running OCR");
assert.match(pdfImportSource, /function isScoringGuidePdf/, "PDF import detects scoring-guide-like PDFs");
assert.match(pdfImportSource, /function classifyScoringGuideContent/, "PDF import classifies scoring-guide content without relying only on filenames");
assert.match(pdfImportSource, /function scoringGuideSignalScore/, "PDF import scores rubric/sample-response content signals");
assert.match(pdfImportSource, /function isScoringGuideOnlyText/, "PDF import can exclude scoring-only pages before segmentation");
assert.match(pdfImportSource, /Content-based scoring-guide detection suppressed draft generation/, "PDF import fails closed on content-detected scoring-guide packets");
assert.match(pdfImportSource, /Draft generation was suppressed/, "PDF import suppresses scoring-guide drafts instead of importing rubrics as questions");
assert.match(pdfImportSource, /function isFrqPacket/, "PDF import detects FRQ packets before MCQ classification");
assert.match(pdfImportSource, /if \(starts\.length === 0\) \{\s*return \[\];\s*\}/, "PDF import does not create a giant draft when question boundaries are missing");
assert.doesNotMatch(pdfImportSource, /status:\s*"published"/, "PDF import analyzer never marks questions published");

const pdfReviewSource = source("components/admin/PdfDraftQuestionReview.tsx");
assert.match(pdfReviewSource, /sourcePages/, "PDF import review shows source-page audit context");
assert.match(pdfReviewSource, /page\.page_image_url/, "PDF import review can show OCR/rendered source page images");
assert.match(pdfReviewSource, /Candidate visual evidence/, "PDF import review shows candidate visual evidence separately from saved question images");
assert.match(pdfReviewSource, /Not saved automatically/, "PDF import review warns that candidate page images are not automatically saved");
assert.match(pdfReviewSource, /Cropped asset URL/, "PDF import review requires a cropped asset URL before adding visual evidence to saved drafts");
assert.match(pdfReviewSource, /Use cropped asset in saved draft/, "PDF import review has explicit keep controls for cropped visual evidence");
assert.match(pdfReviewSource, /Crop\/source bbox JSON/, "PDF import review captures crop/source bbox metadata for approved visuals");
assert.match(pdfReviewSource, /Reviewer feedback/, "PDF import review captures visual evidence feedback labels");
assert.match(pdfReviewSource, /useful_crop/, "PDF import review can label useful crop evidence");
assert.match(pdfReviewSource, /wrong_region/, "PDF import review can label wrong-region crop evidence");
assert.match(pdfReviewSource, /missing_graph/, "PDF import review can label missing graph evidence");
assert.match(pdfReviewSource, /bad_segmentation/, "PDF import review can label OCR segmentation failures");
assert.match(pdfReviewSource, /adminSavePdfDraftAssetFeedbackAction/, "PDF import review persists visual evidence feedback");
assert.match(pdfReviewSource, /Save feedback/, "PDF import review exposes a separate feedback save action");
assert.doesNotMatch(pdfReviewSource, /page\.confidence > 1/, "PDF import review assumes normalized 0..1 confidence values");
assert.match(pdfReviewSource, /Scoring notes from source/, "PDF import review carries scoring notes into the save form");
assert.match(pdfReviewSource, /selection_type/, "PDF import review submits selection type metadata");
assert.match(pdfReviewSource, /multi-select/, "PDF import review tags select-two/multi-select drafts");
assert.doesNotMatch(pdfReviewSource, /Add an explanation during admin review/, "PDF import review no longer defaults placeholder explanation text");

const dataSource = source("lib/data.ts");
assert.match(dataSource, /PDF upload not found for import analysis/, "Mock PDF import rejects missing uploads like Supabase foreign keys");
assert.match(dataSource, /getAdminAccountHealth/, "Admin data layer exposes Supabase/mock account health");
assert.match(dataSource, /auth\.admin\.listUsers/, "Admin account health checks Supabase Auth users server-side");
assert.match(dataSource, /adminProfilesMissingAuthCount/, "Admin account health reports admin profile/Auth mismatches");
assert.match(dataSource, /PDF import draft question not found/, "PDF draft status updates fail loudly when the draft is missing");
assert.match(dataSource, /draft asset references a missing draft question index/, "PDF import rejects out-of-range draft asset links");
assert.match(dataSource, /updatePdfImportDraftAssetFeedback/, "PDF import data layer can persist visual evidence reviewer feedback");
assert.match(dataSource, /reviewer_feedback/, "PDF import asset feedback stores the reviewer label in candidate metadata");
assert.match(dataSource, /pdf_import_draft_asset/, "PDF import asset feedback is included in admin edit logs");
assert.match(dataSource, /extraction_method === "text"[\s\S]*extraction_method === "ocr"/, "PDF import extracted-page metrics count only usable text/OCR pages");
assert.match(dataSource, /createPdfImportJob/, "PDF import data layer can create processing jobs");
assert.match(dataSource, /completePdfImportJob/, "PDF import data layer can complete queued jobs with analysis results");
assert.match(dataSource, /getPdfImportReviewQueue/, "Admin dashboard can summarize PDF imports awaiting review");
assert.match(dataSource, /pending_draft_count/, "PDF import review queue reports unsaved draft counts");
assert.match(dataSource, /PDF_IMPORT_SCHEMA_CHECKS/, "PDF import schema preflight checks the migration as a group");
assert.match(dataSource, /pdf_import_pages/, "PDF import schema preflight checks page audit storage");
assert.match(dataSource, /pdf_import_draft_questions/, "PDF import schema preflight checks draft storage");
assert.match(dataSource, /pdf_import_draft_assets/, "PDF import schema preflight checks visual asset storage");
assert.match(dataSource, /\.in\("status", \["failed", "cancelled"\]\)/, "PDF import retry revives failed and cancelled batches");

const pdfAdminPageSource = source("app/admin/pdfs/page.tsx");
assert.match(pdfAdminPageSource, /PdfImportWorkspace/, "PDF admin page renders the same-page import workspace");
assert.match(pdfAdminPageSource, /job_id/, "PDF admin page can select an import job inline");
assert.match(pdfAdminPageSource, /Unable to start PDF analysis/, "PDF admin page shows queue failures without a runtime overlay");
assert.match(pdfAdminPageSource, /isRemotePdfOcrMode/, "PDF admin page uses the centralized OCR mode guard");

const adminHomeSource = source("app/admin/page.tsx");
assert.match(adminHomeSource, /Account health/, "Admin dashboard surfaces account health");
assert.match(adminHomeSource, /Supabase connected/, "Admin dashboard identifies Supabase account mode");
assert.match(adminHomeSource, /Admin profiles/, "Admin dashboard shows admin profile counts");
assert.match(adminHomeSource, /AdminPdfImportReviewQueue/, "Admin dashboard surfaces the PDF import review queue before drafts are saved");

const adminPdfImportReviewQueueSource = source("components/admin/AdminPdfImportReviewQueue.tsx");
assert.match(adminPdfImportReviewQueueSource, /PDF drafts awaiting review/, "Admin PDF queue clearly labels pending OCR drafts");
assert.match(adminPdfImportReviewQueueSource, /They do not appear in Questions or student exams yet/, "Admin PDF queue explains review-only draft visibility");
assert.match(adminPdfImportReviewQueueSource, /Review drafts/, "Admin PDF queue links directly to draft review");

const adminSidebarSource = source("components/layout/AdminSidebar.tsx");
assert.match(adminSidebarSource, /PDF Imports/, "Admin sidebar labels the PDF import workspace clearly");

const pdfWorkspaceSource = source("components/admin/PdfImportWorkspace.tsx");
assert.match(pdfWorkspaceSource, /api\/admin\/pdf-imports\/\$\{jobId\}\/process/, "PDF import workspace polls the processing route");
assert.match(pdfWorkspaceSource, /Generated draft questions/, "PDF import workspace renders generated draft questions inline");
assert.match(pdfWorkspaceSource, /PdfDraftQuestionReview/, "PDF import workspace reuses the admin draft review cards");
assert.match(pdfWorkspaceSource, /candidateAssets/, "PDF import workspace passes draft visual candidates into review cards");
assert.match(pdfWorkspaceSource, /Raw OCR model output/, "PDF import workspace exposes untouched OCR model output separately");
assert.match(pdfWorkspaceSource, /tesseract-local-raw/, "PDF import workspace identifies the raw Tesseract audit block");

const pdfProcessRouteSource = source("app/api/admin/pdf-imports/[jobId]/process/route.ts");
assert.match(pdfProcessRouteSource, /requireAdmin/, "PDF import process route is admin protected");
assert.match(pdfProcessRouteSource, /analyzePdfUpload/, "PDF import process route performs OCR analysis outside the form submit");
assert.match(pdfProcessRouteSource, /completePdfImportJob/, "PDF import process route persists completed analysis");
assert.match(pdfProcessRouteSource, /getPdfImportSchemaStatus/, "PDF import process route rechecks schema before analysis");
assert.match(pdfProcessRouteSource, /failed state could not be saved/, "PDF import process route handles failed-state persistence errors");
assert.match(pdfProcessRouteSource, /maxDuration = 10/, "PDF import process route stays short-lived in production");
assert.match(pdfProcessRouteSource, /isRemotePdfOcrMode/, "PDF import process route only polls status in remote-worker mode");
assert.doesNotMatch(pdfProcessRouteSource, /pdf-visual-ai|enhancePdfVisualEvidence|MISTRAL_API_KEY|PDF_VISUAL_AI/, "Vercel PDF import route does not import or run visual AI providers");

const pdfOcrModeSource = source("lib/pdf-ocr-mode.ts");
assert.match(pdfOcrModeSource, /process\.env\.VERCEL \? "remote-worker" : "local"/, "Vercel defaults PDF OCR to the remote worker if the dashboard env is omitted");

const pdfDownloadRouteSource = source("app/api/admin/pdf-uploads/[pdfId]/download/route.ts");
assert.match(pdfDownloadRouteSource, /maxDuration = 10/, "Private PDF download route only signs a short-lived R2 redirect");

const pdfOcrWorker = source("scripts/pdf-ocr-worker.py");
assert.match(pdfOcrWorker, /pytesseract/, "PDF OCR worker uses Tesseract");
assert.match(pdfOcrWorker, /get_pixmap/, "PDF OCR worker renders PDF pages before OCR");
assert.match(pdfOcrWorker, /render-only/, "PDF OCR worker supports render-only source-page previews");
assert.match(pdfOcrWorker, /rendered_lines/, "PDF OCR worker preserves line breaks for segmentation");
assert.match(pdfOcrWorker, /page_result\["raw_text"\]/, "PDF OCR worker returns untouched Tesseract text before deterministic normalization");
assert.match(pdfOcrWorker, /scanned_visual_blocks/, "PDF OCR worker detects bounded non-text visual regions on scanned pages");
assert.match(pdfOcrWorker, /tesseract-nontext-region/, "PDF OCR worker labels scanned visual-region evidence separately from OCR text");
assert.match(pdfOcrWorker, /rounded_pdf_bbox/, "PDF OCR worker converts OCR geometry back into PDF coordinates");
assert.match(pdfOcrWorker, /"source": "tesseract-line"/, "PDF OCR worker preserves geometry-aware OCR text lines for visual association");
assert.match(pdfOcrWorker, /removed_visual_noise_lines/, "PDF OCR worker excludes low-confidence text inside visual regions only from normalized segmentation text");
assert.match(pdfOcrWorker, /looks_like_visual_fragment/, "PDF OCR worker excludes tiny diagram-internal OCR fragments from normalized segmentation text");
assert.match(pdfOcrWorker, /choices=\[3, 4, 6, 11\], default=3/, "PDF OCR worker defaults to automatic layout segmentation with bounded overrides");
assert.match(pdfOcrWorker, /normalize_choice_lines/, "PDF OCR worker conservatively normalizes complete sequential OCR choice-label runs");
assert.match(pdfOcrWorker, /normalize_question_lines/, "PDF OCR worker conservatively restores dropped punctuation on question-like OCR starts");
assert.match(pdfOcrWorker, /crops-json/, "PDF OCR worker can render bounded visual evidence crops");
assert.match(pdfOcrWorker, /too close to a full page/, "PDF OCR worker refuses crop requests that look like full-page screenshots");

const remotePdfWorker = source("scripts/pdf-import-worker.ts");
assert.match(remotePdfWorker, /claim_next_pdf_import_job/, "Remote PDF worker atomically claims queued jobs");
assert.match(remotePdfWorker, /PDF_WORKER_BATCH_SIZE/, "Remote PDF worker processes bounded resumable page batches");
assert.match(remotePdfWorker, /cancel_requested_at/, "Remote PDF worker checks cancellation between batches");
assert.match(remotePdfWorker, /markJobCancelled/, "Remote PDF worker marks unfinished batches cancelled when cancellation is observed");
assert.match(remotePdfWorker, /uploadAnalysisEvidence/, "Remote PDF worker uploads generated evidence to durable storage");
assert.match(remotePdfWorker, /status: "finalizing"/, "Remote PDF worker finalizes stable drafts only after page batches finish");
assert.match(remotePdfWorker, /PDF_WORKER_SMOKE/, "Remote PDF worker has a no-claim startup smoke mode");
assert.match(remotePdfWorker, /enhancePdfVisualEvidence/, "Remote PDF worker owns the visual AI enhancement stage");
assert.match(remotePdfWorker, /visual-enhancement/, "Remote PDF worker exposes visual enhancement as a distinct phase");
assert.match(remotePdfWorker, /getPdfVisualAiPreflight/, "Remote PDF worker validates visual AI production configuration at startup");

const envExample = source(".env.example");
assert.match(envExample, /PDF_WORKER_SMOKE=/, "Example env documents the no-claim worker smoke flag");
assert.match(envExample, /PDF_VISUAL_AI_MODE=off/, "Example env documents visual AI as disabled by default");
assert.match(envExample, /PDF_VISUAL_AI_TIMEOUT_MS=60000/, "Example env documents visual AI provider timeouts");
assert.match(envExample, /PDF_VISUAL_AI_FAIL_CLOSED=0/, "Example env documents fail-open visual AI default");
assert.match(envExample, /PDF_VISUAL_AI_MISTRAL_MODEL=mistral-ocr-latest/, "Example env documents the Mistral OCR visual evidence adapter");
assert.match(envExample, /PDF_VISUAL_AI_MISTRAL_INCLUDE_IMAGE_BASE64=0/, "Example env documents optional provider image extraction");

const pdfVisualAiSource = source("lib/pdf-visual-ai.ts");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_MODE/, "Visual AI adapter is env-gated");
assert.match(pdfVisualAiSource, /"off" \| "audit" \| "assist"/, "Visual AI adapter exposes off, audit, and assist modes");
assert.match(pdfVisualAiSource, /getPdfVisualAiPreflight/, "Visual AI adapter exposes a production preflight");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_TIMEOUT_MS/, "Visual AI adapter bounds provider request time");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_RETRIES/, "Visual AI adapter retries transient provider failures");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_MAX_IMAGE_BYTES/, "Visual AI adapter limits rendered page and provider image size");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_FAIL_CLOSED/, "Visual AI adapter can fail closed when explicitly requested");
assert.match(pdfVisualAiSource, /PDF_VISUAL_AI_MISTRAL_API_KEY|MISTRAL_API_KEY/, "Visual AI adapter reads worker-side Mistral credentials");
assert.match(pdfVisualAiSource, /table_format/, "Visual AI adapter requests structured table output from Mistral OCR");
assert.match(pdfVisualAiSource, /include_image_base64/, "Visual AI adapter can request provider-extracted images");
assert.match(pdfVisualAiSource, /pdf-import-ai-evidence/, "Visual AI adapter stores provider image evidence for the R2 evidence uploader");
assert.match(pdfVisualAiSource, /fixture-visual-ai/, "Visual AI adapter has a deterministic fixture provider");
assert.match(pdfVisualAiSource, /ai_visual_evidence/, "Visual AI adapter labels provider evidence blocks");
assert.match(pdfVisualAiSource, /raw_provider_output/, "Visual AI adapter preserves raw provider output for audit");
assert.match(pdfVisualAiSource, /draft_question_index/, "Visual AI adapter stores provider evidence against draft candidates");
assert.match(pdfVisualAiSource, /keep_for_question: false/, "Visual AI draft assets are never auto-kept");
assert.doesNotMatch(pdfVisualAiSource, /question_images/, "Visual AI adapter cannot directly publish saved question images");

const pdfDraftReviewSource = source("components/admin/PdfDraftQuestionReview.tsx");
assert.match(pdfDraftReviewSource, /AI visual evidence/, "PDF draft review card exposes AI visual evidence separately");
assert.match(pdfDraftReviewSource, /Review-only provider output/, "PDF draft review card labels provider evidence as review-only");
assert.match(pdfDraftReviewSource, /ai_visual_evidence/, "PDF draft review card detects AI visual evidence audit blocks");

const visualAiEvalSource = source("scripts/evaluate-visual-ai-ocr.ts");
assert.match(visualAiEvalSource, /150, 170, 205, 255, 570, 610/, "Visual AI evaluation harness targets the known hard Physics pages");
assert.match(visualAiEvalSource, /PDF_VISUAL_AI_PROVIDER = "fixture"/, "Visual AI evaluation harness falls back to fixture mode without credentials");
assert.match(visualAiEvalSource, /pdf-visual-ai-golden\.json/, "Visual AI evaluation harness loads golden page expectations");
assert.match(visualAiEvalSource, /visual_evidence_recall/, "Visual AI evaluation harness reports visual evidence recall");
assert.match(visualAiEvalSource, /bad_crop_rate/, "Visual AI evaluation harness reserves reviewer-labeled bad-crop metrics");
assert.match(visualAiEvalSource, /draft_over_generation/, "Visual AI evaluation harness reports draft over-generation");
assert.match(visualAiEvalSource, /scoring_guide_rejection/, "Visual AI evaluation harness reports scoring-guide rejection applicability");

const visualAiGolden = source("tests/fixtures/pdf-visual-ai-golden.json");
assert.match(visualAiGolden, /physics-hard-pages-v1/, "Visual AI golden fixture names the hard-page evaluation set");
assert.match(visualAiGolden, /\"pages\": \[\s*150,\s*170,\s*205,\s*255,\s*570,\s*610\s*\]/, "Visual AI golden fixture covers the known hard Physics pages");
assert.match(visualAiGolden, /\"targetQuestionNumbers\": \[3\]/, "Visual AI golden fixture tracks page 610 as a future FRQ recovery target");

const r2Source = source("lib/r2.ts");
assert.match(r2Source, /AWS4-HMAC-SHA256/, "R2 integration signs S3-compatible requests without exposing credentials");
assert.match(r2Source, /R2_MAX_PDF_BYTES/, "R2 upload path enforces the production PDF size ceiling");
assert.match(r2Source, /deleteR2Prefix/, "R2 integration can clean up generated evidence on admin deletion");

const multipartUploader = source("components/admin/PdfUploader.tsx");
assert.match(multipartUploader, /Math\.min\(3, partCount\)/, "Browser PDF uploader limits multipart concurrency to three");
assert.match(multipartUploader, /attempt <= 3/, "Browser PDF uploader retries each failed part up to three times");
assert.match(multipartUploader, /multipart\/complete/, "Browser PDF uploader completes R2 multipart uploads explicitly");

const multipartCompleteRoute = source("app/api/admin/pdf-uploads/multipart/complete/route.ts");
assert.match(multipartCompleteRoute, /upload_status !== "uploading"/, "R2 multipart completion only completes active uploads");
assert.match(multipartCompleteRoute, /seen\.has\(part\.partNumber\)/, "R2 multipart completion rejects duplicate part numbers");

const remoteWorkerMigration = source("supabase/migrations/009_remote_pdf_worker.sql");
assert.match(remoteWorkerMigration, /create table if not exists public\.pdf_import_batches/, "Remote worker migration persists resumable page batches");
assert.match(remoteWorkerMigration, /claim_next_pdf_import_job/, "Remote worker migration provides an atomic leased job claim");
assert.match(remoteWorkerMigration, /cancel_requested_at/, "Remote worker migration records admin cancellation requests");

const pdfImportSchemaChecks = source("scripts/pdf-import-schema-checks.cjs");
assert.match(pdfImportSchemaChecks, /missingColumns/, "PDF import schema checker reports missing columns");
assert.match(pdfImportSchemaChecks, /PDF_UPLOADS_REMOTE_STORAGE_REPAIR_SQL/, "PDF import schema checker prints targeted repair SQL for partial migration 009");

const remoteWorkerCheck = source("scripts/check-remote-pdf-worker.cjs");
assert.match(remoteWorkerCheck, /checkPdfImportSchema/, "Remote worker checker validates Supabase schema");
assert.match(remoteWorkerCheck, /repairSqlForResults/, "Remote worker checker prints targeted schema repair SQL");
assert.match(remoteWorkerCheck, /visualAiPreflight/, "Remote worker checker validates visual AI production configuration");

const pdfImportRepairSql = source("scripts/print-pdf-import-repair-sql.cjs");
assert.match(pdfImportRepairSql, /repairSqlForResults/, "PDF import repair SQL helper prints targeted dashboard SQL");
assert.match(pdfImportRepairSql, /process\.stdout\.write/, "PDF import repair SQL helper writes copy-paste SQL to stdout");

const visualFeedbackReport = source("scripts/report-pdf-visual-feedback.cjs");
assert.match(visualFeedbackReport, /pdf_import_draft_assets/, "Visual feedback report reads persisted PDF draft assets");
assert.match(visualFeedbackReport, /reviewer_feedback/, "Visual feedback report summarizes reviewer labels");
assert.match(visualFeedbackReport, /recent_labels/, "Visual feedback report includes recent labeled visual evidence");

const r2Cors = source("infra/r2-source-cors.json");
assert.match(r2Cors, /https:\/\/projectastra\.uk/, "R2 source CORS includes the apex production domain");

const productionOcrDeployment = source("docs/PRODUCTION_OCR_DEPLOYMENT.md");
assert.match(productionOcrDeployment, /PDF_WORKER_SMOKE=1 npm run worker:pdf-import/, "Production OCR docs include the no-claim worker smoke command");

const workerDockerfile = source("Dockerfile.worker");
assert.match(workerDockerfile, /RUN npm ci\r?\n/, "Railway worker installs the tsx runtime used by its start command");
assert.doesNotMatch(workerDockerfile, /npm ci --omit=dev/, "Railway worker does not omit its tsx runtime dependency");
assert.match(workerDockerfile, /tsx --version/, "Railway worker image verifies the TypeScript runtime during build");
assert.match(workerDockerfile, /python3 -m py_compile/, "Railway worker image compiles its Python OCR scripts during build");

const ciWorkflow = source(".github/workflows/ci.yml");
assert.match(ciWorkflow, /docker build --file Dockerfile\.worker/, "CI builds the production OCR worker image");
assert.match(ciWorkflow, /import fitz, PIL, pytesseract/, "CI smoke tests the worker's Python OCR dependencies");
assert.match(ciWorkflow, /tesseract --version/, "CI smoke tests Tesseract inside the worker image");

const pdfTextWorker = source("scripts/pdf-text-worker.py");
assert.match(pdfTextWorker, /get_text\("blocks"/, "PDF text worker extracts positioned text blocks");
assert.match(pdfTextWorker, /likely_two_columns/, "PDF text worker detects two-column layouts");
assert.match(pdfTextWorker, /reading_order/, "PDF text worker records block reading order");
assert.match(pdfTextWorker, /"kind": "image"/, "PDF text worker preserves PyMuPDF image blocks for crop candidates");
assert.match(pdfTextWorker, /page\.cluster_drawings\(\)/, "PDF text worker clusters PDF-native vector drawings into visual crop candidates");
assert.match(pdfTextWorker, /"kind": "table" if looks_like_table else "vector"/, "PDF text worker preserves bounded vector diagram evidence");
assert.match(pdfTextWorker, /looks_like_table = vertical_lines >= 2 and horizontal_lines >= 2/, "PDF text worker classifies table-like drawing grids without an expensive all-page table scan");
assert.match(pdfTextWorker, /bboxes_touch/, "PDF text worker associates zero-width and zero-height stroked lines with drawing clusters");
assert.match(pdfTextWorker, /dedupe_visual_blocks/, "PDF text worker deduplicates overlapping table and vector crop candidates");
assert.match(pdfTextWorker, /text_blocks = \[block for block in blocks if block\.get\("kind"\) == "text"\]/, "PDF text worker uses text blocks, not image blocks, to detect reading order");
assert.match(pdfTextWorker, /matching_question_stem/, "PDF text worker pairs overlapping accessibility choice blocks with their numbered prompt");
assert.match(pdfTextWorker, /id\(block\) not in choice_parent/, "PDF text worker does not treat paired accessibility choice blocks as page headers");
assert.match(pdfTextWorker, /column = 0 if x0 < page_width \/ 2 else 1/, "PDF text worker assigns two-column reading order from each block's left edge");
assert.match(pdfTextWorker, /UNAUTHORIZED COPYING/, "PDF text worker filters repeated AP footer noise");

const pdfSchemaCheckSource = source("scripts/pdf-import-schema-checks.cjs");
assert.match(pdfSchemaCheckSource, /pdf_import_jobs/, "PDF import schema checker verifies job storage");
assert.match(pdfSchemaCheckSource, /pdf_import_pages/, "PDF import schema checker verifies page audit storage");
assert.match(pdfSchemaCheckSource, /pdf_import_draft_questions/, "PDF import schema checker verifies draft storage");
assert.match(pdfSchemaCheckSource, /pdf_import_draft_assets/, "PDF import schema checker verifies asset storage");
const pdfSchemaCheckCli = source("scripts/check-supabase-pdf-import-schema.cjs");
assert.match(pdfSchemaCheckCli, /Supabase project:/, "PDF import schema checker identifies the configured project without printing credentials");

const authSource = source("lib/auth.ts");
assert.match(authSource, /auth\.signInWithPassword/, "login uses Supabase Auth password verification");
assert.match(authSource, /auth\.signUp/, "public registration uses Supabase signUp so email confirmation is respected");
assert.doesNotMatch(authSource, /email_confirm:\s*true/, "public registration does not auto-confirm users");
assert.match(authSource, /role: "student"/, "public registration always creates student profiles");
assert.match(authSource, /signProfileId/, "session cookies are signed before being set");
assert.match(authSource, /httpOnly: true/, "session cookies are HttpOnly");
assert.match(authSource, /sameSite: "lax"/, "session cookies use SameSite=Lax");
assert.match(authSource, /secure: isProduction/, "session cookies are Secure in production");
assert.match(authSource, /path: "\/"/, "session cookies are scoped to the app root");

const seedSource = source("scripts/seed-supabase-from-mock.cjs");
assert.match(seedSource, /process\.env\.ADMIN_PASSWORD/, "admin seed password comes from environment variables");
assert.match(seedSource, /updateUserById\(existing\.id/, "seed updates existing Supabase Auth user passwords");

const actionsSourceForAuth = source("app/actions.ts");
assert.match(actionsSourceForAuth, /Check your email to confirm your account before signing in\./, "register tells users to verify email before sign-in");
assert.doesNotMatch(actionsSourceForAuth, /redirect\("\/dashboard"\);\n\}/, "register does not auto-login new public users");
assert.doesNotMatch(actionsSourceForAuth, /resendSignupConfirmationAction/, "pre-login confirmation resend action is not exposed");
assert.match(actionsSourceForAuth, /updateEmailAction/, "settings email change action exists");
assert.match(actionsSourceForAuth, /deleteAccountAction/, "settings delete account action exists");
assert.match(actionsSourceForAuth, /confirmation !== "DELETE"/, "account deletion requires exact DELETE confirmation");

const authFormSource = source("components/forms/AuthForm.tsx");
const exposedCredentialPattern = new RegExp(
  [
    "admin" + "@" + "example" + "\\.com",
    "admin" + "123456",
    "student" + "@" + "example" + "\\.com",
    "student" + "123456",
    "Mock fallback " + "accounts"
  ].join("|")
);
assert.doesNotMatch(authFormSource, exposedCredentialPattern, "login form does not expose demo credentials");
assert.doesNotMatch(authFormSource, /Need a new confirmation email\?|Resend confirmation email|resend_email/, "login and register pages do not expose pre-login resend UI");

const settingsPageSource = source("app/settings/page.tsx");
const accountSettingsFormSource = source("components/forms/AccountSettingsForm.tsx");
assert.doesNotMatch(settingsPageSource, /Phone verification|SMS verification|SMS provider|Send verification code/i, "settings page does not expose phone verification UI");
assert.doesNotMatch(settingsPageSource, /phone_number|phoneNumber|label="Phone"|<Phone/i, "settings page does not show or edit phone numbers");
assert.doesNotMatch(accountSettingsFormSource, /phone_number|phoneNumber/i, "account settings form only edits display name");
assert.match(settingsPageSource, /EmailVerificationForm/, "settings page keeps email verification support");

const deleteAccountFormSource = source("components/forms/DeleteAccountForm.tsx");
assert.match(deleteAccountFormSource, /Danger Zone/, "settings includes a danger zone for account deletion");
assert.match(deleteAccountFormSource, /confirmation === "DELETE"/, "delete account submit stays disabled until DELETE is typed");
assert.match(deleteAccountFormSource, /Admin accounts cannot be deleted from this page\./, "admin self-deletion is blocked in the UI");

assert.match(authSource, /deleteCurrentStudentAccount/, "server-side account deletion helper exists");
assert.match(authSource, /profile\.role === "admin"/, "server blocks admin self-deletion");
assert.match(authSource, /signInWithPassword/, "server re-authenticates with current password before deletion");
assert.match(authSource, /auth\.admin\.deleteUser/, "server-only Supabase admin client deletes the auth user");

const dashboardPage = source("app/dashboard/page.tsx");
assert.doesNotMatch(dashboardPage, /\{submission\.status\}/, "dashboard history does not render raw status variables");
assert.match(dashboardPage, /submissionStatusLabel/, "dashboard maps attempt statuses to user-facing labels");
assert.match(dashboardPage, /formatFriendlyDuration/, "dashboard uses friendly attempt duration text");

const availableExamsBrowser = source("components/exam/AvailableExamsBrowser.tsx");
assert.match(availableExamsBrowser, /groups\[exam\.subject\]/, "available exams group by subject");
assert.match(availableExamsBrowser, /groups\[exam\.subject\]\[exam\.course\]/, "available exams group by course under subject");
assert.doesNotMatch(availableExamsBrowser, /AP Physics 1 2023/, "available exams are not hardcoded to AP Physics 1 2023");

const rootLayout = source("app/layout.tsx");
assert.match(rootLayout, /import "\.\/globals\.css";/, "root layout imports global CSS");

const globalCss = source("app/globals.css");
assert.match(globalCss, /@tailwind base;/, "global CSS includes Tailwind base");
assert.match(globalCss, /@tailwind components;/, "global CSS includes Tailwind components");
assert.match(globalCss, /@tailwind utilities;/, "global CSS includes Tailwind utilities");

const tailwindConfig = source("tailwind.config.ts");
assert.match(tailwindConfig, /\.\/app\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/, "Tailwind scans app directory");
assert.match(tailwindConfig, /\.\/components\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/, "Tailwind scans components directory");
assert.match(tailwindConfig, /\.\/src\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/, "Tailwind scans optional src directory");

const checkedFiles = [
  "README.md",
  ".env.example",
  "docs/DEPLOY_VERCEL_FREE.md",
  "docs/DEVELOPMENT_LOG.md",
  "components/forms/AuthForm.tsx",
  "lib/auth.ts",
  "lib/mock-data.ts",
  "scripts/seed-supabase-from-mock.cjs",
  "scripts/seed.ts"
];
for (const file of checkedFiles) {
  assert.doesNotMatch(
    source(file),
    exposedCredentialPattern,
    `${file} does not expose hardcoded credentials`
  );
}

runPdfFixtureAssertions()
  .then(() => {
    console.log("Import, rendering, PDF fixture, and auth guard tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
