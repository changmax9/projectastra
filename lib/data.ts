import { createSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";
import { inferSubjectFromCourse, normalizeExamType, normalizeSection, parseQuestionNumberFromTags, parseYearFromText } from "@/lib/ap-taxonomy";
import {
  mockAnswers,
  mockExamQuestions,
  mockExams,
  mockMediaFiles,
  mockPdfImportDraftAssets,
  mockPdfImportDraftQuestions,
  mockPdfImportJobs,
  mockPdfImportPages,
  mockPdfUploads,
  mockProfiles,
  mockQuestions,
  mockReviewGuideQuestions,
  mockReviewGuides,
  mockSubmissions
} from "@/lib/mock-data";
import { hydrateMockStore, persistMockStore } from "@/lib/mock-store";
import type {
  Answer,
  Exam,
  ExamFilters,
  ExamQuestion,
  ExamQuestionWithQuestion,
  ExamSection,
  ExamSectionProgress,
  ExamStatus,
  ExamWithQuestions,
  MediaFile,
  PdfDraftReviewStatus,
  PdfImportDraftAsset,
  PdfImportDraftQuestion,
  PdfImportBatch,
  PdfImportJob,
  PdfImportJobDetails,
  PdfImportPage,
  PdfImportReviewQueue,
  PdfUpload,
  Profile,
  Question,
  QuestionFilters,
  QuestionImage,
  QuestionImportItem,
  QuestionImportBatch,
  ReviewGuide,
  ReviewGuideWithQuestions,
  Submission,
  SubmissionStatus,
  SubmissionWithDetails
} from "@/lib/types";
import { normalizeText, nowIso, percentage, slugify, uid } from "@/lib/utils";

function adminClient() {
  return createSupabaseAdminClient();
}

async function ensureMockStore() {
  if (!hasSupabaseEnv()) await hydrateMockStore();
}

async function saveMockStore() {
  if (!hasSupabaseEnv()) await persistMockStore();
}

const DATA_CACHE_TTL_MS = 60_000;

type TimedCache<T> = {
  expiresAt: number;
  value: T;
};

const dataCache: {
  publishedExamSummaries?: TimedCache<ExamWithQuestions[]>;
  examSummaries: Map<string, TimedCache<ExamWithQuestions | null>>;
} = {
  examSummaries: new Map()
};

export function invalidateQuestionBankCache() {
  dataCache.publishedExamSummaries = undefined;
  dataCache.examSummaries.clear();
}

function getTimedCache<T>(entry: TimedCache<T> | undefined) {
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) return undefined;
  return entry.value;
}

function setTimedCache<T>(value: T): TimedCache<T> {
  return {
    expiresAt: Date.now() + DATA_CACHE_TTL_MS,
    value
  };
}

function sortByUpdatedDesc<T extends { updated_at?: string; created_at: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
  );
}

function normalizeExamRecord(exam: Exam): Exam {
  const legacySubject = exam.subject || "";
  const course = exam.course || (legacySubject.startsWith("AP ") ? legacySubject : legacySubject || exam.title);
  const subject = legacySubject.startsWith("AP ") ? inferSubjectFromCourse(course) : legacySubject || inferSubjectFromCourse(course);
  return {
    ...exam,
    subject,
    course,
    year: exam.year ?? parseYearFromText(exam.title, exam.description),
    section: normalizeSection(exam.section, exam.title.includes("FRQ") ? "FRQ" : exam.title.includes("MCQ") ? "MCQ" : "Full Exam"),
    exam_type: normalizeExamType(exam.exam_type || (exam.title.toLowerCase().includes("released") ? "Released Exam" : "Practice Exam")),
    sections: normalizeExamSections(exam.sections),
    status: exam.status || "draft"
  };
}

function normalizeExamSections(sections: ExamSection[] | undefined) {
  return [...(sections || [])]
    .filter((section) => section.id && section.section && section.title)
    .sort((a, b) => a.order - b.order);
}

function normalizeQuestionRecord(question: Question): Question {
  const legacySubject = question.subject || "";
  const course = question.course || question.exam_name || (legacySubject.startsWith("AP ") ? legacySubject : legacySubject || "AP Physics 1");
  const year = question.year ?? parseYearFromText(question.unit, question.source_pdf, question.tags?.join(" "));
  const section = normalizeSection(
    question.section,
    question.type === "frq" ? "FRQ" : question.tags?.includes("frq") ? "FRQ" : "MCQ"
  );
  const isSelectTwo = question.tags?.includes("select-two") || question.tags?.includes("multi-select");
  const explanation = /source\s+page\s+image|attached\s+source|Full\s+prompt.*answer\s+choices/i.test(
    question.explanation || ""
  )
    ? "Explanation coming soon."
    : question.explanation;
  return {
    ...question,
    exam_name: question.exam_name || course,
    subject: legacySubject.startsWith("AP ") ? inferSubjectFromCourse(course) : legacySubject || inferSubjectFromCourse(course),
    course,
    year,
    section,
    exam_type: normalizeExamType(question.exam_type),
    question_number: question.question_number ?? parseQuestionNumberFromTags(question.tags),
    selection_type: question.selection_type || (isSelectTwo ? "multiple" : "single"),
    required_selections: question.required_selections ?? (isSelectTwo ? 2 : 1),
    max_selections: question.max_selections ?? (isSelectTwo ? 2 : 1),
    explanation,
    status: question.status || "draft"
  };
}

function normalizeSubmissionRecord(submission: Submission): Submission {
  return {
    ...submission,
    section: submission.section ?? null,
    section_title: submission.section_title ?? null,
    calculator_allowed: submission.calculator_allowed ?? null,
    section_time_limit_minutes: submission.section_time_limit_minutes ?? null,
    current_step: submission.current_step || (submission.status === "completed" ? "completed" : "section"),
    current_section_index: Math.max(0, Number(submission.current_section_index || 0)),
    break_started_at: submission.break_started_at ?? null,
    break_completed_at: submission.break_completed_at ?? null,
    break_skipped: Boolean(submission.break_skipped),
    sections_progress: submission.sections_progress || [],
    current_question_index: Math.max(0, Number(submission.current_question_index || 0)),
    time_spent_seconds: Math.max(0, Number(submission.time_spent_seconds || 0))
  };
}

function submissionSectionFilter(section: string | null | undefined) {
  const normalized = String(section || "").trim();
  return normalized || null;
}

export function filterExamQuestionsForSubmission(exam: ExamWithQuestions, submission: Pick<Submission, "section">) {
  const section = submissionSectionFilter(submission.section);
  if (!section) return exam.exam_questions;
  return exam.exam_questions.filter((row) => row.question.section === section);
}

export function sectionQuestionCount(exam: ExamWithQuestions, section: string) {
  return exam.exam_questions.filter((row) => row.question.section === section).length;
}

export function getPlayableExamSections(exam: ExamWithQuestions) {
  return (exam.sections || []).filter((section) => sectionQuestionCount(exam, section.section) > 0);
}

function sectionRows(exam: ExamWithQuestions, section: string) {
  return exam.exam_questions.filter((row) => row.question.section === section);
}

function isFrqSection(exam: ExamWithQuestions, section: ExamSection) {
  const rows = sectionRows(exam, section.section);
  if (rows.length > 0) return rows.every((row) => row.question.type === "frq");
  return /FRQ|Free Response/i.test(`${section.section} ${section.title}`);
}

function buildSectionsProgress(exam: ExamWithQuestions): ExamSectionProgress[] {
  return getPlayableExamSections(exam).map((section, index) => ({
    section: section.section,
    sectionTitle: section.title,
    status: index === 0 ? "in_progress" : "not_started",
    startedAt: index === 0 ? nowIso() : null,
    submittedAt: null,
    timeLimitMinutes: section.timeLimitMinutes,
    timeSpentSeconds: 0,
    currentQuestionIndex: 0,
    scoreCorrect: 0,
    scoreTotal: 0
  }));
}

function ensureSectionsProgress(exam: ExamWithQuestions, submission: Submission) {
  const playable = getPlayableExamSections(exam);
  if (!playable.length) return [];
  const existing = submission.sections_progress || [];
  return playable.map((section, index) => {
    const current = existing.find((progress) => progress.section === section.section);
    return {
      section: section.section,
      sectionTitle: section.title,
      status: current?.status || (index === 0 ? "in_progress" : "not_started"),
      startedAt: current?.startedAt ?? (index === 0 ? submission.started_at : null),
      submittedAt: current?.submittedAt ?? null,
      timeLimitMinutes: section.timeLimitMinutes,
      timeSpentSeconds: current?.timeSpentSeconds ?? 0,
      currentQuestionIndex: current?.currentQuestionIndex ?? 0,
      scoreCorrect: current?.scoreCorrect ?? 0,
      scoreTotal: current?.scoreTotal ?? 0
    } satisfies ExamSectionProgress;
  });
}

function currentPlayableSection(exam: ExamWithQuestions, submission: Submission) {
  const sections = getPlayableExamSections(exam);
  if (!sections.length) return null;
  const index = Math.min(Math.max(0, Number(submission.current_section_index || 0)), sections.length - 1);
  return sections[index] || null;
}

function mcqScoreFromProgress(progress: ExamSectionProgress[]) {
  return progress.reduce(
    (score, section) => ({
      correct: score.correct + section.scoreCorrect,
      total: score.total + section.scoreTotal
    }),
    { correct: 0, total: 0 }
  );
}

function filterQuestions(items: Question[], filters: QuestionFilters = {}) {
  const search = normalizeText(filters.search);
  const section = normalizeText(filters.section);
  const tag = normalizeText(filters.tag);
  return items.filter((question) => {
    if (filters.examName && normalizeText(question.exam_name).includes(normalizeText(filters.examName)) === false) return false;
    if (filters.subject && question.subject !== filters.subject) return false;
    if (filters.course && question.course !== filters.course) return false;
    if (filters.unit && question.unit !== filters.unit) return false;
    if (filters.year && String(question.year || "") !== String(filters.year)) return false;
    if (section && normalizeText(question.section) !== section && question.type !== section) return false;
    if (filters.examType && question.exam_type !== filters.examType) return false;
    if (filters.topic && !normalizeText(question.topic).includes(normalizeText(filters.topic))) return false;
    if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
    if (filters.type && question.type !== filters.type) return false;
    if (filters.status && question.status !== filters.status) return false;
    if (tag && !question.tags.some((item) => normalizeText(item) === tag)) return false;
    if (search) {
      const haystack = normalizeText(
        [
          question.question_text,
          question.subject,
          question.course,
          question.exam_name,
          String(question.year || ""),
          question.section,
          question.exam_type,
          question.unit,
          question.topic,
          question.tags.join(" ")
        ].join(" ")
      );
      return haystack.includes(search);
    }
    return true;
  });
}

function filterExams(items: Exam[], filters: ExamFilters = {}) {
  const search = normalizeText(filters.search);
  return items.filter((exam) => {
    if (filters.subject && exam.subject !== filters.subject) return false;
    if (filters.course && exam.course !== filters.course) return false;
    if (filters.year && String(exam.year || "") !== String(filters.year)) return false;
    if (
      filters.section &&
      exam.section !== filters.section &&
      !exam.sections?.some((section) => section.section === filters.section)
    ) {
      return false;
    }
    if (filters.examType && exam.exam_type !== filters.examType) return false;
    if (filters.status && exam.status !== filters.status) return false;
    if (search) {
      const haystack = normalizeText([exam.title, exam.description, exam.subject, exam.course, String(exam.year || ""), exam.section, exam.exam_type].join(" "));
      return haystack.includes(search);
    }
    return true;
  });
}

function canonicalChoiceAnswer(value: string | null | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

type ExamSectionRow = {
  id: string;
  exam_id: string;
  section: string;
  title: string;
  question_count: number;
  time_limit_minutes: number;
  calculator_allowed: boolean;
  order_index: number;
};

type QuestionImageRow = {
  id: string;
  question_id: string;
  file_url: string;
  caption: string | null;
  alt: string | null;
  sort_order: number;
};

type SectionProgressRow = {
  attempt_id: string;
  exam_id: string;
  section: string;
  section_title: string;
  status: ExamSectionProgress["status"];
  started_at: string | null;
  submitted_at: string | null;
  time_limit_minutes: number;
  time_spent_seconds: number;
  current_question_index: number;
  score_correct: number;
  score_total: number;
};

type ExamAttemptRow = Omit<Submission, "sections_progress" | "section" | "section_title" | "calculator_allowed" | "section_time_limit_minutes"> & {
  student_id: string;
};

type StudentAnswerRow = Omit<Answer, "submission_id"> & {
  attempt_id: string;
};

interface QuestionListPageOptions {
  page?: number;
  pageSize?: number;
  summaryOnly?: boolean;
}

const QUESTION_SUMMARY_SELECT = [
  "id",
  "exam_name",
  "subject",
  "course",
  "year",
  "section",
  "exam_type",
  "question_number",
  "unit",
  "topic",
  "difficulty",
  "type",
  "selection_type",
  "required_selections",
  "max_selections",
  "question_text",
  "tags",
  "status",
  "points",
  "time_estimate_seconds",
  "created_by",
  "created_at",
  "updated_at"
].join(",");

const EXAM_QUESTION_SUMMARY_SELECT = [
  "id",
  "exam_id",
  "question_id",
  "order_index",
  "points_override",
  `question:questions(${QUESTION_SUMMARY_SELECT})`
].join(",");

async function withDevTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    if (process.env.NODE_ENV === "development") {
      console.log(`${label} took ${Date.now() - start}ms`);
    }
  }
}

