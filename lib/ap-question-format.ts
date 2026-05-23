import { z } from "zod";
import { questionImportArraySchema } from "@/lib/schemas";
import { inferSubjectFromCourse, normalizeExamType, normalizeSection } from "@/lib/ap-taxonomy";
import type { Difficulty, ExamImportMetadata, QuestionImportBatch, QuestionImportItem, QuestionType } from "@/lib/types";
import { getForbiddenImageReference, isPdfPageImageUrl, normalizeQuestionImportItems } from "@/lib/question-import";

const sectionSchema = z.string().min(1);
const statusSchema = z.enum(["draft", "reviewed", "published"]).default("draft");
const examStatusSchema = z.enum(["draft", "reviewed", "published", "archived"]).default("draft");
const collegeBoardSourceSchema = z
  .object({
    provider: z.string().optional(),
    publisher: z.string().optional(),
    sourceType: z.string().optional(),
    url: z.string().optional(),
    pdf: z.string().optional(),
    pdfPage: z.coerce.number().int().positive().nullable().optional(),
    page: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().optional()
  })
  .passthrough();

const apDifficultySchema = z
  .enum(["Easy", "Medium", "Hard", "easy", "medium", "hard"])
  .transform((value) => value.toLowerCase() as Difficulty);

const apQuestionImageSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  caption: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
  required: z.boolean().optional()
});

const apQuestionChoiceSchema = z.object({
  label: z.string().min(1),
  text: z.string().default(""),
  image: z.string().nullable().optional(),
  imagePath: z.string().nullable().optional()
});

const apFrqPartSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().optional(),
  text: z.string().optional()
});

type ApQuestionImage = z.infer<typeof apQuestionImageSchema>;
type ApQuestionChoice = z.infer<typeof apQuestionChoiceSchema>;
type ApFrqPart = z.infer<typeof apFrqPartSchema>;

function inferApDraftQuestionKind(section: string, questionType?: "mcq_single" | "mcq_multi" | "frq"): QuestionType {
  if (questionType === "frq") return "frq";
  if (questionType === "mcq_single" || questionType === "mcq_multi") return "mcq";
  return /frq|free response/i.test(section) ? "frq" : "mcq";
}

function normalizeCorrectAnswer(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(",");
  return String(value ?? "").trim() || null;
}

function partPrompt(part: ApFrqPart) {
  return (part.prompt ?? part.text ?? "").trim();
}

function isCollegeBoardSource(source: unknown, tags: string[]) {
  const tagText = tags.join(" ");
  if (/college\s*board|official|released/i.test(tagText)) return true;
  if (typeof source === "string") return /college\s*board|official|released/i.test(source);
  if (source && typeof source === "object") {
    const values = Object.values(source as Record<string, unknown>).map((value) => String(value ?? "")).join(" ");
    return /college\s*board|official|released/i.test(values);
  }
  return false;
}

export const apQuestionDraftSchema = z
  .object({
    id: z.string().min(1),
    examId: z.string().min(1).optional(),
    examName: z.string().min(1).optional(),
    subject: z.string().optional(),
    course: z.string().min(1).optional(),
    year: z.coerce.number().int().min(1900).nullable(),
    section: sectionSchema,
    examType: z.string().optional(),
    questionNumber: z.coerce.number().int().positive(),
    questionType: z.enum(["mcq_single", "mcq_multi", "frq"]).optional(),
    calculatorAllowed: z.boolean().optional(),
    questionText: z.string().default(""),
    choices: z.array(apQuestionChoiceSchema).default([]),
    correctAnswer: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    answer: z.string().nullable().default(null),
    explanation: z.string().default(""),
    topic: z.string().default("Uncategorized"),
    skill: z.string().optional(),
    difficulty: apDifficultySchema.default("medium"),
    images: z.array(apQuestionImageSchema).default([]),
    parts: z.array(apFrqPartSchema).default([]),
    promptParts: z.array(apFrqPartSchema).default([]),
    tags: z.array(z.string()).default([]),
    sourcePdfPage: z.coerce.number().int().positive().nullable().default(null),
    source: z.union([z.string(), collegeBoardSourceSchema]).nullable().optional(),
    status: statusSchema
  })
  .superRefine((item, ctx) => {
    const questionKind = inferApDraftQuestionKind(item.section, item.questionType);
    const choiceLabels = item.choices.map((choice: ApQuestionChoice) => choice.label.trim()).filter(Boolean);
    const duplicateChoice = choiceLabels.find((label: string, index: number) => choiceLabels.indexOf(label) !== index);
    const answer = normalizeCorrectAnswer(item.correctAnswer ?? item.answer);
    const promptParts = [...item.parts, ...item.promptParts];
    const isPublishedCollegeBoard = item.status === "published" && isCollegeBoardSource(item.source, item.tags);
    if (duplicateChoice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: `choice label "${duplicateChoice}" is duplicated`
      });
    }

    if (!item.questionText.trim() && !(questionKind === "frq" && promptParts.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionText"],
        message: "questionText is required"
      });
    }

    if (questionKind === "mcq") {
      if (item.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "MCQ questions require choices."
        });
      }
      if (!answer && item.status === "published") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: "Published MCQ questions require an answer."
        });
      }
      const answerLabels = (answer || "").split(",").map((label: string) => label.trim()).filter(Boolean);
      if (answerLabels.length > 0 && !answerLabels.every((label: string) => choiceLabels.includes(label))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: `answer "${answer}" does not match choices ${choiceLabels.join("/") || "none"}`
        });
      }
    }

    if (questionKind === "frq" && item.choices.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "FRQ questions should use parts, not choices."
      });
    }

    if (questionKind === "frq" && !item.questionText.trim() && promptParts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promptParts"],
        message: "FRQ questions require promptParts or questionText"
      });
    }

    item.images.forEach((image: ApQuestionImage, index: number) => {
      if (isPdfPageImageUrl(image.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "path"],
          message: `image path contains forbidden full-page screenshot reference: ${getForbiddenImageReference(image.path) || image.path}`
        });
      }
    });

    item.choices.forEach((choice: ApQuestionChoice, index: number) => {
      const choiceImage = choice.image ?? choice.imagePath;
      if (choiceImage && isPdfPageImageUrl(choiceImage)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices", index, "image"],
          message: `image path contains forbidden full-page screenshot reference: ${getForbiddenImageReference(choiceImage) || choiceImage}`
        });
      }
    });

    if (isPublishedCollegeBoard) {
      if (item.images.some((image) => image.required && !image.path.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images"],
          message: "published College Board questions require all required image paths to exist"
        });
      }
      if (questionKind === "mcq" && (item.choices.length < 2 || !answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["status"],
          message: "College Board MCQ questions cannot be published without choices and correctAnswer"
        });
      }
      if (questionKind === "frq" && !item.questionText.trim() && promptParts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["status"],
          message: "College Board FRQ questions cannot be published without promptParts or questionText"
        });
      }
    }
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

