const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildRoot = path.join(root, ".test-build");

execFileSync(
  path.join(root, "node_modules", "typescript", "bin", "tsc"),
  ["-p", path.join(root, "tests", "tsconfig.import-tests.json")],
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

function source(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
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
assert.match(choiceList, /MathMarkdown content=\{choice\.text\}/, "ChoiceList renders choices through MathMarkdown");
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

const actionsSource = source("app/actions.ts");
assert.doesNotMatch(actionsSource, /revalidatePath\(`\/exam\/\$\{submission\.exam_id\}\/take`\)/, "background answer saves do not revalidate the current exam route");
assert.doesNotMatch(actionsSource, /revalidatePath\(`\/exam\/\$\{input\.examId\}\/take`\)/, "Save & Exit does not revalidate the current exam route before leaving");

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

console.log("Import, rendering, and auth guard tests passed.");