function normalizeQuestionSummaryRecord(question: Partial<Question>): Question {
  return normalizeQuestionRecord({
    id: question.id || "",
    exam_name: question.exam_name || question.course || question.subject || "",
    subject: question.subject || "",
    course: question.course || question.exam_name || question.subject || "",
    year: question.year ?? null,
    section: question.section || "MCQ",
    exam_type: question.exam_type || "Practice Exam",
    question_number: question.question_number ?? null,
    unit: question.unit || "",
    topic: question.topic || "",
    difficulty: question.difficulty || "medium",
    type: question.type || "mcq",
    selection_type: question.selection_type || "single",
    required_selections: question.required_selections ?? 1,
    max_selections: question.max_selections ?? 1,
    question_text: question.question_text || "",
    question_images: [],
    choices: [],
    correct_answer: null,
    explanation: "",
    source_pdf: null,
    tags: question.tags || [],
    status: question.status || "draft",
    points: question.points || 1,
    time_estimate_seconds: question.time_estimate_seconds ?? null,
    created_by: question.created_by || null,
    created_at: question.created_at || nowIso(),
    updated_at: question.updated_at || nowIso()
  });
}

function mapExamSectionRow(row: ExamSectionRow): ExamSection {
  return {
    id: row.id,
    section: row.section,
    title: row.title,
    questionCount: Number(row.question_count || 0),
    timeLimitMinutes: Number(row.time_limit_minutes || 0),
    calculatorAllowed: Boolean(row.calculator_allowed),
    order: Number(row.order_index || 0)
  };
}

function examSectionToRow(examId: string, section: ExamSection) {
  return {
    id: section.id,
    exam_id: examId,
    section: section.section,
    title: section.title,
    question_count: section.questionCount,
    time_limit_minutes: section.timeLimitMinutes,
    calculator_allowed: section.calculatorAllowed,
    order_index: section.order
  };
}

function mapQuestionImageRow(row: QuestionImageRow): QuestionImage {
  return {
    id: row.id,
    url: row.file_url,
    caption: row.caption,
    alt: row.alt
  };
}

function questionImageToRow(questionId: string, image: QuestionImage, sortOrder: number) {
  return {
    id: image.id,
    question_id: questionId,
    file_url: image.url,
    caption: image.caption || null,
    alt: image.alt || null,
    sort_order: sortOrder
  };
}

function mapSectionProgressRow(row: SectionProgressRow): ExamSectionProgress {
  return {
    section: row.section,
    sectionTitle: row.section_title,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    timeLimitMinutes: Number(row.time_limit_minutes || 0),
    timeSpentSeconds: Number(row.time_spent_seconds || 0),
    currentQuestionIndex: Number(row.current_question_index || 0),
    scoreCorrect: Number(row.score_correct || 0),
    scoreTotal: Number(row.score_total || 0)
  };
}

function sectionProgressToRow(attemptId: string, examId: string, progress: ExamSectionProgress) {
  return {
    attempt_id: attemptId,
    exam_id: examId,
    section: progress.section,
    section_title: progress.sectionTitle,
    status: progress.status,
    started_at: progress.startedAt,
    submitted_at: progress.submittedAt,
    time_limit_minutes: progress.timeLimitMinutes,
    time_spent_seconds: progress.timeSpentSeconds,
    current_question_index: progress.currentQuestionIndex,
    score_correct: progress.scoreCorrect,
    score_total: progress.scoreTotal
  };
}

function mapAttemptRow(row: ExamAttemptRow, sectionsProgress: ExamSectionProgress[] = []): Submission {
  return normalizeSubmissionRecord({
    id: row.id,
    exam_id: row.exam_id,
    student_id: row.student_id,
    section: null,
    section_title: null,
    calculator_allowed: null,
    section_time_limit_minutes: null,
    current_step: row.current_step,
    current_section_index: row.current_section_index,
    break_started_at: row.break_started_at,
    break_completed_at: row.break_completed_at,
    break_skipped: row.break_skipped,
    sections_progress: sectionsProgress,
    status: row.status,
    started_at: row.started_at,
    submitted_at: row.submitted_at,
    total_score: Number(row.total_score || 0),
    max_score: Number(row.max_score || 0),
    percentage: Number(row.percentage || 0),
    time_spent_seconds: Number(row.time_spent_seconds || 0),
    current_question_index: Number(row.current_question_index || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

function mapStudentAnswerRow(row: StudentAnswerRow): Answer {
  return {
    id: row.id,
    submission_id: row.attempt_id,
    question_id: row.question_id,
    answer_text: row.answer_text,
    selected_choice: row.selected_choice,
    is_correct: row.is_correct,
    auto_score: Number(row.auto_score || 0),
    manual_score: row.manual_score === null ? null : Number(row.manual_score || 0),
    final_score: Number(row.final_score || 0),
    time_spent_seconds: row.time_spent_seconds,
    flagged: Boolean(row.flagged),
    eliminated_choice_ids: Array.isArray(row.eliminated_choice_ids) ? row.eliminated_choice_ids : [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function fetchExamSections(examId: string) {
  const { data, error } = await adminClient()
    .from("exam_sections")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data || []) as ExamSectionRow[]).map(mapExamSectionRow);
}

async function attachExamSections(exams: Exam[]) {
  const ids = exams.map((exam) => exam.id);
  if (ids.length === 0) return exams.map(normalizeExamRecord);
  const { data, error } = await adminClient()
    .from("exam_sections")
    .select("*")
    .in("exam_id", ids)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  const byExam = new Map<string, ExamSection[]>();
  for (const row of (data || []) as ExamSectionRow[]) {
    const items = byExam.get(row.exam_id) || [];
    items.push(mapExamSectionRow(row));
    byExam.set(row.exam_id, items);
  }
  return exams.map((exam) => normalizeExamRecord({ ...exam, sections: byExam.get(exam.id) || exam.sections }));
}

async function attachQuestionImages(questions: Question[]) {
  const ids = questions.map((question) => question.id);
  if (ids.length === 0) return questions.map(normalizeQuestionRecord);
  const { data, error } = await adminClient()
    .from("question_images")
    .select("*")
    .in("question_id", ids)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const byQuestion = new Map<string, QuestionImage[]>();
  for (const row of (data || []) as QuestionImageRow[]) {
    const items = byQuestion.get(row.question_id) || [];
    items.push(mapQuestionImageRow(row));
    byQuestion.set(row.question_id, items);
  }
  return questions.map((question) =>
    normalizeQuestionRecord({
      ...question,
      question_images: byQuestion.get(question.id) || question.question_images || []
    })
  );
}

function applyQuestionFiltersToQuery(query: any, filters: QuestionFilters = {}) {
  let nextQuery = query;
  if (filters.examName) nextQuery = nextQuery.ilike("exam_name", `%${filters.examName}%`);
  if (filters.subject) nextQuery = nextQuery.eq("subject", filters.subject);
  if (filters.course) nextQuery = nextQuery.eq("course", filters.course);
  if (filters.unit) nextQuery = nextQuery.eq("unit", filters.unit);
  if (filters.topic) nextQuery = nextQuery.ilike("topic", `%${filters.topic}%`);
  if (filters.difficulty) nextQuery = nextQuery.eq("difficulty", filters.difficulty);
  if (filters.type) nextQuery = nextQuery.eq("type", filters.type);
  if (filters.status) nextQuery = nextQuery.eq("status", filters.status);
  if (filters.year) nextQuery = nextQuery.eq("year", Number(filters.year));
  if (filters.section) nextQuery = nextQuery.eq("section", filters.section);
  if (filters.examType) nextQuery = nextQuery.eq("exam_type", filters.examType);
  if (filters.tag) nextQuery = nextQuery.contains("tags", [filters.tag]);
  if (filters.search) nextQuery = nextQuery.ilike("question_text", `%${filters.search}%`);
  return nextQuery;
}

async function syncExamSections(examId: string, sections: ExamSection[]) {
  const supabase = adminClient();
  await supabase.from("exam_sections").delete().eq("exam_id", examId);
  if (sections.length === 0) return;
  const { error } = await supabase.from("exam_sections").insert(sections.map((section) => examSectionToRow(examId, section)));
  if (error) throw new Error(error.message);
}

async function syncQuestionImages(questionId: string, images: QuestionImage[]) {
  const supabase = adminClient();
  await supabase.from("question_images").delete().eq("question_id", questionId);
  if (images.length === 0) return;
  const { error } = await supabase.from("question_images").insert(images.map((image, index) => questionImageToRow(questionId, image, index + 1)));
  if (error) throw new Error(error.message);
}

async function fetchSectionProgressForAttempts(attemptIds: string[]) {
  if (attemptIds.length === 0) return new Map<string, ExamSectionProgress[]>();
  const { data, error } = await adminClient()
    .from("section_progress")
    .select("*")
    .in("attempt_id", attemptIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const byAttempt = new Map<string, ExamSectionProgress[]>();
  for (const row of (data || []) as SectionProgressRow[]) {
    const items = byAttempt.get(row.attempt_id) || [];
    items.push(mapSectionProgressRow(row));
    byAttempt.set(row.attempt_id, items);
  }
  return byAttempt;
}

async function upsertSectionProgressRows(attemptId: string, examId: string, progress: ExamSectionProgress[]) {
  if (progress.length === 0) return;
  const { error } = await adminClient()
    .from("section_progress")
    .upsert(progress.map((item) => sectionProgressToRow(attemptId, examId, item)), { onConflict: "attempt_id,section" });
  if (error) throw new Error(error.message);
}

async function getSupabaseSubmission(submissionId: string) {
  const { data, error } = await adminClient().from("exam_attempts").select("*").eq("id", submissionId).single();
  if (error || !data) return null;
  const progress = await fetchSectionProgressForAttempts([submissionId]);
  return mapAttemptRow(data as ExamAttemptRow, progress.get(submissionId) || []);
}

async function upsertStudentAnswer(answer: Answer) {
  const { data, error } = await adminClient()
    .from("student_answers")
    .upsert(
      {
        attempt_id: answer.submission_id,
        question_id: answer.question_id,
        answer_text: answer.answer_text,
        selected_choice: answer.selected_choice,
        is_correct: answer.is_correct,
        auto_score: answer.auto_score,
        manual_score: answer.manual_score,
        final_score: answer.final_score,
        time_spent_seconds: answer.time_spent_seconds,
        flagged: answer.flagged,
        eliminated_choice_ids: answer.eliminated_choice_ids || [],
        updated_at: answer.updated_at
      },
      { onConflict: "attempt_id,question_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapStudentAnswerRow(data as StudentAnswerRow);
}

async function upsertStudentAnswers(answers: Answer[]) {
  if (answers.length === 0) return;
  const { error } = await adminClient()
    .from("student_answers")
    .upsert(
      answers.map((answer) => ({
        attempt_id: answer.submission_id,
        question_id: answer.question_id,
        answer_text: answer.answer_text,
        selected_choice: answer.selected_choice,
        is_correct: answer.is_correct,
        auto_score: answer.auto_score,
        manual_score: answer.manual_score,
        final_score: answer.final_score,
        time_spent_seconds: answer.time_spent_seconds,
        flagged: answer.flagged,
        eliminated_choice_ids: answer.eliminated_choice_ids || [],
        updated_at: answer.updated_at
      })),
      { onConflict: "attempt_id,question_id" }
    );
  if (error) throw new Error(error.message);

  const frqRows = answers
    .filter((answer) => answer.answer_text !== null)
    .map((answer) => ({
      attempt_id: answer.submission_id,
      question_id: answer.question_id,
      response_text: answer.answer_text || "",
      updated_at: answer.updated_at
    }));
  if (frqRows.length > 0) {
    const { error: frqError } = await adminClient()
      .from("frq_responses")
      .upsert(frqRows, { onConflict: "attempt_id,question_id" });
    if (frqError) throw new Error(frqError.message);
  }
}

async function upsertFrqResponseFromAnswer(answer: Answer) {
  if (answer.answer_text === null) return;
  const { error } = await adminClient()
    .from("frq_responses")
    .upsert(
      {
        attempt_id: answer.submission_id,
        question_id: answer.question_id,
        response_text: answer.answer_text || "",
        updated_at: answer.updated_at
      },
      { onConflict: "attempt_id,question_id" }
    );
  if (error) throw new Error(error.message);
}

async function logAdminEdit(adminId: string, entityType: string, entityId: string, action: string, changes: object = {}) {
  if (!hasSupabaseEnv()) return;
  const { error } = await adminClient().from("admin_edits").insert({
    admin_id: adminId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    changes
  });
  if (error) throw new Error(error.message);
}

export async function listPublishedExams() {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exams")
      .select("*")
      .eq("status", "published")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return attachExamSections((data || []) as Exam[]);
  }

  await ensureMockStore();
  return mockExams.map(normalizeExamRecord).filter((exam) => exam.status === "published");
}

export async function adminListExams(filters: ExamFilters = {}) {
  if (hasSupabaseEnv()) {
    let query = adminClient()
      .from("exams")
      .select("*")
      .order("updated_at", { ascending: false });
    if (filters.subject) query = query.eq("subject", filters.subject);
    if (filters.course) query = query.eq("course", filters.course);
    if (filters.year) query = query.eq("year", Number(filters.year));
    if (filters.section) query = query.eq("section", filters.section);
    if (filters.examType) query = query.eq("exam_type", filters.examType);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,course.ilike.%${filters.search}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return attachExamSections((data || []) as Exam[]);
  }

  await ensureMockStore();
  return sortByUpdatedDesc(filterExams(mockExams.map(normalizeExamRecord), filters));
}

export async function getExamWithQuestions(examId: string, includeDraft = false): Promise<ExamWithQuestions | null> {
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: exam, error } = await supabase.from("exams").select("*").eq("id", examId).single();
    if (error || !exam) return null;
    if (!includeDraft && exam.status !== "published") return null;

    const { data: rows, error: rowError } = await supabase
      .from("exam_questions")
      .select("*, question:questions(*)")
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });
    if (rowError) throw new Error(rowError.message);

    const [examWithSections] = await attachExamSections([exam as Exam]);
    const questionsWithImages = await attachQuestionImages(
      ((rows || []) as Array<ExamQuestion & { question: Question }>).map((row) => row.question)
    );
    const questionsById = new Map(questionsWithImages.map((question) => [question.id, question]));

    return {
      ...examWithSections,
      exam_questions: ((rows || []) as Array<ExamQuestion & { question: Question }>).map((row) => ({
        ...row,
        question: questionsById.get(row.question.id) || normalizeQuestionRecord(row.question)
      }))
    };
  }

  await ensureMockStore();
  const exam = mockExams.map(normalizeExamRecord).find((item) => item.id === examId);
  if (!exam || (!includeDraft && exam.status !== "published")) return null;
  const rows = mockExamQuestions
    .filter((row) => row.exam_id === examId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((row) => ({
      ...row,
      question: mockQuestions.map(normalizeQuestionRecord).find((question) => question.id === row.question_id)!
    }))
    .filter((row) => row.question);

  return { ...exam, exam_questions: rows };
}

export async function getPublishedExamSummaries(): Promise<ExamWithQuestions[]> {
  return withDevTiming("getAvailableExams", async () => {
    if (hasSupabaseEnv()) {
      const cached = getTimedCache(dataCache.publishedExamSummaries);
      if (cached) return cached;

      const supabase = adminClient();
      const { data: exams, error } = await supabase
        .from("exams")
        .select("*")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      const examRecords = await attachExamSections((exams || []) as Exam[]);
      const examIds = examRecords.map((exam) => exam.id);
      if (examIds.length === 0) return [];

      const { data: rows, error: rowError } = await supabase
        .from("exam_questions")
        .select(EXAM_QUESTION_SUMMARY_SELECT)
        .in("exam_id", examIds)
        .order("exam_id", { ascending: true })
        .order("order_index", { ascending: true });
      if (rowError) throw new Error(rowError.message);

      const byExam = new Map<string, ExamQuestionWithQuestion[]>();
      for (const row of (rows || []) as unknown as Array<ExamQuestion & { question: Partial<Question> }>) {
        const items = byExam.get(row.exam_id) || [];
        items.push({
          ...row,
          question: normalizeQuestionSummaryRecord(row.question)
        });
        byExam.set(row.exam_id, items);
      }

      const summaries = examRecords.map((exam) => ({
        ...exam,
        exam_questions: byExam.get(exam.id) || []
      }));
      dataCache.publishedExamSummaries = setTimedCache(summaries);
      return summaries;
    }

    await ensureMockStore();
    return mockExams
      .map(normalizeExamRecord)
      .filter((exam) => exam.status === "published")
      .map((exam) => ({
        ...exam,
        exam_questions: mockExamQuestions
          .filter((row) => row.exam_id === exam.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((row) => {
            const question = mockQuestions.map(normalizeQuestionRecord).find((item) => item.id === row.question_id);
            return question
              ? {
                  ...row,
                  question: normalizeQuestionSummaryRecord(question)
                }
              : null;
          })
          .filter(Boolean) as ExamQuestionWithQuestion[]
      }));
  });
}

export async function getExamWithQuestionSummaries(examId: string, includeDraft = false): Promise<ExamWithQuestions | null> {
  if (hasSupabaseEnv()) {
    const cacheKey = `${examId}:${includeDraft ? "draft" : "published"}`;
    const cached = getTimedCache(dataCache.examSummaries.get(cacheKey));
    if (cached !== undefined) return cached;

    const supabase = adminClient();
    const { data: exam, error } = await supabase.from("exams").select("*").eq("id", examId).single();
    if (error || !exam) {
      dataCache.examSummaries.set(cacheKey, setTimedCache(null));
      return null;
    }
    if (!includeDraft && exam.status !== "published") {
      dataCache.examSummaries.set(cacheKey, setTimedCache(null));
      return null;
    }
    const [examWithSections] = await attachExamSections([exam as Exam]);
    const { data: rows, error: rowError } = await supabase
      .from("exam_questions")
      .select(EXAM_QUESTION_SUMMARY_SELECT)
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });
    if (rowError) throw new Error(rowError.message);
    const summary = {
      ...examWithSections,
      exam_questions: ((rows || []) as unknown as Array<ExamQuestion & { question: Partial<Question> }>).map((row) => ({
        ...row,
        question: normalizeQuestionSummaryRecord(row.question)
      }))
    };
    dataCache.examSummaries.set(cacheKey, setTimedCache(summary));
    return summary;
  }

  await ensureMockStore();
  const fullExam = await getExamWithQuestions(examId, includeDraft);
  if (!fullExam) return null;
  return {
    ...fullExam,
    exam_questions: fullExam.exam_questions.map((row) => ({
      ...row,
      question: normalizeQuestionSummaryRecord(row.question)
    }))
  };
}

export async function getExamWithSectionQuestions(examId: string, section?: string | null, includeDraft = false): Promise<ExamWithQuestions | null> {
  return withDevTiming("getQuestionsForCurrentSection", async () => {
    if (hasSupabaseEnv()) {
      const supabase = adminClient();
      const { data: exam, error } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (error || !exam) return null;
      if (!includeDraft && exam.status !== "published") return null;
      const [examWithSections] = await attachExamSections([exam as Exam]);

      const { data: examQuestionRows, error: rowError } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", examId)
        .order("order_index", { ascending: true });
      if (rowError) throw new Error(rowError.message);
      const rows = (examQuestionRows || []) as ExamQuestion[];
      const questionIds = rows.map((row) => row.question_id);
      if (questionIds.length === 0) return { ...examWithSections, exam_questions: [] };

      let questionQuery = supabase.from("questions").select("*").in("id", questionIds);
      if (section) questionQuery = questionQuery.eq("section", section);
      const { data: questionRows, error: questionError } = await questionQuery;
      if (questionError) throw new Error(questionError.message);
      const questionsWithImages = await attachQuestionImages((questionRows || []) as Question[]);
      const questionsById = new Map(questionsWithImages.map((question) => [question.id, question]));
      return {
        ...examWithSections,
        exam_questions: rows
          .filter((row) => questionsById.has(row.question_id))
          .map((row) => ({
            ...row,
            question: questionsById.get(row.question_id)!
          }))
      };
    }

    await ensureMockStore();
    const fullExam = await getExamWithQuestions(examId, includeDraft);
    if (!fullExam) return null;
    return {
      ...fullExam,
      exam_questions: section
        ? fullExam.exam_questions.filter((row) => row.question.section === section)
        : fullExam.exam_questions
    };
  });
}

export async function listQuestions(filters: QuestionFilters = {}) {
  if (hasSupabaseEnv()) {
    let query = adminClient().from("questions").select("*").order("updated_at", { ascending: false });
    query = applyQuestionFiltersToQuery(query, filters);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return attachQuestionImages((data || []) as Question[]);
  }

  await ensureMockStore();
  return sortByUpdatedDesc(filterQuestions(mockQuestions.map(normalizeQuestionRecord), filters));
}

export async function listQuestionsPage(filters: QuestionFilters = {}, options: QuestionListPageOptions = {}) {
  return withDevTiming("getAdminQuestionsPage", async () => {
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 25)));
    const page = Math.max(1, Number(options.page || 1));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (hasSupabaseEnv()) {
      const select = options.summaryOnly ? QUESTION_SUMMARY_SELECT : "*";
      let query = adminClient()
        .from("questions")
        .select(select, { count: "exact" })
        .order("updated_at", { ascending: false });
      query = applyQuestionFiltersToQuery(query, filters);
      const { data, error, count } = await query.range(from, to);
      if (error) throw new Error(error.message);
      const rows = options.summaryOnly
        ? ((data || []) as unknown as Partial<Question>[]).map(normalizeQuestionSummaryRecord)
        : await attachQuestionImages((data || []) as unknown as Question[]);
      return {
        questions: rows,
        total: count || 0,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil((count || 0) / pageSize))
      };
    }

    await ensureMockStore();
    const filtered = sortByUpdatedDesc(filterQuestions(mockQuestions.map(normalizeQuestionRecord), filters));
    const rows = filtered.slice(from, to + 1);
    return {
      questions: options.summaryOnly ? rows.map(normalizeQuestionSummaryRecord) : rows,
      total: filtered.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(filtered.length / pageSize))
    };
  });
}