function withFrqParts(questionText: string, parts: ApFrqPart[]) {
  if (parts.length === 0) return questionText;
  const partText = parts.map((part: ApFrqPart) => `(${part.label}) ${partPrompt(part)}`).join("\n\n");
  return questionText.trim() ? `${questionText}\n\n${partText}` : partText;
}

export function apQuestionDraftToImportItem(item: ApQuestionDraft): QuestionImportItem {
  const questionKind = inferApDraftQuestionKind(item.section, item.questionType);
  const isMcq = questionKind === "mcq";
  const course = item.course || item.examName || "AP Course";
  const subject = item.subject || inferSubjectFromCourse(course);
  const section = normalizeSection(item.section);
  const examType = normalizeExamType(item.examType);
  const answer = normalizeCorrectAnswer(item.correctAnswer ?? item.answer);
  const parts = [...item.parts, ...item.promptParts];
  const sourcePdfPage =
    item.sourcePdfPage ||
    (item.source && typeof item.source === "object"
      ? Number((item.source as { pdfPage?: unknown; page?: unknown }).pdfPage || (item.source as { page?: unknown }).page || 0) || null
      : null);
  const sourceLabel =
    typeof item.source === "string"
      ? item.source
      : item.source && typeof item.source === "object"
        ? [
            (item.source as { provider?: string }).provider || (item.source as { publisher?: string }).publisher,
            (item.source as { pdf?: string }).pdf,
            sourcePdfPage ? `page ${sourcePdfPage}` : null
          ]
            .filter(Boolean)
            .join(" ")
        : null;
  const importTags = [
    ...item.tags,
    item.skill ? `skill:${item.skill}` : null,
    item.calculatorAllowed === true ? "calculator-allowed" : item.calculatorAllowed === false ? "no-calculator" : null,
    item.questionType || null,
    item.examId ? `exam:${item.examId}` : null,
    item.id,
    item.year ? `${item.year}` : null,
    section.toLowerCase(),
    `q${item.questionNumber}`
  ].filter((tag): tag is string => Boolean(tag));

  return {
    id: item.id,
    exam_name: item.examName || course,
    subject,
    course,
    year: item.year,
    section,
    exam_type: examType,
    question_number: item.questionNumber,
    unit: item.skill || `${item.year || "Custom"} ${section}`,
    topic: item.topic,
    difficulty: item.difficulty,
    type: isMcq ? "mcq" : "frq",
    selection_type: item.questionType === "mcq_multi" ? "multiple" : "single",
    required_selections: item.questionType === "mcq_multi" ? Math.max(2, answer?.split(",").filter(Boolean).length || 2) : null,
    max_selections: item.questionType === "mcq_multi" ? Math.max(2, answer?.split(",").filter(Boolean).length || 2) : null,
    question_text: withFrqParts(item.questionText, parts),
    question_images: item.images.map((image: ApQuestionImage) => ({
      id: image.id,
      url: image.path,
      caption: image.caption ?? null,
      alt: image.alt ?? null
    })),
    choices: isMcq
      ? item.choices.map((choice: ApQuestionChoice) => ({
          id: choice.label,
          text: choice.text,
          image_url: choice.image ?? choice.imagePath ?? null
        }))
      : [],
    correct_answer: isMcq ? answer : null,
    explanation: item.explanation || "Add an explanation during admin review.",
    source_pdf: sourceLabel || (sourcePdfPage ? `${item.examName || course} ${item.year || ""} page ${sourcePdfPage}` : null),
    tags: importTags,
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
      section: question && typeof question === "object" && "section" in question ? undefined : rawExam.section,
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
