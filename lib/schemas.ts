import { z } from "zod";
import { isPdfPageImageUrl } from "@/lib/question-import";

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const questionTypeSchema = z.enum(["mcq", "frq"]);
export const questionStatusSchema = z.enum(["draft", "reviewed", "published"]);
export const examStatusSchema = z.enum(["draft", "reviewed", "published", "archived"]);
const nullableYearSchema = z.preprocess(
  (value) => (String(value ?? "").trim() === "" ? null : value),
  z.coerce.number().int().min(1900).nullable()
);
const nullablePositiveIntSchema = z.preprocess(
  (value) => (String(value ?? "").trim() === "" ? null : value),
  z.coerce.number().int().positive().nullable()
);

export const questionImageSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  caption: z.string().nullable().optional(),
  alt: z.string().nullable().optional()
});

export const choiceSchema = z.object({
  id: z.string().min(1, "Choice id is required"),
  text: z.string().min(1, "Choice text is required"),
  image_url: z.string().nullable().optional()
});

function validateQuestionShape(
  item: {
    type?: "mcq" | "frq";
    correct_answer?: string | null;
    choices?: Array<{ id: string; image_url?: string | null }>;
    question_images?: Array<{ url: string }>;
  },
  ctx: z.RefinementCtx
) {
  const choices = item.choices ?? [];
  const choiceIds = choices.map((choice) => choice.id.trim()).filter(Boolean);
  const duplicateChoice = choiceIds.find((id, index) => choiceIds.indexOf(id) !== index);
  if (duplicateChoice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["choices"],
      message: `choice label "${duplicateChoice}" is duplicated`
    });
  }

  item.question_images?.forEach((image, index) => {
    if (isPdfPageImageUrl(image.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["question_images", index, "url"],
        message: `image path contains forbidden full-page screenshot reference: ${image.url}`
      });
    }
  });

  choices.forEach((choice, index) => {
    if (choice.image_url && isPdfPageImageUrl(choice.image_url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices", index, "image_url"],
        message: `image path contains forbidden full-page screenshot reference: ${choice.image_url}`
      });
    }
  });

  if (item.type === "mcq") {
    if (!item.correct_answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: "MCQ questions require correct_answer"
      });
    }
    if (choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "MCQ questions require at least two choices"
      });
    }
    if (item.correct_answer && !choices.some((choice) => choice.id === item.correct_answer)) {
      const selectedIds = item.correct_answer.split(",").map((id) => id.trim()).filter(Boolean);
      if (
        selectedIds.length === 0 ||
        !selectedIds.every((id) => choices.some((choice) => choice.id === id))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correct_answer"],
          message: `answer "${item.correct_answer}" does not match choices ${choiceIds.join("/") || "none"}`
        });
      }
    }
  }

  if (item.type === "frq") {
    if (item.correct_answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_answer"],
        message: "FRQ correct_answer must be null"
      });
    }
    if (choices.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "FRQ choices must be an empty array"
      });
    }
  }
}

export const questionImportItemBaseSchema = z.object({
    exam_name: z.string().min(1, "exam_name is required"),
    subject: z.string().min(1, "subject is required"),
    course: z.string().min(1, "course is required"),
    year: nullableYearSchema.default(null),
    section: z.string().min(1, "section is required"),
    exam_type: z.string().min(1, "exam_type is required"),
    question_number: nullablePositiveIntSchema.default(null),
    unit: z.string().min(1, "unit is required"),
    topic: z.string().min(1, "topic is required"),
    difficulty: difficultySchema,
    type: questionTypeSchema,
    selection_type: z.enum(["single", "multiple"]).optional(),
    required_selections: nullablePositiveIntSchema.default(null).optional(),
    max_selections: nullablePositiveIntSchema.default(null).optional(),
    question_text: z.string().min(1, "question_text is required"),
    question_images: z.array(questionImageSchema).default([]),
    choices: z.array(choiceSchema).default([]),
    correct_answer: z.string().nullable().default(null),
    explanation: z.string().min(1, "explanation is required"),
    source_pdf: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
    status: questionStatusSchema.default("draft"),
    points: z.coerce.number().int().positive().default(1),
    time_estimate_seconds: nullablePositiveIntSchema.default(null)
  });

export const questionImportItemSchema = questionImportItemBaseSchema.superRefine(validateQuestionShape);
export const questionImportItemWithIdSchema = questionImportItemBaseSchema.extend({
  id: z.string().min(1, "id is required")
}).superRefine(validateQuestionShape);

export const questionImportArraySchema = z.array(questionImportItemWithIdSchema).min(1);

export const examFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  subject: z.string().min(1),
  course: z.string().min(1),
  year: nullableYearSchema.default(null),
  section: z.string().min(1),
  exam_type: z.string().min(1),
  time_limit_minutes: z.coerce.number().int().positive(),
  status: examStatusSchema
});

export const questionFormSchema = questionImportItemBaseSchema.extend({
  id: z.string().optional()
}).superRefine(validateQuestionShape);

export const reviewGuideFormSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(""),
  subject: z.string().min(1),
  unit: z.string().min(1),
  topic: z.string().min(1),
  difficulty: difficultySchema.default("medium"),
  content_markdown: z.string().min(1),
  status: z.enum(["draft", "published"]),
  cover_image_url: z.string().nullable().optional(),
  estimated_reading_time_minutes: z.coerce.number().int().positive().default(8),
  question_ids: z.array(z.string()).default([])
});

export type QuestionImportParseResult =
  | { ok: true; data: z.infer<typeof questionImportArraySchema> }
  | { ok: false; errors: Array<{ index: number; path: string; message: string }> };

export function validateQuestionImportJson(input: unknown): QuestionImportParseResult {
  const parsed = questionImportArraySchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const [index, ...path] = issue.path;
      return {
        index: typeof index === "number" ? index : -1,
        path: path.join(".") || String(index ?? "root"),
        message: issue.message
      };
    })
  };
}