export async function getQuestion(questionId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("questions").select("*").eq("id", questionId).single();
    if (error || !data) return null;
    const [question] = await attachQuestionImages([data as Question]);
    return question;
  }

  await ensureMockStore();
  const question = mockQuestions.map(normalizeQuestionRecord).find((item) => item.id === questionId);
  return question || null;
}

export async function upsertQuestion(input: Partial<Question> & Omit<QuestionImportItem, "id"> & { id?: string }, adminId: string) {
  const timestamp = nowIso();
  const payload: Question = {
    id: input.id || uid("question"),
    exam_name: input.exam_name || input.course || input.subject,
    subject: input.subject,
    course: input.course || input.exam_name || input.subject,
    year: input.year ?? null,
    section: normalizeSection(input.section, input.type === "frq" ? "FRQ" : "MCQ"),
    exam_type: normalizeExamType(input.exam_type),
    question_number: input.question_number ?? null,
    unit: input.unit,
    topic: input.topic,
    difficulty: input.difficulty,
    type: input.type,
    selection_type: input.selection_type || (input.tags?.includes("multi-select") ? "multiple" : "single"),
    required_selections: input.required_selections ?? (input.tags?.includes("multi-select") ? 2 : 1),
    max_selections: input.max_selections ?? (input.tags?.includes("multi-select") ? 2 : 1),
    question_text: input.question_text,
    question_images: input.question_images || [],
    choices: input.choices || [],
    correct_answer: input.correct_answer ?? null,
    explanation: input.explanation,
    source_pdf: input.source_pdf ?? null,
    tags: input.tags || [],
    status: input.status || "draft",
    points: input.points || 1,
    time_estimate_seconds: input.time_estimate_seconds ?? null,
    created_by: input.created_by || adminId,
    created_at: input.created_at || timestamp,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const { question_images: questionImages, ...questionPayload } = payload;
    const { data, error } = await adminClient().from("questions").upsert(questionPayload).select("*").single();
    if (error) throw new Error(error.message);
    await syncQuestionImages(payload.id, questionImages || []);
    await logAdminEdit(adminId, "question", payload.id, "upsert", {
      status: payload.status,
      tags: payload.tags,
      updated_at: payload.updated_at
    });
    invalidateQuestionBankCache();
    const [question] = await attachQuestionImages([data as Question]);
    return question;
  }

  const existingIndex = mockQuestions.findIndex((question) => question.id === payload.id);
  if (existingIndex >= 0) {
    mockQuestions[existingIndex] = { ...mockQuestions[existingIndex], ...payload };
  } else {
    mockQuestions.push(payload);
  }
  await saveMockStore();
  invalidateQuestionBankCache();
  return payload;
}

export async function deleteQuestion(questionId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("questions").delete().eq("id", questionId);
    if (error) throw new Error(error.message);
    invalidateQuestionBankCache();
    return;
  }

  const index = mockQuestions.findIndex((question) => question.id === questionId);
  if (index >= 0) mockQuestions.splice(index, 1);
  for (let i = mockExamQuestions.length - 1; i >= 0; i -= 1) {
    if (mockExamQuestions[i].question_id === questionId) mockExamQuestions.splice(i, 1);
  }
  await saveMockStore();
  invalidateQuestionBankCache();
}

export async function importQuestions(items: QuestionImportItem[], adminId: string) {
  const created: Question[] = [];
  for (const item of items) {
    created.push(await upsertQuestion(item, adminId));
  }
  return created;
}

