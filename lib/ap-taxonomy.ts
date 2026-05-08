const COURSE_SUBJECT_RULES: Array<{ subject: string; patterns: RegExp[] }> = [
  { subject: "Physics", patterns: [/physics/i] },
  { subject: "Math", patterns: [/calculus/i, /statistics/i] },
  { subject: "Science", patterns: [/chemistry/i, /biology/i, /environmental/i] },
  { subject: "Social Studies", patterns: [/macroeconomics/i, /microeconomics/i, /psychology/i, /history/i, /government/i] },
  { subject: "English", patterns: [/english/i, /literature/i, /language/i] },
  { subject: "Computer Science", patterns: [/computer science/i, /\bcsp\b/i, /\bcsa\b/i] }
];

export function inferSubjectFromCourse(course: string | null | undefined) {
  const value = String(course || "").trim();
  const rule = COURSE_SUBJECT_RULES.find((item) => item.patterns.some((pattern) => pattern.test(value)));
  return rule?.subject || value || "Other";
}

export function normalizeSection(value: string | null | undefined, fallback = "MCQ") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^mcq$/i.test(raw) || /multiple/i.test(raw)) return "MCQ";
  if (/^frq$/i.test(raw) || /free/i.test(raw)) return "FRQ";
  if (/full/i.test(raw)) return "Full Exam";
  return raw;
}

export function normalizeExamType(value: string | null | undefined) {
  const raw = String(value || "").trim();
  return raw || "Practice Exam";
}

export function parseYearFromText(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

export function parseQuestionNumberFromTags(tags: string[] | null | undefined) {
  const found = (tags || []).find((tag) => /^q\d+$/i.test(tag.trim()));
  return found ? Number(found.replace(/\D/g, "")) : null;
}
