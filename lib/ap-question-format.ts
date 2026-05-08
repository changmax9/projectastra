import { z } from "zod";
import { questionImportArraySchema } from "@/lib/schemas";
import { inferSubjectFromCourse, normalizeExamType, normalizeSection } from "@/lib/ap-taxonomy";
import type { Difficulty, ExamImportMetadata, QuestionImportBatch, QuestionImportItem } from "@/lib/types";
import { getForbiddenImageReference, isPdfPageImageUrl, normalizeQuestionImportItems } from "@/lib/question-import";

const sectionSchema = z.enum(["MCQ", "FRQ", "Full Exam"]);
const statusSchema = z.enum(["draft", "reviewed", "published"]).default("draft");
const examStatusSchema = z.enum(["draft", "reviewed", "published", "archived"]).default("draft");

const apDifficultySchema = z
  .enum(["Easy", "Medium", "Hard", "easy", "medium", "hard"])
  .transform((value) => value.toLowerCase() as Difficulty);

const apQuestionImageSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  caption: z.string().nullable().optional()
});

const apQuestionChoiceSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  image: z.string().nullable().optional()
});

const apFrqPartSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1)
});

export const apQuestionDraftSchema = z
  .object({
    id: z.string().min(1),
    examName: z.string().min(1),
    subject: z.string().optional(),
    course: z.string().optional(),
    year: z.coerce.number().int().min(1900),
    section: sectionSchema,
    examType: z.string().optional(),
    questionNumber: z.coerce.number().int().positive(),
    questionText: z.string().min(1),
    choices: z.array(apQuestionChoiceSchema).default([]),
    answer: z.string().nullable().default(null),
    explanation: z.string().default(""),
    topic: z.string().min(1),
    difficulty: apDifficultySchema,
    images: z.array(apQuestionImageSchema).default([]),
    parts: z.array(apFrqPartSchema).default([]),
    tags: z.array(z.string()).default([]),
    sourcePdfPage: z.coerce.number().int().positive().nullable().default(null),
    status: statusSchema
  })
  .superRefine((item, ctx) => {
    const choiceLabels = item.choices.map((choice) => choice.label.trim()).filter(Boolean);
    const duplicateChoice = choiceLabels.find((label, index) => choiceLabels.indexOf(label) !== index);
    if (duplicateChoice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: `choice label "${duplicateChoice}" is duplicated`
      });
    }

    if (item.section === "MCQ") {
      if (item.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "MCQ questions require choices."
        });
      }
      if (!item.answer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: "MCQ questions require an answer."
        });
      }
      const answerLabels = (item.answer || "").split(",").map((label) => label.trim()).filter(Boolean);
      if (answerLabels.length > 0 && !answerLabels.every((label) => choiceLabels.includes(label))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: `answer "${item.answer}" does not match choices ${choiceLabels.join("/") || "none"}`
        });
      }
    }

    if (item.section === "FRQ" && item.choices.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "FRQ questions should use parts, not choices."
      });
    }

    item.images.forEach((image, index) => {
      if (isPdfPageImageUrl(image.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "path"],
          message: `image path contains forbidden full-page screenshot reference: ${getForbiddenImageReference(image.path) || image.path}`
        });
      }
    });

    item.choices.forEach((choice, index) => {
      if (choice.image && isPdfPageImageUrl(choice.image)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices", index, "image"],
          message: `image path contains forbidden full-page screenshot reference: ${getForbiddenImageReference(choice.image) || choice.image}`
        });
      }
    });
  });

const apQuestionDraftArraySchema = z.array(apQuestionDraftSchema).min(1);
const apExamDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().default(""),
  subject: z.string().min(1).optional(),
  course: z.string().min(1).optional(),
  examName: z.string().min(1).optional(),
  year: z.coerce.number().int().min(1900).nullable().optional(),
  section: z.string().min(1).optional(),
  examType: z.string().min(1).optional(),
  estimatedTimeMinutes: z.coerce.number().int().positive().optional(),
  timeLimitMinutes: z.coerce.number().int().positive().optional(),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        section: z.string().min(1),
        title: z.string().min(1),
        questionCount: z.coerce.number().int().nonnegative(),
        timeLimitMinutes: z.coerce.number().int().positive(),
        calculatorAllowed: z.boolean(),
        order: z.coerce.number().int().positive()
      })
    )
    .default([]),
  status: examStatusSchema
});

export type ApQuestionDraft = z.infer<typeof apQuestionDraftSchema>;

export type AdminQuestionImportParseResult =
  | { ok: true; data: QuestionImportBatch; sourceFormat: "ap-draft" | "internal"; warnings: string[] }
  | { ok: false; errors: Array<{ index: number; path: string; message: string }> };

function formatIssues(error: z.ZodError, rawItems?: unknown) {
  return error.issues.map((issue) => {
    const [index, ...path] = issue.path;
    const questionNumber =
      typeof index === "number" &&
      Array.isArray(rawItems) &&
      rawItems[index] &&
      typeof rawItems[index] === "object" &&
      "questionNumber" in rawItems[index]
        ? Number((rawItems[index] as { questionNumber?: unknown }).questionNumber)
        : null;
    return {
      index: questionNumber && Number.isFinite(questionNumber) ? questionNumber - 1 : typeof index === "number" ? index : -1,
      path: path.join(".") || String(index ?? "root"),
      message: issue.message
    };
  });
}