export async function importQuestionBatch(batch: QuestionImportBatch, adminId: string) {
  const exam = await upsertExam(batch.exam, adminId);
  const created = await importQuestions(batch.questions, adminId);

  for (const question of created) {
    if (hasSupabaseEnv()) {
      const supabase = adminClient();
      const { data: existing } = await supabase
        .from("exam_questions")
        .select("id")
        .eq("exam_id", exam.id)
        .eq("question_id", question.id)
        .maybeSingle();
      if (!existing) {
        const { count } = await supabase
          .from("exam_questions")
          .select("*", { count: "exact", head: true })
          .eq("exam_id", exam.id);
        await supabase.from("exam_questions").insert({
          exam_id: exam.id,
          question_id: question.id,
          order_index: (count || 0) + 1,
          points_override: null
        });
      }
    } else if (!mockExamQuestions.some((row) => row.exam_id === exam.id && row.question_id === question.id)) {
      const maxOrder = Math.max(
        0,
        ...mockExamQuestions.filter((row) => row.exam_id === exam.id).map((row) => row.order_index)
      );
      mockExamQuestions.push({
        id: uid("exam_question"),
        exam_id: exam.id,
        question_id: question.id,
        order_index: maxOrder + 1,
        points_override: null
      });
    }
  }
  await saveMockStore();
  invalidateQuestionBankCache();
  return { exam, questions: created };
}

export async function upsertExam(input: Partial<Exam>, adminId: string) {
  const timestamp = nowIso();
  if (!hasSupabaseEnv()) await ensureMockStore();
  const existingExam = !hasSupabaseEnv() && input.id ? mockExams.find((item) => item.id === input.id) : null;
  const existingSupabaseSections =
    hasSupabaseEnv() && input.id && input.sections === undefined ? await fetchExamSections(input.id) : undefined;
  const exam: Exam = {
    id: input.id || uid("exam"),
    title: input.title || "Untitled Exam",
    description: input.description || "",
    subject: input.subject || inferSubjectFromCourse(input.course || "AP Physics 1"),
    course: input.course || input.subject || "AP Physics 1",
    year: input.year ?? null,
    section: normalizeSection(input.section, "Full Exam"),
    exam_type: normalizeExamType(input.exam_type),
    time_limit_minutes: Number(input.time_limit_minutes || 45),
    sections: normalizeExamSections(input.sections ?? existingExam?.sections ?? existingSupabaseSections),
    status: (input.status as ExamStatus) || "draft",
    created_by: input.created_by || adminId,
    created_at: input.created_at || timestamp,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const { sections, ...supabaseExam } = exam;
    const { data, error } = await adminClient().from("exams").upsert(supabaseExam).select("*").single();
    if (error) throw new Error(error.message);
    if (input.sections !== undefined) await syncExamSections(exam.id, sections || []);
    await logAdminEdit(adminId, "exam", exam.id, "upsert", {
      status: exam.status,
      section_count: sections?.length || 0,
      updated_at: exam.updated_at
    });
    invalidateQuestionBankCache();
    const [savedExam] = await attachExamSections([data as Exam]);
    return savedExam;
  }

  const index = mockExams.findIndex((item) => item.id === exam.id);
  if (index >= 0) mockExams[index] = { ...mockExams[index], ...exam };
  else mockExams.push(exam);
  await saveMockStore();
  invalidateQuestionBankCache();
  return exam;
}

export async function deleteExam(examId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("exams").delete().eq("id", examId);
    if (error) throw new Error(error.message);
    invalidateQuestionBankCache();
    return;
  }

  const index = mockExams.findIndex((exam) => exam.id === examId);
  if (index >= 0) mockExams.splice(index, 1);
  await saveMockStore();
  invalidateQuestionBankCache();
}

export async function addQuestionToExam(examId: string, questionId: string) {
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { count } = await supabase
      .from("exam_questions")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", examId);
    const payload = {
      exam_id: examId,
      question_id: questionId,
      order_index: (count || 0) + 1,
      points_override: null
    };
    const { error } = await supabase.from("exam_questions").insert(payload);
    if (error) throw new Error(error.message);
    invalidateQuestionBankCache();
    return;
  }

  const maxOrder = Math.max(
    0,
    ...mockExamQuestions.filter((row) => row.exam_id === examId).map((row) => row.order_index)
  );
  mockExamQuestions.push({
    id: uid("exam_question"),
    exam_id: examId,
    question_id: questionId,
    order_index: maxOrder + 1,
    points_override: null
  });
  await saveMockStore();
  invalidateQuestionBankCache();
}

export async function removeQuestionFromExam(examQuestionId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("exam_questions").delete().eq("id", examQuestionId);
    if (error) throw new Error(error.message);
    invalidateQuestionBankCache();
    return;
  }

  const index = mockExamQuestions.findIndex((row) => row.id === examQuestionId);
  if (index >= 0) mockExamQuestions.splice(index, 1);
  await saveMockStore();
  invalidateQuestionBankCache();
}

export async function reorderExamQuestion(examQuestionId: string, direction: "up" | "down") {
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: current, error } = await supabase
      .from("exam_questions")
      .select("*")
      .eq("id", examQuestionId)
      .single();
    if (error || !current) return;
    const { data: rows } = await supabase
      .from("exam_questions")
      .select("*")
      .eq("exam_id", current.exam_id)
      .order("order_index", { ascending: true });
    const ordered = (rows || []) as ExamQuestion[];
    const index = ordered.findIndex((row) => row.id === examQuestionId);
    const neighbor = ordered[direction === "up" ? index - 1 : index + 1];
    if (!neighbor) return;
    await supabase.from("exam_questions").update({ order_index: -1 }).eq("id", current.id);
    await supabase.from("exam_questions").update({ order_index: current.order_index }).eq("id", neighbor.id);
    await supabase.from("exam_questions").update({ order_index: neighbor.order_index }).eq("id", current.id);
    invalidateQuestionBankCache();
    return;
  }

  const current = mockExamQuestions.find((row) => row.id === examQuestionId);
  if (!current) return;
  const rows = mockExamQuestions
    .filter((row) => row.exam_id === current.exam_id)
    .sort((a, b) => a.order_index - b.order_index);
  const index = rows.findIndex((row) => row.id === examQuestionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return;
  const other = rows[swapIndex];
  const oldOrder = current.order_index;
  current.order_index = other.order_index;
  other.order_index = oldOrder;
  await saveMockStore();
  invalidateQuestionBankCache();
}

export async function getStudentDashboard(profileId: string) {
  return withDevTiming("getDashboardData", async () => {
    const [examDetails, submissions, guides] = await Promise.all([
      getPublishedExamSummaries(),
      listStudentSubmissions(profileId),
      listPublishedReviewGuides({})
    ]);

    return {
      exams: examDetails.map(({ exam_questions, ...exam }) => exam),
      examDetails,
      submissions,
      guides: guides.slice(0, 3),
      latestSubmission:
        submissions.find(
          (submission) =>
            (submission.status === "graded" || submission.status === "completed") && submission.max_score > 0
        ) || null
    };
  });
}

export async function listStudentSubmissions(studentId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exam_attempts")
      .select("*, exam:exams(*)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data || []) as Array<ExamAttemptRow & { exam: Exam | null }>;
    const progress = await fetchSectionProgressForAttempts(rows.map((row) => row.id));
    const exams = await attachExamSections(rows.map((row) => row.exam).filter(Boolean) as Exam[]);
    const examsById = new Map(exams.map((exam) => [exam.id, exam]));
    return rows.map((submission) => ({
      ...mapAttemptRow(submission, progress.get(submission.id) || []),
      exam: examsById.get(submission.exam_id) || null
    }));
  }

  await ensureMockStore();
  return sortByUpdatedDesc(
    mockSubmissions.filter((submission) => submission.student_id === studentId)
  ).map((submission) => ({
    ...normalizeSubmissionRecord(submission),
    exam: mockExams.map(normalizeExamRecord).find((exam) => exam.id === submission.exam_id) || null
  }));
}

export async function createOrContinueSubmission(examId: string, studentId: string) {
  const exam = await getExamWithQuestionSummaries(examId, true);
  const sectionsProgress = exam ? buildSectionsProgress(exam) : [];
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: existing } = await supabase
      .from("exam_attempts")
      .select("*")
      .eq("exam_id", examId)
      .eq("student_id", studentId)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const existingSubmission = await getSupabaseSubmission((existing as ExamAttemptRow).id);
      if (existingSubmission) return existingSubmission;
    }

    const { data, error } = await supabase
      .from("exam_attempts")
      .insert({
        exam_id: examId,
        student_id: studentId,
        current_step: sectionsProgress.length ? "section" : "section",
        current_section_index: 0,
        break_started_at: null,
        break_completed_at: null,
        break_skipped: false,
        status: "in_progress",
        started_at: nowIso(),
        total_score: 0,
        max_score: 0,
        percentage: 0,
        time_spent_seconds: 0,
        current_question_index: 0
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await upsertSectionProgressRows((data as ExamAttemptRow).id, examId, sectionsProgress);
    return mapAttemptRow(data as ExamAttemptRow, sectionsProgress);
  }

  await ensureMockStore();
  const existing = mockSubmissions.find(
    (submission) =>
      submission.exam_id === examId &&
      submission.student_id === studentId &&
      submission.status === "in_progress" &&
      !submissionSectionFilter(submission.section)
  );
  if (existing) return normalizeSubmissionRecord(existing);

  const timestamp = nowIso();
  const submission: Submission = {
    id: uid("submission"),
    exam_id: examId,
    student_id: studentId,
    section: null,
    section_title: null,
    calculator_allowed: null,
    section_time_limit_minutes: null,
    current_step: sectionsProgress.length ? "section" : "section",
    current_section_index: 0,
    break_started_at: null,
    break_completed_at: null,
    break_skipped: false,
    sections_progress: sectionsProgress.map((progress, index) => ({
      ...progress,
      startedAt: index === 0 ? timestamp : progress.startedAt
    })),
    status: "in_progress",
    started_at: timestamp,
    submitted_at: null,
    total_score: 0,
    max_score: 0,
    percentage: 0,
    time_spent_seconds: 0,
    current_question_index: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
  mockSubmissions.push(submission);
  await saveMockStore();
  return submission;
}

export async function recoverMockSubmission(input: {
  id: string;
  examId: string;
  studentId: string;
  startedAt: string;
  section?: ExamSection | null;
}) {
  if (hasSupabaseEnv()) return null;
  await ensureMockStore();
  const existing = mockSubmissions.find((submission) => submission.id === input.id);
  if (existing) return existing;

  const timestamp = nowIso();
  const sectionKey = submissionSectionFilter(input.section?.section);
  const submission: Submission = {
    id: input.id,
    exam_id: input.examId,
    student_id: input.studentId,
    section: sectionKey,
    section_title: input.section?.title ?? null,
    calculator_allowed: input.section?.calculatorAllowed ?? null,
    section_time_limit_minutes: input.section?.timeLimitMinutes ?? null,
    status: "in_progress",
    started_at: input.startedAt || timestamp,
    submitted_at: null,
    total_score: 0,
    max_score: 0,
    percentage: 0,
    time_spent_seconds: 0,
    current_question_index: 0,
    created_at: input.startedAt || timestamp,
    updated_at: timestamp
  };
  mockSubmissions.push(submission);
  await saveMockStore();
  return submission;
}

export async function getSubmission(submissionId: string) {
  if (hasSupabaseEnv()) {
    return getSupabaseSubmission(submissionId);
  }

  await ensureMockStore();
  const submission = mockSubmissions.find((item) => item.id === submissionId);
  return submission ? normalizeSubmissionRecord(submission) : null;
}

export async function updateSubmissionProgress(input: {
  submissionId: string;
  currentQuestionIndex: number;
  timeSpentSeconds: number;
}) {
  const timestamp = nowIso();
  const currentQuestionIndex = Math.max(0, Math.floor(input.currentQuestionIndex || 0));
  const timeSpentSeconds = Math.max(0, Math.floor(input.timeSpentSeconds || 0));

  const submission = await getSubmission(input.submissionId);
  const progress = submission?.sections_progress ? [...submission.sections_progress] : [];
  if (submission?.current_step === "section" && progress.length > 0) {
    const index = Math.min(Math.max(0, Number(submission.current_section_index || 0)), progress.length - 1);
    progress[index] = {
      ...progress[index],
      status: "in_progress",
      startedAt: progress[index].startedAt || submission.started_at,
      currentQuestionIndex,
      timeSpentSeconds
    };
  }

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exam_attempts")
      .update({
        current_question_index: currentQuestionIndex,
        time_spent_seconds: timeSpentSeconds,
        updated_at: timestamp
      })
      .eq("id", input.submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await upsertSectionProgressRows(input.submissionId, (data as ExamAttemptRow).exam_id, progress);
    return mapAttemptRow(data as ExamAttemptRow, progress);
  }

  await ensureMockStore();
  const storedSubmission = mockSubmissions.find((item) => item.id === input.submissionId);
  if (!storedSubmission) return null;
  storedSubmission.current_question_index = currentQuestionIndex;
  storedSubmission.time_spent_seconds = timeSpentSeconds;
  storedSubmission.sections_progress = progress;
  storedSubmission.updated_at = timestamp;
  await saveMockStore();
  return normalizeSubmissionRecord(storedSubmission);
}

export async function listAnswersForSubmission(submissionId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("student_answers")
      .select("*")
      .eq("attempt_id", submissionId);
    if (error) throw new Error(error.message);
    return ((data || []) as StudentAnswerRow[]).map(mapStudentAnswerRow);
  }

  await ensureMockStore();
  return mockAnswers.filter((answer) => answer.submission_id === submissionId);
}

interface SaveAnswerInput {
  submissionId: string;
  questionId: string;
  selectedChoice?: string | null;
  answerText?: string | null;
  flagged?: boolean;
  timeSpentSeconds?: number | null;
  eliminatedChoiceIds?: string[];
}

export async function saveAnswers(inputs: SaveAnswerInput[]) {
  if (inputs.length === 0) return [];
  const timestamp = nowIso();
  const deduped = Array.from(
    inputs
      .reduce((map, input) => {
        map.set(`${input.submissionId}:${input.questionId}`, input);
        return map;
      }, new Map<string, SaveAnswerInput>())
      .values()
  );

  if (hasSupabaseEnv()) {
    const answerRows = deduped.map((input) => ({
      attempt_id: input.submissionId,
      question_id: input.questionId,
      selected_choice: input.selectedChoice ?? null,
      answer_text: input.answerText ?? null,
      is_correct: null,
      auto_score: 0,
      manual_score: null,
      final_score: 0,
      time_spent_seconds: input.timeSpentSeconds ?? null,
      flagged: input.flagged ?? false,
      eliminated_choice_ids: input.eliminatedChoiceIds ?? [],
      updated_at: timestamp
    }));
    const { data, error } = await adminClient()
      .from("student_answers")
      .upsert(answerRows, { onConflict: "attempt_id,question_id" })
      .select("*");
    if (error) throw new Error(error.message);

    const frqRows = deduped
      .filter((input) => input.answerText !== undefined && input.answerText !== null)
      .map((input) => ({
        attempt_id: input.submissionId,
        question_id: input.questionId,
        response_text: input.answerText || "",
        updated_at: timestamp
      }));
    if (frqRows.length > 0) {
      const { error: frqError } = await adminClient()
        .from("frq_responses")
        .upsert(frqRows, { onConflict: "attempt_id,question_id" });
      if (frqError) throw new Error(frqError.message);
    }

    return ((data || []) as StudentAnswerRow[]).map(mapStudentAnswerRow);
  }

  await ensureMockStore();
  const saved: Answer[] = [];
  for (const input of deduped) {
    const payload = {
      submission_id: input.submissionId,
      question_id: input.questionId,
      selected_choice: input.selectedChoice ?? null,
      answer_text: input.answerText ?? null,
      flagged: input.flagged ?? false,
      eliminated_choice_ids: input.eliminatedChoiceIds ?? [],
      time_spent_seconds: input.timeSpentSeconds ?? null,
      updated_at: timestamp
    };
    let answer = mockAnswers.find(
      (item) => item.submission_id === input.submissionId && item.question_id === input.questionId
    );
    if (!answer) {
      answer = {
        id: uid("answer"),
        submission_id: input.submissionId,
        question_id: input.questionId,
        answer_text: payload.answer_text,
        selected_choice: payload.selected_choice,
        is_correct: null,
        auto_score: 0,
        manual_score: null,
        final_score: 0,
        time_spent_seconds: payload.time_spent_seconds,
        flagged: payload.flagged,
        eliminated_choice_ids: payload.eliminated_choice_ids,
        created_at: timestamp,
        updated_at: timestamp
      };
      mockAnswers.push(answer);
    } else {
      answer.answer_text = payload.answer_text;
      answer.selected_choice = payload.selected_choice;
      answer.flagged = payload.flagged;
      answer.eliminated_choice_ids = payload.eliminated_choice_ids;
      answer.time_spent_seconds = payload.time_spent_seconds;
      answer.updated_at = timestamp;
    }
    saved.push(answer);
  }
  await saveMockStore();
  return saved;
}

export async function saveAnswer(input: SaveAnswerInput) {
  const [answer] = await saveAnswers([input]);
  return answer;
}

export async function submitSubmission(submissionId: string, timeSpentOverrideSeconds?: number) {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  const exam = await getExamWithQuestions(submission.exam_id, true);
  if (!exam) throw new Error("Exam not found.");
  let answers = await listAnswersForSubmission(submissionId);
  const rowsForSubmission = filterExamQuestionsForSubmission(exam, submission);
  const missingAnswers = rowsForSubmission
    .filter((row) => !answers.some((item) => item.question_id === row.question.id))
    .map((row) => ({
      submissionId,
      questionId: row.question.id,
      selectedChoice: null,
      answerText: null,
      flagged: false
    }));
  if (missingAnswers.length > 0) {
    answers = [...answers, ...(await saveAnswers(missingAnswers))];
  }

  let total = 0;
  let max = 0;
  let hasFrq = false;
  const answerUpdates: Answer[] = [];

  for (const row of rowsForSubmission) {
    const question = row.question;
    const points = row.points_override ?? question.points;
    max += points;
    const answer = answers.find((item) => item.question_id === question.id);
    if (!answer) continue;

    if (question.type === "mcq") {
      const expectedAnswer = canonicalChoiceAnswer(question.correct_answer);
      const correct = Boolean(expectedAnswer) && canonicalChoiceAnswer(answer.selected_choice) === expectedAnswer;
      answer.is_correct = correct;
      answer.auto_score = correct ? points : 0;
      answer.final_score = answer.auto_score;
      total += answer.final_score;
    } else {
      hasFrq = true;
      answer.is_correct = null;
      answer.auto_score = 0;
      answer.manual_score = null;
      answer.final_score = 0;
    }
    answer.updated_at = nowIso();
    answerUpdates.push(answer);
  }

  const submittedAt = nowIso();
  const timeSpent = Math.max(
    0,
    Math.floor(
      timeSpentOverrideSeconds ??
        submission.time_spent_seconds ??
        (new Date(submittedAt).getTime() - new Date(submission.started_at).getTime()) / 1000
    )
  );
  const status: SubmissionStatus = hasFrq ? "submitted" : "graded";

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    await upsertStudentAnswers(answerUpdates);
    const { data, error } = await supabase
      .from("exam_attempts")
      .update({
        status,
        submitted_at: submittedAt,
        total_score: total,
        max_score: max,
        percentage: percentage(total, max),
        time_spent_seconds: timeSpent,
        current_question_index: 0,
        updated_at: submittedAt
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapAttemptRow(data as ExamAttemptRow, submission.sections_progress || []);
  }

  for (const updated of answerUpdates) {
    const index = mockAnswers.findIndex((answer) => answer.id === updated.id);
    if (index >= 0) mockAnswers[index] = { ...updated };
  }
  const submissionIndex = mockSubmissions.findIndex((item) => item.id === submissionId);
  if (submissionIndex >= 0) {
    mockSubmissions[submissionIndex] = {
      ...mockSubmissions[submissionIndex],
      status,
      submitted_at: submittedAt,
      total_score: total,
      max_score: max,
      percentage: percentage(total, max),
      time_spent_seconds: timeSpent,
      current_question_index: 0,
      updated_at: submittedAt
    };
  }
  await saveMockStore();
  return normalizeSubmissionRecord(mockSubmissions[submissionIndex] || submission);
}

export async function submitCurrentSection(submissionId: string, timeSpentOverrideSeconds?: number) {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  const examSummary = await getExamWithQuestionSummaries(submission.exam_id, true);
  if (!examSummary) throw new Error("Exam not found.");
  const sections = getPlayableExamSections(examSummary);
  if (!sections.length) return submitSubmission(submissionId, timeSpentOverrideSeconds);

  const currentIndex = Math.min(Math.max(0, Number(submission.current_section_index || 0)), sections.length - 1);
  const section = sections[currentIndex];
  const sectionExam = await getExamWithSectionQuestions(submission.exam_id, section.section, true);
  if (!sectionExam) throw new Error("Exam section not found.");
  const rowsForSection = sectionExam.exam_questions;
  let answers = await listAnswersForSubmission(submissionId);
  const missingAnswers = rowsForSection
    .filter((row) => !answers.some((item) => item.question_id === row.question.id))
    .map((row) => ({
      submissionId,
      questionId: row.question.id,
      selectedChoice: null,
      answerText: null,
      flagged: false
    }));
  if (missingAnswers.length > 0) {
    answers = [...answers, ...(await saveAnswers(missingAnswers))];
  }
  const submittedAt = nowIso();
  const progress = ensureSectionsProgress(examSummary, submission);
  const timeSpent = Math.max(
    0,
    Math.floor(timeSpentOverrideSeconds ?? progress[currentIndex]?.timeSpentSeconds ?? submission.time_spent_seconds ?? 0)
  );

  let sectionCorrect = 0;
  let sectionTotal = 0;
  const answerUpdates: Answer[] = [];

  for (const row of rowsForSection) {
    const question = row.question;
    const answer = answers.find((item) => item.question_id === question.id);
    if (!answer) continue;

    if (question.type === "mcq") {
      sectionTotal += 1;
      const expectedAnswer = canonicalChoiceAnswer(question.correct_answer);
      const correct = Boolean(expectedAnswer) && canonicalChoiceAnswer(answer.selected_choice) === expectedAnswer;
      answer.is_correct = correct;
      answer.auto_score = correct ? 1 : 0;
      answer.final_score = answer.auto_score;
      if (correct) sectionCorrect += 1;
    } else {
      answer.is_correct = null;
      answer.auto_score = 0;
      answer.manual_score = null;
      answer.final_score = 0;
    }
    answer.updated_at = submittedAt;
    answerUpdates.push(answer);
  }

  progress[currentIndex] = {
    ...progress[currentIndex],
    status: "completed",
    submittedAt,
    timeSpentSeconds: timeSpent,
    currentQuestionIndex: 0,
    scoreCorrect: sectionCorrect,
    scoreTotal: sectionTotal
  };

  const nextIndex = currentIndex + 1;
  const nextSection = sections[nextIndex] || null;
  const shouldBreak =
    nextSection &&
    !submission.break_completed_at &&
    !submission.break_skipped &&
    !isFrqSection(examSummary, section) &&
    isFrqSection(examSummary, nextSection);
  const finalScore = mcqScoreFromProgress(progress);
  let nextStep: Submission["current_step"] = nextSection ? "section" : "completed";
  let status: SubmissionStatus = nextSection ? "in_progress" : "completed";
  let submittedAtForAttempt: string | null = nextSection ? null : submittedAt;
  let breakStartedAt = submission.break_started_at ?? null;
  let breakCompletedAt = submission.break_completed_at ?? null;
  let breakSkipped = Boolean(submission.break_skipped);

  if (shouldBreak) {
    nextStep = "break";
    status = "in_progress";
    submittedAtForAttempt = null;
    breakStartedAt = submittedAt;
    breakCompletedAt = null;
    breakSkipped = false;
  } else if (nextSection) {
    progress[nextIndex] = {
      ...progress[nextIndex],
      status: "in_progress",
      startedAt: progress[nextIndex].startedAt || submittedAt
    };
  }

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    await upsertStudentAnswers(answerUpdates);
    const { data, error } = await supabase
      .from("exam_attempts")
      .update({
        status,
        submitted_at: submittedAtForAttempt,
        total_score: finalScore.correct,
        max_score: finalScore.total,
        percentage: percentage(finalScore.correct, finalScore.total),
        current_step: nextStep,
        current_section_index: nextIndex,
        current_question_index: 0,
        time_spent_seconds: timeSpent,
        break_started_at: breakStartedAt,
        break_completed_at: breakCompletedAt,
        break_skipped: breakSkipped,
        updated_at: submittedAt
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await upsertSectionProgressRows(submissionId, submission.exam_id, progress);
    return mapAttemptRow(data as ExamAttemptRow, progress);
  }

  for (const updated of answerUpdates) {
    const index = mockAnswers.findIndex((answer) => answer.id === updated.id);
    if (index >= 0) mockAnswers[index] = { ...updated };
  }
  const submissionIndex = mockSubmissions.findIndex((item) => item.id === submissionId);
  if (submissionIndex >= 0) {
    mockSubmissions[submissionIndex] = {
      ...mockSubmissions[submissionIndex],
      status,
      submitted_at: submittedAtForAttempt,
      total_score: finalScore.correct,
      max_score: finalScore.total,
      percentage: percentage(finalScore.correct, finalScore.total),
      current_step: nextStep,
      current_section_index: nextIndex,
      current_question_index: 0,
      time_spent_seconds: timeSpent,
      break_started_at: breakStartedAt,
      break_completed_at: breakCompletedAt,
      break_skipped: breakSkipped,
      sections_progress: progress,
      updated_at: submittedAt
    };
  }
  await saveMockStore();
  return normalizeSubmissionRecord(mockSubmissions[submissionIndex] || submission);
}

export async function completeSubmissionBreak(submissionId: string, skipped: boolean) {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  const exam = await getExamWithQuestionSummaries(submission.exam_id, true);
  if (!exam) throw new Error("Exam not found.");
  const progress = ensureSectionsProgress(exam, submission);
  const index = Math.min(Math.max(0, Number(submission.current_section_index || 0)), Math.max(0, progress.length - 1));
  const timestamp = nowIso();
  if (progress[index]) {
    progress[index] = {
      ...progress[index],
      status: "in_progress",
      startedAt: progress[index].startedAt || timestamp
    };
  }

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exam_attempts")
      .update({
        current_step: "section",
        break_completed_at: timestamp,
        break_skipped: skipped,
        updated_at: timestamp
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await upsertSectionProgressRows(submissionId, submission.exam_id, progress);
    return mapAttemptRow(data as ExamAttemptRow, progress);
  }

  await ensureMockStore();
  const storedSubmission = mockSubmissions.find((item) => item.id === submissionId);
  if (!storedSubmission) throw new Error("Submission not found.");
  storedSubmission.current_step = "section";
  storedSubmission.break_completed_at = timestamp;
  storedSubmission.break_skipped = skipped;
  storedSubmission.sections_progress = progress;
  storedSubmission.updated_at = timestamp;
  await saveMockStore();
  return normalizeSubmissionRecord(storedSubmission);
}

export async function getSubmissionDetail(submissionId: string): Promise<SubmissionWithDetails | null> {
  if (hasSupabaseEnv()) {
    const submission = await getSupabaseSubmission(submissionId);
    if (!submission) return null;
    const supabase = adminClient();
    const [{ data: exam }, { data: student }, { data: answers, error: answersError }] = await Promise.all([
      supabase.from("exams").select("*").eq("id", submission.exam_id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", submission.student_id).maybeSingle(),
      supabase.from("student_answers").select("*").eq("attempt_id", submissionId)
    ]);
    if (answersError) throw new Error(answersError.message);
    const answerRows = ((answers || []) as StudentAnswerRow[]).map(mapStudentAnswerRow);
    const questionIds = answerRows.map((answer) => answer.question_id);
    let questions: Question[] = [];
    if (questionIds.length > 0) {
      const { data: questionRows, error: questionError } = await supabase
        .from("questions")
        .select("*")
        .in("id", questionIds);
      if (questionError) throw new Error(questionError.message);
      questions = await attachQuestionImages((questionRows || []) as Question[]);
    }
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const [examWithSections] = exam ? await attachExamSections([exam as Exam]) : [null];
    return {
      ...submission,
      exam: examWithSections,
      student: (student as Profile | null) || null,
      answers: answerRows.map((answer) => ({
        ...answer,
        question: questionById.get(answer.question_id) || null
      }))
    };
  }

  await ensureMockStore();
  const submission = mockSubmissions.find((item) => item.id === submissionId);
  if (!submission) return null;
  return {
    ...normalizeSubmissionRecord(submission),
    exam: mockExams.map(normalizeExamRecord).find((exam) => exam.id === submission.exam_id) || null,
    student: mockProfiles.find((profile) => profile.id === submission.student_id) || null,
    answers: mockAnswers
      .filter((answer) => answer.submission_id === submissionId)
      .map((answer) => ({
        ...answer,
        question: mockQuestions.map(normalizeQuestionRecord).find((question) => question.id === answer.question_id) || null
      }))
  };
}

export async function adminListSubmissions() {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exam_attempts")
      .select("*, exam:exams(*), student:profiles(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data || []) as Array<ExamAttemptRow & { exam: Exam | null; student: Profile | null }>;
    const progress = await fetchSectionProgressForAttempts(rows.map((row) => row.id));
    const exams = await attachExamSections(rows.map((row) => row.exam).filter(Boolean) as Exam[]);
    const examsById = new Map(exams.map((exam) => [exam.id, exam]));
    return rows.map((submission) => ({
      ...mapAttemptRow(submission, progress.get(submission.id) || []),
      exam: examsById.get(submission.exam_id) || null,
      student: submission.student
    }));
  }

  await ensureMockStore();
  return sortByUpdatedDesc(mockSubmissions.map(normalizeSubmissionRecord)).map((submission) => ({
    ...submission,
    exam: mockExams.map(normalizeExamRecord).find((exam) => exam.id === submission.exam_id) || null,
    student: mockProfiles.find((profile) => profile.id === submission.student_id) || null
  }));
}

export async function adminListStudents() {
  const submissions = await adminListSubmissions();

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Profile[]).map((student) => {
      const studentSubs = submissions.filter((submission) => submission.student_id === student.id);
      const graded = studentSubs.filter((submission) => submission.max_score > 0);
      return {
        ...student,
        exam_count: studentSubs.length,
        average_score:
          graded.length === 0
            ? 0
            : Math.round(graded.reduce((sum, item) => sum + item.percentage, 0) / graded.length)
      };
    });
  }

  await ensureMockStore();
  return mockProfiles
    .filter((profile) => profile.role === "student")
    .map((student) => {
      const studentSubs = submissions.filter((submission) => submission.student_id === student.id);
      const graded = studentSubs.filter((submission) => submission.max_score > 0);
      return {
        ...student,
        exam_count: studentSubs.length,
        average_score:
          graded.length === 0
            ? 0
            : Math.round(graded.reduce((sum, item) => sum + item.percentage, 0) / graded.length)
      };
    });
}

export async function getStudentDetail(studentId: string) {
  const students = await adminListStudents();
  const student = students.find((item) => item.id === studentId);
  const submissions = (await adminListSubmissions()).filter((item) => item.student_id === studentId);
  return { student, submissions };
}

export async function getAdminStats() {
  const [students, exams, questions, guides, submissions, accountHealth, pdfImportReviewQueue] = await Promise.all([
    adminListStudents(),
    adminListExams(),
    listQuestions({}),
    adminListReviewGuides({}),
    adminListSubmissions(),
    getAdminAccountHealth(),
    getPdfImportReviewQueue()
  ]);

  return {
    studentsCount: students.length,
    examsCount: exams.length,
    questionsCount: questions.length,
    reviewGuidesCount: guides.length,
    pdfImportReviewQueue,
    recentSubmissions: submissions.slice(0, 5),
    accountHealth
  };
}

export async function getAdminAccountHealth() {
  const seedAdminEmailConfigured = Boolean(process.env.ADMIN_EMAIL);
  const seedStudentEmailConfigured = Boolean(process.env.STUDENT_EMAIL);

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,email,role,created_at")
      .order("created_at", { ascending: false });
    if (profilesError) throw new Error(profilesError.message);

    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const profilesList = (profiles || []) as Pick<Profile, "id" | "email" | "role" | "created_at">[];
    const users = usersData?.users || [];
    const userIds = new Set(users.map((user) => user.id));
    const profileIds = new Set(profilesList.map((profile) => profile.id));
    const adminProfiles = profilesList.filter((profile) => profile.role === "admin");
    const studentProfiles = profilesList.filter((profile) => profile.role === "student");
    const adminProfilesMissingAuth = adminProfiles.filter((profile) => !userIds.has(profile.id));
    const authUsersMissingProfile = users.filter((user) => !profileIds.has(user.id));
    const warnings = [
      adminProfiles.length === 0 ? "No admin profile rows exist in Supabase." : "",
      usersError ? `Unable to inspect Supabase Auth users: ${usersError.message}` : "",
      adminProfilesMissingAuth.length > 0 ? `${adminProfilesMissingAuth.length} admin profile(s) have no matching Supabase Auth user.` : "",
      authUsersMissingProfile.length > 0 ? `${authUsersMissingProfile.length} Supabase Auth user(s) have no profile row.` : "",
      !seedAdminEmailConfigured ? "ADMIN_EMAIL is not set locally; seed scripts cannot create/update the configured admin account." : ""
    ].filter(Boolean);

    return {
      mode: "supabase" as const,
      supabaseConfigured: true,
      profileCount: profilesList.length,
      adminProfileCount: adminProfiles.length,
      studentProfileCount: studentProfiles.length,
      authUserCount: users.length,
      adminProfilesMissingAuthCount: adminProfilesMissingAuth.length,
      authUsersMissingProfileCount: authUsersMissingProfile.length,
      seedAdminEmailConfigured,
      seedStudentEmailConfigured,
      adminEmails: adminProfiles.map((profile) => profile.email).sort(),
      warnings
    };
  }

  await ensureMockStore();
  const adminProfiles = mockProfiles.filter((profile) => profile.role === "admin");
  const studentProfiles = mockProfiles.filter((profile) => profile.role === "student");
  const warnings = [
    adminProfiles.length === 0 ? "No mock admin profile exists." : "",
    !seedAdminEmailConfigured ? "ADMIN_EMAIL is not set locally; mock fallback uses bundled demo/default accounts." : ""
  ].filter(Boolean);

  return {
    mode: "mock" as const,
    supabaseConfigured: false,
    profileCount: mockProfiles.length,
    adminProfileCount: adminProfiles.length,
    studentProfileCount: studentProfiles.length,
    authUserCount: mockProfiles.length,
    adminProfilesMissingAuthCount: 0,
    authUsersMissingProfileCount: 0,
    seedAdminEmailConfigured,
    seedStudentEmailConfigured,
    adminEmails: adminProfiles.map((profile) => profile.email).sort(),
    warnings
  };
}

export async function saveMediaFile(input: Omit<MediaFile, "id" | "created_at">) {
  const payload: MediaFile = {
    ...input,
    id: uid("media"),
    created_at: nowIso()
  };

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("media_files").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return data as MediaFile;
  }

  await ensureMockStore();
  mockMediaFiles.unshift(payload);
  await saveMockStore();
  return payload;
}