function withFrqParts(questionText: string, parts: ApQuestionDraft["parts"]) {
  if (parts.length === 0) return questionText;
  const partText = parts.map((part) => `(${part.label}) ${part.prompt}`).join("\n\n");
  return `${questionText}\n\n${partText}`;
}

export function apQuestionDraftToImportItem(item: ApQuestionDraft): QuestionImportItem {
  const isMcq = item.section === "MCQ";
  const course = item.course || item.examName;
  const subject = item.subject || inferSubjectFromCourse(course);
  const section = normalizeSection(item.section);
  const examType = normalizeExamType(item.examType);

  return {
    id: item.id,
    exam_name: item.examName,
    subject,
    course,
    year: item.year,
    section,
    exam_type: examType,
    question_number: item.questionNumber,
    unit: `${item.year} ${section}`,
    topic: item.topic,
    difficulty: item.difficulty,
    type: isMcq ? "mcq" : "frq",
    question_text: withFrqParts(item.questionText, item.parts),
    question_images: item.images.map((image) => ({
      id: image.id,
      url: image.path,
      caption: image.caption ?? null
    })),
    choices: isMcq
      ? item.choices.map((choice) => ({
          id: choice.label,
          text: choice.text,
          image_url: choice.image ?? null
        }))
      : [],
    correct_answer: isMcq ? item.answer : null,
    explanation: item.explanation || "Add an explanation during admin review.",
    source_pdf: item.sourcePdfPage ? `${item.examName} ${item.year} page ${item.sourcePdfPage}` : null,
    tags: [
      ...item.tags,
      item.id,
      `${item.year}`,
      section.toLowerCase(),
      `q${item.questionNumber}`
    ],
    status: item.status,
    points: isMcq ? 1 : 4,
    time_estimate_seconds: isMcq ? 90 : 720
  };
}

function defaultExamFromQuestions(questions: QuestionImportItem[]): ExamImportMetadata {
  const first = questions[0];
  return {
    id: `${first.course.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${first.year || "custom"}-${first.section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `${first.course}${first.year ? ` ${first.year}` : ""} ${first.section} ${first.exam_type}`,
    description: "",
    subject: first.subject,
    course: first.course,
    year: first.year,
    section: first.section,
    exam_type: first.exam_type,
    time_limit_minutes: Math.max(1, Math.round(questions.reduce((sum, question) => sum + (question.time_estimate_seconds || 90), 0) / 60)),
    status: "draft"
  };
}

function examMetadataFromInput(input: unknown, questions: QuestionImportItem[]): ExamImportMetadata {
  const rawExam = input && typeof input === "object" && "exam" in input ? (input as { exam?: unknown }).exam : null;
  const parsed = apExamDraftSchema.safeParse(rawExam || {});
  const fallback = defaultExamFromQuestions(questions);
  if (!parsed.success) return fallback;
  const exam = parsed.data;
  const course = exam.course || exam.examName || fallback.course;
  const subject = exam.subject || inferSubjectFromCourse(course);
  const year = exam.year ?? fallback.year;
  const section = normalizeSection(exam.section, fallback.section);
  const examType = normalizeExamType(exam.examType || fallback.exam_type);
  return {
    id: exam.id || fallback.id,
    title: exam.title || `${course}${year ? ` ${year}` : ""} ${section} ${examType}`,
    description: exam.description || fallback.description,
    subject,
    course,
    year,
    section,
    exam_type: examType,
    time_limit_minutes: exam.estimatedTimeMinutes || exam.timeLimitMinutes || fallback.time_limit_minutes,
    sections: exam.sections,
    status: exam.status
  };
}

function enrichQuestionsWithExamDefaults(input: unknown) {
  const rawQuestions = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { questions?: unknown }).questions)
      ? (input as { questions: unknown[] }).questions
      : input;
  const rawExam = input && typeof input === "object" && "exam" in input ? (input as { exam?: Record<string, unknown> }).exam : null;
  if (!Array.isArray(rawQuestions) || !rawExam) return rawQuestions;

  return rawQuestions.map((question) => {
    if (!question || typeof question !== "object") return question;
    return {
      examName: rawExam.examName || rawExam.course,
      subject: rawExam.subject,
      course: rawExam.course || rawExam.examName,
      year: rawExam.year,
      section: rawExam.section,
      examType: rawExam.examType,
      status: rawExam.status === "archived" ? "draft" : rawExam.status,
      ...question
    };
  });
}

export function parseAdminQuestionImportJson(input: unknown): AdminQuestionImportParseResult {
  const rawItems = enrichQuestionsWithExamDefaults(input);

  const apParsed = apQuestionDraftArraySchema.safeParse(rawItems);
  if (apParsed.success) {
    const questions = normalizeQuestionImportItems(apParsed.data.map(apQuestionDraftToImportItem));
    return {
      ok: true,
      sourceFormat: "ap-draft",
      data: {
        exam: examMetadataFromInput(input, questions),
        questions
      },
      warnings: []
    };
  }

  const internalParsed = questionImportArraySchema.safeParse(
    Array.isArray(rawItems) ? normalizeQuestionImportItems(rawItems as QuestionImportItem[]) : rawItems
  );
  if (internalParsed.success) {
    const questions = internalParsed.data;
    return {
      ok: true,
      sourceFormat: "internal",
      data: {
        exam: examMetadataFromInput(input, questions),
        questions
      },
      warnings: []
    };
  }

  return { ok: false, errors: formatIssues(apParsed.error, rawItems) };
}