export async function listMediaFiles() {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("media_files")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as MediaFile[];
  }

  await ensureMockStore();
  return [...mockMediaFiles];
}

export async function deleteMediaFile(mediaId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("media_files").delete().eq("id", mediaId);
    if (error) throw new Error(error.message);
    return;
  }

  await ensureMockStore();
  const index = mockMediaFiles.findIndex((media) => media.id === mediaId);
  if (index >= 0) mockMediaFiles.splice(index, 1);
  await saveMockStore();
}

export async function linkImageToQuestion(questionId: string, imageUrl: string) {
  const question = await getQuestion(questionId);
  if (!question) throw new Error("Question not found.");
  const images = [
    ...(question.question_images || []),
    { id: uid("img"), url: imageUrl, caption: "Uploaded image" }
  ];
  await upsertQuestion({ ...question, question_images: images }, question.created_by || mockProfiles[0].id);
}

export async function linkImageToChoice(questionId: string, choiceId: string, imageUrl: string) {
  const question = await getQuestion(questionId);
  if (!question) throw new Error("Question not found.");
  const choices = question.choices.map((choice) =>
    choice.id === choiceId ? { ...choice, image_url: imageUrl } : choice
  );
  await upsertQuestion({ ...question, choices }, question.created_by || mockProfiles[0].id);
}

export async function savePdfUpload(input: Omit<PdfUpload, "id" | "created_at" | "updated_at" | "status">) {
  const timestamp = nowIso();
  const payload: PdfUpload = {
    ...input,
    id: uid("pdf"),
    status: "uploaded",
    created_at: timestamp,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("pdf_uploads").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return data as PdfUpload;
  }

  await ensureMockStore();
  mockPdfUploads.unshift(payload);
  await saveMockStore();
  return payload;
}

export async function listPdfUploads() {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("pdf_uploads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as PdfUpload[];
  }

  await ensureMockStore();
  return [...mockPdfUploads];
}

export async function getPdfUpload(pdfId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("pdf_uploads").select("*").eq("id", pdfId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as PdfUpload | null) || null;
  }

  await ensureMockStore();
  return mockPdfUploads.find((item) => item.id === pdfId) || null;
}

export async function updatePdfMetadata(pdfId: string, metadata: Pick<PdfUpload, "subject" | "unit" | "topic">) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient()
      .from("pdf_uploads")
      .update({ ...metadata, updated_at: nowIso() })
      .eq("id", pdfId);
    if (error) throw new Error(error.message);
    return;
  }

  await ensureMockStore();
  const pdf = mockPdfUploads.find((item) => item.id === pdfId);
  if (pdf) {
    pdf.subject = metadata.subject;
    pdf.unit = metadata.unit;
    pdf.topic = metadata.topic;
    pdf.updated_at = nowIso();
    await saveMockStore();
  }
}

export interface PdfImportAnalysisInput {
  pdfUploadId: string;
  status: PdfImportJob["status"];
  parserVersion: string;
  ocrProvider: string;
  pageCount: number;
  warnings: string[];
  errorMessage?: string | null;
  pages: Array<
    Omit<PdfImportPage, "id" | "job_id" | "pdf_upload_id" | "created_at" | "updated_at">
  >;
  draftQuestions: Array<
    Omit<
      PdfImportDraftQuestion,
      "id" | "job_id" | "pdf_upload_id" | "review_status" | "saved_question_id" | "created_at" | "updated_at"
    >
  >;
  draftAssets?: Array<
    Omit<PdfImportDraftAsset, "id" | "job_id" | "pdf_upload_id" | "draft_question_id" | "created_at" | "updated_at"> & {
      draft_question_index?: number | null;
    }
  >;
}

const PDF_IMPORT_SCHEMA_SETUP_MESSAGE =
  "PDF import database tables are not installed. Apply Supabase migrations through 009_remote_pdf_worker.sql before analyzing PDFs in Supabase mode.";

const PDF_IMPORT_SCHEMA_CHECKS = [
  {
    table: "pdf_uploads",
    columns: "id,file_name,file_url,status,storage_provider,storage_bucket,storage_object_key,mime_type,size_bytes,upload_status"
  },
  {
    table: "pdf_import_jobs",
    columns: "id,pdf_upload_id,status,parser_version,ocr_provider,page_count,extracted_page_count,draft_question_count,warnings,error_message"
  },
  {
    table: "pdf_import_pages",
    columns: "id,job_id,pdf_upload_id,page_number,extraction_method,ocr_status,text_extracted,ocr_text,page_image_url,confidence,warnings,raw_blocks"
  },
  {
    table: "pdf_import_draft_questions",
    columns: "id,job_id,pdf_upload_id,question_number,source_page_start,source_page_end,type,question_text,choices,correct_answer,explanation,scoring_notes,frq_parts,question_images,confidence,warnings,review_status,saved_question_id"
  },
  {
    table: "pdf_import_draft_assets",
    columns: "id,job_id,pdf_upload_id,draft_question_id,page_number,asset_type,image_url,bbox,keep_for_question,status,notes"
  },
  {
    table: "pdf_import_batches",
    columns: "id,job_id,page_numbers,status,attempt_count,next_attempt_at,lease_owner,lease_expires_at,error_message"
  }
] as const;

function isMissingPdfImportSchemaError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const text = [error?.code, error?.message, error?.details].filter(Boolean).join(" ").toLowerCase();
  return (
    text.includes("pdf_import_") &&
    (
      text.includes("schema cache") ||
      text.includes("does not exist") ||
      text.includes("could not find the table") ||
      text.includes("could not find the")
    )
  );
}

export function isPdfImportSchemaSetupError(error: unknown) {
  if (error instanceof Error && error.message === PDF_IMPORT_SCHEMA_SETUP_MESSAGE) return true;
  if (typeof error === "string" && error === PDF_IMPORT_SCHEMA_SETUP_MESSAGE) return true;
  if (!error || typeof error !== "object") return false;
  return isMissingPdfImportSchemaError(error as { code?: string; message?: string; details?: string });
}

function checkPdfImportSchemaTable(table: string, columns: string) {
  return adminClient().from(table).select(columns, { head: true, count: "exact" });
}

export async function getPdfImportSchemaStatus() {
  if (!hasSupabaseEnv()) {
    return { available: true, message: null as string | null };
  }

  const checks = await Promise.all(
    PDF_IMPORT_SCHEMA_CHECKS.map(({ table, columns }) =>
      checkPdfImportSchemaTable(table, columns)
    )
  );
  for (const { error } of checks) {
    if (!error) continue;
    if (isMissingPdfImportSchemaError(error)) {
      return { available: false, message: PDF_IMPORT_SCHEMA_SETUP_MESSAGE };
    }
    throw new Error(error.message);
  }
  return { available: true, message: null as string | null };
}

function pdfImportExtractedPageCount(pages: PdfImportAnalysisInput["pages"]) {
  return pages.filter((page) =>
    page.extraction_method === "text"
      ? page.text_extracted.trim()
      : page.extraction_method === "ocr"
        ? page.ocr_text.trim()
        : false
  ).length;
}

function buildPdfImportRows(input: PdfImportAnalysisInput, jobId: string, timestamp: string) {
  const pages: PdfImportPage[] = input.pages.map((page) => ({
    ...page,
    id: uid("pdf_page"),
    job_id: jobId,
    pdf_upload_id: input.pdfUploadId,
    created_at: timestamp,
    updated_at: timestamp
  }));

  const draftQuestions: PdfImportDraftQuestion[] = input.draftQuestions.map((draft) => ({
    ...draft,
    id: uid("pdf_draft"),
    job_id: jobId,
    pdf_upload_id: input.pdfUploadId,
    review_status: "pending",
    saved_question_id: null,
    created_at: timestamp,
    updated_at: timestamp
  }));

  const draftAssets: PdfImportDraftAsset[] = (input.draftAssets || []).map((asset) => {
    const rawDraftIndex = asset.draft_question_index;
    const draftIndex = rawDraftIndex === null || rawDraftIndex === undefined ? null : Number(rawDraftIndex);
    const { draft_question_index: _draftQuestionIndex, ...assetPayload } = asset;
    if (draftIndex !== null && (!Number.isInteger(draftIndex) || !draftQuestions[draftIndex])) {
      throw new Error(`PDF import draft asset references a missing draft question index: ${rawDraftIndex}`);
    }
    return {
      ...assetPayload,
      id: uid("pdf_asset"),
      job_id: jobId,
      pdf_upload_id: input.pdfUploadId,
      draft_question_id: draftIndex !== null && Number.isInteger(draftIndex) ? draftQuestions[draftIndex]?.id || null : null,
      created_at: timestamp,
      updated_at: timestamp
    };
  });

  return { pages, draftQuestions, draftAssets };
}

export async function createPdfImportJob(pdfUploadId: string, adminId: string, parserVersion: string) {
  const timestamp = nowIso();
  const job: PdfImportJob = {
    id: uid("pdf_job"),
    pdf_upload_id: pdfUploadId,
    status: "queued",
    parser_version: parserVersion,
    ocr_provider: "pending",
    page_count: 0,
    extracted_page_count: 0,
    draft_question_count: 0,
    warnings: ["PDF import job queued. The OCR worker has not claimed it yet."],
    error_message: null,
    created_by: adminId,
    created_at: timestamp,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("pdf_import_jobs").insert(job).select("*").single();
    if (error) throw new Error(isMissingPdfImportSchemaError(error) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : error.message);
    await adminClient().from("pdf_uploads").update({ status: "uploaded", updated_at: timestamp }).eq("id", pdfUploadId);
    await logAdminEdit(adminId, "pdf_import_job", job.id, "create-processing", {
      pdf_upload_id: pdfUploadId,
      status: "queued"
    });
    return data as PdfImportJob;
  }

  await ensureMockStore();
  const pdf = mockPdfUploads.find((item) => item.id === pdfUploadId);
  if (!pdf) throw new Error("PDF upload not found for import analysis.");
  mockPdfImportJobs.unshift(job);
  pdf.status = "uploaded";
  pdf.updated_at = timestamp;
  await saveMockStore();
  return job;
}

export async function updatePdfUploadStorage(
  pdfId: string,
  updates: Partial<Pick<PdfUpload, "file_url" | "status" | "storage_provider" | "storage_bucket" | "storage_object_key" | "mime_type" | "size_bytes" | "upload_status">>
) {
  const payload = { ...updates, updated_at: nowIso() };
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("pdf_uploads").update(payload).eq("id", pdfId).select("*").single();
    if (error) throw new Error(error.message);
    return data as PdfUpload;
  }
  await ensureMockStore();
  const pdf = mockPdfUploads.find((item) => item.id === pdfId);
  if (!pdf) throw new Error("PDF upload not found.");
  Object.assign(pdf, payload);
  await saveMockStore();
  return pdf;
}

export async function requestPdfImportCancellation(jobId: string) {
  if (!hasSupabaseEnv()) throw new Error("Remote worker cancellation requires Supabase.");
  const timestamp = nowIso();
  const client = adminClient();
  const { data: job, error: readError } = await client.from("pdf_import_jobs").select("status").eq("id", jobId).single();
  if (readError) throw new Error(readError.message);
  const queued = job.status === "queued";
  const { error } = await client.from("pdf_import_jobs").update({
    cancel_requested_at: timestamp,
    ...(queued ? { status: "cancelled", phase: "cancelled", lease_owner: null, lease_expires_at: null } : {}),
    updated_at: timestamp
  }).eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function retryPdfImportJob(jobId: string) {
  if (!hasSupabaseEnv()) throw new Error("Remote worker retry requires Supabase.");
  const timestamp = nowIso();
  const { error } = await adminClient().from("pdf_import_jobs").update({
    status: "queued",
    phase: "queued",
    error_message: null,
    cancel_requested_at: null,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: timestamp
  }).eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function deletePdfUploadRecord(pdfId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("pdf_uploads").delete().eq("id", pdfId);
    if (error) throw new Error(error.message);
    return;
  }
  await ensureMockStore();
  const index = mockPdfUploads.findIndex((item) => item.id === pdfId);
  if (index >= 0) mockPdfUploads.splice(index, 1);
  await saveMockStore();
}

export async function savePdfImportAnalysis(input: PdfImportAnalysisInput, adminId: string) {
  const timestamp = nowIso();
  const job: PdfImportJob = {
    id: uid("pdf_job"),
    pdf_upload_id: input.pdfUploadId,
    status: input.status,
    parser_version: input.parserVersion,
    ocr_provider: input.ocrProvider,
    page_count: input.pageCount,
    extracted_page_count: pdfImportExtractedPageCount(input.pages),
    draft_question_count: input.draftQuestions.length,
    warnings: input.warnings,
    error_message: input.errorMessage || null,
    created_by: adminId,
    created_at: timestamp,
    updated_at: timestamp
  };

  const { pages, draftQuestions, draftAssets } = buildPdfImportRows(input, job.id, timestamp);

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data, error } = await supabase.from("pdf_import_jobs").insert(job).select("*").single();
    if (error) throw new Error(isMissingPdfImportSchemaError(error) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : error.message);
    if (pages.length > 0) {
      const { error: pageError } = await supabase.from("pdf_import_pages").insert(pages);
      if (pageError) throw new Error(isMissingPdfImportSchemaError(pageError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : pageError.message);
    }
    if (draftQuestions.length > 0) {
      const { error: draftError } = await supabase.from("pdf_import_draft_questions").insert(draftQuestions);
      if (draftError) throw new Error(isMissingPdfImportSchemaError(draftError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : draftError.message);
    }
    if (draftAssets.length > 0) {
      const { error: assetError } = await supabase.from("pdf_import_draft_assets").insert(draftAssets);
      if (assetError) throw new Error(isMissingPdfImportSchemaError(assetError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : assetError.message);
    }
    await supabase
      .from("pdf_uploads")
      .update({ status: input.status === "failed" ? "failed" : "parsed", updated_at: timestamp })
      .eq("id", input.pdfUploadId);
    await logAdminEdit(adminId, "pdf_import_job", job.id, "create", {
      pdf_upload_id: input.pdfUploadId,
      status: input.status,
      draft_question_count: draftQuestions.length
    });
    return data as PdfImportJob;
  }

  await ensureMockStore();
  const pdf = mockPdfUploads.find((item) => item.id === input.pdfUploadId);
  if (!pdf) throw new Error("PDF upload not found for import analysis.");
  mockPdfImportJobs.unshift(job);
  mockPdfImportPages.push(...pages);
  mockPdfImportDraftQuestions.push(...draftQuestions);
  mockPdfImportDraftAssets.push(...draftAssets);
  pdf.status = input.status === "failed" ? "failed" : "parsed";
  pdf.updated_at = timestamp;
  await saveMockStore();
  return job;
}

export async function completePdfImportJob(jobId: string, input: PdfImportAnalysisInput, adminId: string) {
  const timestamp = nowIso();
  const updates = {
    status: input.status,
    parser_version: input.parserVersion,
    ocr_provider: input.ocrProvider,
    page_count: input.pageCount,
    extracted_page_count: pdfImportExtractedPageCount(input.pages),
    draft_question_count: input.draftQuestions.length,
    warnings: input.warnings,
    error_message: input.errorMessage || null,
    updated_at: timestamp
  };
  const { pages, draftQuestions, draftAssets } = buildPdfImportRows(input, jobId, timestamp);

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: existingJob, error: existingError } = await supabase
      .from("pdf_import_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (existingError) throw new Error(isMissingPdfImportSchemaError(existingError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : existingError.message);
    if (!existingJob) throw new Error("PDF import job not found.");
    if ((existingJob as PdfImportJob).pdf_upload_id !== input.pdfUploadId) throw new Error("PDF import job does not match the PDF upload.");

    await supabase.from("pdf_import_draft_assets").delete().eq("job_id", jobId);
    await supabase.from("pdf_import_draft_questions").delete().eq("job_id", jobId);
    await supabase.from("pdf_import_pages").delete().eq("job_id", jobId);
    const { data, error } = await supabase.from("pdf_import_jobs").update(updates).eq("id", jobId).select("*").single();
    if (error) throw new Error(isMissingPdfImportSchemaError(error) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : error.message);
    if (pages.length > 0) {
      const { error: pageError } = await supabase.from("pdf_import_pages").insert(pages);
      if (pageError) throw new Error(isMissingPdfImportSchemaError(pageError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : pageError.message);
    }
    if (draftQuestions.length > 0) {
      const { error: draftError } = await supabase.from("pdf_import_draft_questions").insert(draftQuestions);
      if (draftError) throw new Error(isMissingPdfImportSchemaError(draftError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : draftError.message);
    }
    if (draftAssets.length > 0) {
      const { error: assetError } = await supabase.from("pdf_import_draft_assets").insert(draftAssets);
      if (assetError) throw new Error(isMissingPdfImportSchemaError(assetError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : assetError.message);
    }
    await supabase
      .from("pdf_uploads")
      .update({ status: input.status === "failed" ? "failed" : "parsed", updated_at: timestamp })
      .eq("id", input.pdfUploadId);
    await logAdminEdit(adminId, "pdf_import_job", jobId, "process", {
      pdf_upload_id: input.pdfUploadId,
      status: input.status,
      draft_question_count: draftQuestions.length
    });
    return data as PdfImportJob;
  }

  await ensureMockStore();
  const job = mockPdfImportJobs.find((item) => item.id === jobId);
  if (!job) throw new Error("PDF import job not found.");
  if (job.pdf_upload_id !== input.pdfUploadId) throw new Error("PDF import job does not match the PDF upload.");
  const pdf = mockPdfUploads.find((item) => item.id === input.pdfUploadId);
  if (!pdf) throw new Error("PDF upload not found for import analysis.");
  Object.assign(job, updates);
  for (let index = mockPdfImportDraftAssets.length - 1; index >= 0; index -= 1) {
    if (mockPdfImportDraftAssets[index].job_id === jobId) mockPdfImportDraftAssets.splice(index, 1);
  }
  for (let index = mockPdfImportDraftQuestions.length - 1; index >= 0; index -= 1) {
    if (mockPdfImportDraftQuestions[index].job_id === jobId) mockPdfImportDraftQuestions.splice(index, 1);
  }
  for (let index = mockPdfImportPages.length - 1; index >= 0; index -= 1) {
    if (mockPdfImportPages[index].job_id === jobId) mockPdfImportPages.splice(index, 1);
  }
  mockPdfImportPages.push(...pages);
  mockPdfImportDraftQuestions.push(...draftQuestions);
  mockPdfImportDraftAssets.push(...draftAssets);
  pdf.status = input.status === "failed" ? "failed" : "parsed";
  pdf.updated_at = timestamp;
  await saveMockStore();
  return job;
}

export async function listPdfImportJobs(pdfUploadId?: string) {
  if (hasSupabaseEnv()) {
    let query = adminClient()
      .from("pdf_import_jobs")
      .select("*, pdf_upload:pdf_uploads(*)")
      .order("created_at", { ascending: false });
    if (pdfUploadId) query = query.eq("pdf_upload_id", pdfUploadId);
    const { data, error } = await query;
    if (isMissingPdfImportSchemaError(error)) return [];
    if (error) throw new Error(error.message);
    return (data || []) as PdfImportJob[];
  }

  await ensureMockStore();
  const uploadsById = new Map(mockPdfUploads.map((pdf) => [pdf.id, pdf]));
  return mockPdfImportJobs
    .filter((job) => !pdfUploadId || job.pdf_upload_id === pdfUploadId)
    .map((job) => ({ ...job, pdf_upload: uploadsById.get(job.pdf_upload_id) || null }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getPdfImportReviewQueue(): Promise<PdfImportReviewQueue> {
  const activeStatuses: PdfImportJob["status"][] = ["queued", "triaging", "processing", "finalizing"];
  const reviewStatuses: PdfImportJob["status"][] = [...activeStatuses, "needs_review", "failed"];
  const jobs = (await listPdfImportJobs())
    .filter((job) => reviewStatuses.includes(job.status))
    .slice(0, 8);
  const countsByJob = new Map<string, { pending: number; saved: number; rejected: number }>();

  if (jobs.length > 0) {
    if (hasSupabaseEnv()) {
      const { data, error } = await adminClient()
        .from("pdf_import_draft_questions")
        .select("job_id,review_status")
        .in("job_id", jobs.map((job) => job.id));
      if (isMissingPdfImportSchemaError(error)) {
        return { items: [], pending_draft_count: 0, processing_job_count: 0, failed_job_count: 0 };
      }
      if (error) throw new Error(error.message);
      for (const draft of data || []) {
        const counts = countsByJob.get(draft.job_id) || { pending: 0, saved: 0, rejected: 0 };
        if (draft.review_status === "pending") counts.pending += 1;
        if (draft.review_status === "saved") counts.saved += 1;
        if (draft.review_status === "rejected") counts.rejected += 1;
        countsByJob.set(draft.job_id, counts);
      }
    } else {
      await ensureMockStore();
      for (const draft of mockPdfImportDraftQuestions.filter((item) => jobs.some((job) => job.id === item.job_id))) {
        const counts = countsByJob.get(draft.job_id) || { pending: 0, saved: 0, rejected: 0 };
        if (draft.review_status === "pending") counts.pending += 1;
        if (draft.review_status === "saved") counts.saved += 1;
        if (draft.review_status === "rejected") counts.rejected += 1;
        countsByJob.set(draft.job_id, counts);
      }
    }
  }

  const items = jobs
    .map((job) => {
      const counts = countsByJob.get(job.id) || { pending: 0, saved: 0, rejected: 0 };
      return {
        ...job,
        pending_draft_count: counts.pending,
        saved_draft_count: counts.saved,
        rejected_draft_count: counts.rejected
      };
    })
    .filter((job) => job.status === "processing" || job.status === "failed" || job.pending_draft_count > 0);

  return {
    items,
    pending_draft_count: items.reduce((sum, job) => sum + job.pending_draft_count, 0),
    processing_job_count: items.filter((job) => activeStatuses.includes(job.status)).length,
    failed_job_count: items.filter((job) => job.status === "failed").length
  };
}

export async function getPdfImportJobDetails(jobId: string): Promise<PdfImportJobDetails | null> {
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: job, error } = await supabase
      .from("pdf_import_jobs")
      .select("*, pdf_upload:pdf_uploads(*)")
      .eq("id", jobId)
      .maybeSingle();
    if (isMissingPdfImportSchemaError(error)) return null;
    if (error) throw new Error(error.message);
    if (!job) return null;
    const [{ data: pages, error: pageError }, { data: drafts, error: draftError }, { data: assets, error: assetError }, { data: batches, error: batchError }] =
      await Promise.all([
        supabase.from("pdf_import_pages").select("*").eq("job_id", jobId).order("page_number", { ascending: true }),
        supabase
          .from("pdf_import_draft_questions")
          .select("*")
          .eq("job_id", jobId)
          .order("question_number", { ascending: true, nullsFirst: false }),
        supabase.from("pdf_import_draft_assets").select("*").eq("job_id", jobId).order("page_number", { ascending: true }),
        supabase.from("pdf_import_batches").select("*").eq("job_id", jobId).order("created_at", { ascending: true })
      ]);
    if (pageError) throw new Error(isMissingPdfImportSchemaError(pageError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : pageError.message);
    if (draftError) throw new Error(isMissingPdfImportSchemaError(draftError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : draftError.message);
    if (assetError) throw new Error(isMissingPdfImportSchemaError(assetError) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : assetError.message);
    if (batchError && !isMissingPdfImportSchemaError(batchError)) throw new Error(batchError.message);
    return {
      ...(job as PdfImportJob),
      pages: (pages || []) as PdfImportPage[],
      draft_questions: (drafts || []) as PdfImportDraftQuestion[],
      draft_assets: (assets || []) as PdfImportDraftAsset[],
      batches: (batches || []) as PdfImportBatch[]
    };
  }

  await ensureMockStore();
  const job = mockPdfImportJobs.find((item) => item.id === jobId);
  if (!job) return null;
  return {
    ...job,
    pdf_upload: mockPdfUploads.find((pdf) => pdf.id === job.pdf_upload_id) || null,
    pages: mockPdfImportPages
      .filter((page) => page.job_id === jobId)
      .sort((a, b) => a.page_number - b.page_number),
    draft_questions: mockPdfImportDraftQuestions
      .filter((draft) => draft.job_id === jobId)
      .sort((a, b) => (a.question_number || 0) - (b.question_number || 0)),
    draft_assets: mockPdfImportDraftAssets
      .filter((asset) => asset.job_id === jobId)
      .sort((a, b) => a.page_number - b.page_number)
  };
}

export async function updatePdfImportDraftStatus(
  draftId: string,
  status: PdfDraftReviewStatus,
  savedQuestionId: string | null,
  adminId: string
) {
  const timestamp = nowIso();
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("pdf_import_draft_questions")
      .update({ review_status: status, saved_question_id: savedQuestionId, updated_at: timestamp })
      .eq("id", draftId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(isMissingPdfImportSchemaError(error) ? PDF_IMPORT_SCHEMA_SETUP_MESSAGE : error.message);
    if (!data) throw new Error("PDF import draft question not found.");
    await logAdminEdit(adminId, "pdf_import_draft_question", draftId, status, {
      saved_question_id: savedQuestionId
    });
    return;
  }

  await ensureMockStore();
  const draft = mockPdfImportDraftQuestions.find((item) => item.id === draftId);
  if (!draft) throw new Error("PDF import draft question not found.");
  draft.review_status = status;
  draft.saved_question_id = savedQuestionId;
  draft.updated_at = timestamp;
  await saveMockStore();
}

export async function listPublishedReviewGuides(filters: {
  subject?: string;
  unit?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard" | "";
  search?: string;
}) {
  const all = await adminListReviewGuides({ ...filters, status: "published" });
  return all;
}

export async function adminListReviewGuides(filters: {
  subject?: string;
  unit?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard" | "";
  status?: "draft" | "published" | "";
  search?: string;
}) {
  if (hasSupabaseEnv()) {
    let query = adminClient().from("review_guides").select("*").order("updated_at", { ascending: false });
    if (filters.subject) query = query.eq("subject", filters.subject);
    if (filters.unit) query = query.eq("unit", filters.unit);
    if (filters.topic) query = query.ilike("topic", `%${filters.topic}%`);
    if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) query = query.ilike("title", `%${filters.search}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as ReviewGuide[];
  }

  await ensureMockStore();
  const search = normalizeText(filters.search);
  return sortByUpdatedDesc(
    mockReviewGuides.filter((guide) => {
      if (filters.subject && guide.subject !== filters.subject) return false;
      if (filters.unit && guide.unit !== filters.unit) return false;
      if (filters.topic && !normalizeText(guide.topic).includes(normalizeText(filters.topic))) return false;
      if (filters.difficulty && guide.difficulty !== filters.difficulty) return false;
      if (filters.status && guide.status !== filters.status) return false;
      if (search && !normalizeText(`${guide.title} ${guide.description}`).includes(search)) return false;
      return true;
    })
  );
}

export async function getReviewGuideBySlug(slug: string): Promise<ReviewGuideWithQuestions | null> {
  const guides = await adminListReviewGuides({ status: "published" });
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) return null;
  return attachRelatedQuestions(guide);
}

export async function getReviewGuideById(id: string): Promise<ReviewGuideWithQuestions | null> {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("review_guides").select("*").eq("id", id).single();
    if (error || !data) return null;
    return attachRelatedQuestions(data as ReviewGuide);
  }

  await ensureMockStore();
  const guide = mockReviewGuides.find((item) => item.id === id);
  if (!guide) return null;
  return attachRelatedQuestions(guide);
}

async function attachRelatedQuestions(guide: ReviewGuide): Promise<ReviewGuideWithQuestions> {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("review_guide_questions")
      .select("*, question:questions(*)")
      .eq("review_guide_id", guide.id)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      ...guide,
      related_questions: ((data || []) as Array<{ question: Question }>).map((row) => normalizeQuestionRecord(row.question)).filter(Boolean)
    };
  }

  await ensureMockStore();
  const related = mockReviewGuideQuestions
    .filter((row) => row.review_guide_id === guide.id)
    .sort((a, b) => a.order_index - b.order_index)
    .map((row) => mockQuestions.map(normalizeQuestionRecord).find((question) => question.id === row.question_id))
    .filter(Boolean) as Question[];
  return { ...guide, related_questions: related };
}

export async function upsertReviewGuide(
  input: Partial<ReviewGuide> & {
    question_ids?: string[];
  },
  adminId: string
) {
  const timestamp = nowIso();
  const guide: ReviewGuide = {
    id: input.id || uid("guide"),
    title: input.title || "Untitled Guide",
    slug: input.slug || slugify(input.title || "untitled-guide"),
    description: input.description || "",
    subject: input.subject || "AP Physics 1",
    unit: input.unit || "",
    topic: input.topic || "",
    difficulty: input.difficulty || "medium",
    content_markdown: input.content_markdown || "# Untitled Guide",
    status: input.status || "draft",
    cover_image_url: input.cover_image_url || null,
    estimated_reading_time_minutes: Number(input.estimated_reading_time_minutes || 8),
    created_by: input.created_by || adminId,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
    published_at: input.status === "published" ? input.published_at || timestamp : null
  };

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data, error } = await supabase.from("review_guides").upsert(guide).select("*").single();
    if (error) throw new Error(error.message);
    if (input.question_ids) {
      await supabase.from("review_guide_questions").delete().eq("review_guide_id", guide.id);
      if (input.question_ids.length > 0) {
        await supabase.from("review_guide_questions").insert(
          input.question_ids.map((questionId, index) => ({
            review_guide_id: guide.id,
            question_id: questionId,
            order_index: index + 1
          }))
        );
      }
    }
    return data as ReviewGuide;
  }

  const index = mockReviewGuides.findIndex((item) => item.id === guide.id);
  if (index >= 0) mockReviewGuides[index] = { ...mockReviewGuides[index], ...guide };
  else mockReviewGuides.push(guide);

  if (input.question_ids) {
    for (let i = mockReviewGuideQuestions.length - 1; i >= 0; i -= 1) {
      if (mockReviewGuideQuestions[i].review_guide_id === guide.id) {
        mockReviewGuideQuestions.splice(i, 1);
      }
    }
    input.question_ids.forEach((questionId, index) => {
      mockReviewGuideQuestions.push({
        id: uid("guide_question"),
        review_guide_id: guide.id,
        question_id: questionId,
        order_index: index + 1
      });
    });
  }
  await saveMockStore();
  return guide;
}

export async function deleteReviewGuide(guideId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("review_guides").delete().eq("id", guideId);
    if (error) throw new Error(error.message);
    return;
  }

  await ensureMockStore();
  const index = mockReviewGuides.findIndex((guide) => guide.id === guideId);
  if (index >= 0) mockReviewGuides.splice(index, 1);
  await saveMockStore();
}

export function getExamPointRows(exam: ExamWithQuestions): ExamQuestionWithQuestion[] {
  return exam.exam_questions.map((row) => ({
    ...row,
    question: {
      ...row.question,
      points: row.points_override ?? row.question.points
    }
  }));
}
