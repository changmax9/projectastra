import { createSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";
import { inferSubjectFromCourse, normalizeExamType, normalizeSection, parseQuestionNumberFromTags, parseYearFromText } from "@/lib/ap-taxonomy";
import {
  mockAnswers,
  mockExamQuestions,
  mockExams,
  mockMediaFiles,
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
  PdfUpload,
  Profile,
  Question,
  QuestionFilters,
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

export async function listPublishedExams() {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("exams")
      .select("*")
      .eq("status", "published")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Exam[]).map(normalizeExamRecord);
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
    return ((data || []) as Exam[]).map(normalizeExamRecord);
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

    return {
      ...normalizeExamRecord(exam as Exam),
      exam_questions: ((rows || []) as Array<ExamQuestion & { question: Question }>).map((row) => ({
        ...row,
        question: normalizeQuestionRecord(row.question)
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

export async function listQuestions(filters: QuestionFilters = {}) {
  if (hasSupabaseEnv()) {
    let query = adminClient().from("questions").select("*").order("updated_at", { ascending: false });
    if (filters.examName) query = query.ilike("exam_name", `%${filters.examName}%`);
    if (filters.subject) query = query.eq("subject", filters.subject);
    if (filters.course) query = query.eq("course", filters.course);
    if (filters.unit) query = query.eq("unit", filters.unit);
    if (filters.topic) query = query.ilike("topic", `%${filters.topic}%`);
    if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
    if (filters.type) query = query.eq("type", filters.type);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.year) query = query.eq("year", Number(filters.year));
    if (filters.section) query = query.eq("section", filters.section);
    if (filters.examType) query = query.eq("exam_type", filters.examType);
    if (filters.tag) query = query.contains("tags", [filters.tag]);
    if (filters.search) query = query.ilike("question_text", `%${filters.search}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data || []) as Question[]).map(normalizeQuestionRecord);
  }

  await ensureMockStore();
  return sortByUpdatedDesc(filterQuestions(mockQuestions.map(normalizeQuestionRecord), filters));
}

export async function getQuestion(questionId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient().from("questions").select("*").eq("id", questionId).single();
    if (error || !data) return null;
    return normalizeQuestionRecord(data as Question);
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
    const { data, error } = await adminClient().from("questions").upsert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return normalizeQuestionRecord(data as Question);
  }

  const existingIndex = mockQuestions.findIndex((question) => question.id === payload.id);
  if (existingIndex >= 0) {
    mockQuestions[existingIndex] = { ...mockQuestions[existingIndex], ...payload };
  } else {
    mockQuestions.push(payload);
  }
  await saveMockStore();
  return payload;
}

export async function deleteQuestion(questionId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("questions").delete().eq("id", questionId);
    if (error) throw new Error(error.message);
    return;
  }

  const index = mockQuestions.findIndex((question) => question.id === questionId);
  if (index >= 0) mockQuestions.splice(index, 1);
  for (let i = mockExamQuestions.length - 1; i >= 0; i -= 1) {
    if (mockExamQuestions[i].question_id === questionId) mockExamQuestions.splice(i, 1);
  }
  await saveMockStore();
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
  return { exam, questions: created };
}

export async function upsertExam(input: Partial<Exam>, adminId: string) {
  const timestamp = nowIso();
  if (!hasSupabaseEnv()) await ensureMockStore();
  const existingExam = !hasSupabaseEnv() && input.id ? mockExams.find((item) => item.id === input.id) : null;
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
    sections: normalizeExamSections(input.sections ?? existingExam?.sections),
    status: (input.status as ExamStatus) || "draft",
    created_by: input.created_by || adminId,
    created_at: input.created_at || timestamp,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const { sections, ...supabaseExam } = exam;
    const { data, error } = await adminClient().from("exams").upsert(supabaseExam).select("*").single();
    if (error) throw new Error(error.message);
    return normalizeExamRecord({ ...(data as Exam), sections });
  }

  const index = mockExams.findIndex((item) => item.id === exam.id);
  if (index >= 0) mockExams[index] = { ...mockExams[index], ...exam };
  else mockExams.push(exam);
  await saveMockStore();
  return exam;
}

export async function deleteExam(examId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("exams").delete().eq("id", examId);
    if (error) throw new Error(error.message);
    return;
  }

  const index = mockExams.findIndex((exam) => exam.id === examId);
  if (index >= 0) mockExams.splice(index, 1);
  await saveMockStore();
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
}

export async function removeQuestionFromExam(examQuestionId: string) {
  if (hasSupabaseEnv()) {
    const { error } = await adminClient().from("exam_questions").delete().eq("id", examQuestionId);
    if (error) throw new Error(error.message);
    return;
  }

  const index = mockExamQuestions.findIndex((row) => row.id === examQuestionId);
  if (index >= 0) mockExamQuestions.splice(index, 1);
  await saveMockStore();
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
}

export async function getStudentDashboard(profileId: string) {
  const [exams, submissions, guides] = await Promise.all([
    listPublishedExams(),
    listStudentSubmissions(profileId),
    listPublishedReviewGuides({})
  ]);
  const examDetails = (await Promise.all(exams.map((exam) => getExamWithQuestions(exam.id)))).filter(
    Boolean
  ) as ExamWithQuestions[];

  return {
    exams,
    examDetails,
    submissions,
    guides: guides.slice(0, 3),
    latestSubmission:
      submissions.find(
        (submission) =>
          (submission.status === "graded" || submission.status === "completed") && submission.max_score > 0
      ) || null
  };
}

export async function listStudentSubmissions(studentId: string) {
  if (hasSupabaseEnv()) {
    const { data, error } = await adminClient()
      .from("submissions")
      .select("*, exam:exams(*)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Submission & { exam: Exam | null }>).map((submission) => ({
      ...normalizeSubmissionRecord(submission),
      exam: submission.exam ? normalizeExamRecord(submission.exam) : null
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
  const exam = await getExamWithQuestions(examId, true);
  const sectionsProgress = exam ? buildSectionsProgress(exam) : [];
  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: existing } = await supabase
      .from("submissions")
      .select("*")
      .eq("exam_id", examId)
      .eq("student_id", studentId)
      .eq("status", "in_progress")
      .is("section", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return normalizeSubmissionRecord(existing as Submission);

    const { data, error } = await supabase
      .from("submissions")
      .insert({
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
        sections_progress: sectionsProgress,
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
    return normalizeSubmissionRecord(data as Submission);
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
    const { data, error } = await adminClient().from("submissions").select("*").eq("id", submissionId).single();
    if (error || !data) return null;
    return normalizeSubmissionRecord(data as Submission);
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
      .from("submissions")
      .update({
        current_question_index: currentQuestionIndex,
        time_spent_seconds: timeSpentSeconds,
        sections_progress: progress,
        updated_at: timestamp
      })
      .eq("id", input.submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalizeSubmissionRecord(data as Submission);
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
      .from("answers")
      .select("*")
      .eq("submission_id", submissionId);
    if (error) throw new Error(error.message);
    return (data || []) as Answer[];
  }

  await ensureMockStore();
  return mockAnswers.filter((answer) => answer.submission_id === submissionId);
}

export async function saveAnswer(input: {
  submissionId: string;
  questionId: string;
  selectedChoice?: string | null;
  answerText?: string | null;
  flagged?: boolean;
  timeSpentSeconds?: number | null;
}) {
  const timestamp = nowIso();
  const payload = {
    submission_id: input.submissionId,
    question_id: input.questionId,
    selected_choice: input.selectedChoice ?? null,
    answer_text: input.answerText ?? null,
    flagged: input.flagged ?? false,
    time_spent_seconds: input.timeSpentSeconds ?? null,
    updated_at: timestamp
  };

  if (hasSupabaseEnv()) {
    const supabase = adminClient();
    const { data: existing } = await supabase
      .from("answers")
      .select("*")
      .eq("submission_id", input.submissionId)
      .eq("question_id", input.questionId)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("answers")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Answer;
    }

    const { data, error } = await supabase
      .from("answers")
      .insert({
        ...payload,
        is_correct: null,
        auto_score: 0,
        manual_score: null,
        final_score: 0,
        created_at: timestamp
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Answer;
  }

  await ensureMockStore();
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
      created_at: timestamp,
      updated_at: timestamp
    };
    mockAnswers.push(answer);
  } else {
    answer.answer_text = payload.answer_text;
    answer.selected_choice = payload.selected_choice;
    answer.flagged = payload.flagged;
    answer.time_spent_seconds = payload.time_spent_seconds;
    answer.updated_at = timestamp;
  }
  await saveMockStore();
  return answer;
}

export async function submitSubmission(submissionId: string, timeSpentOverrideSeconds?: number) {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  const exam = await getExamWithQuestions(submission.exam_id, true);
  if (!exam) throw new Error("Exam not found.");
  const answers = await listAnswersForSubmission(submissionId);
  const rowsForSubmission = filterExamQuestionsForSubmission(exam, submission);

  let total = 0;
  let max = 0;
  let hasFrq = false;
  const answerUpdates: Answer[] = [];

  for (const row of rowsForSubmission) {
    const question = row.question;
    const points = row.points_override ?? question.points;
    max += points;
    let answer = answers.find((item) => item.question_id === question.id);
    if (!answer) {
      answer = await saveAnswer({
        submissionId,
        questionId: question.id,
        selectedChoice: null,
        answerText: null,
        flagged: false
      });
    }

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
    for (const answer of answerUpdates) {
      await supabase.from("answers").update({
        is_correct: answer.is_correct,
        auto_score: answer.auto_score,
        manual_score: answer.manual_score,
        final_score: answer.final_score,
        updated_at: answer.updated_at
      }).eq("id", answer.id);
    }
    const { data, error } = await supabase
      .from("submissions")
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
    return data as Submission;
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
  const exam = await getExamWithQuestions(submission.exam_id, true);
  if (!exam) throw new Error("Exam not found.");
  const sections = getPlayableExamSections(exam);
  if (!sections.length) return submitSubmission(submissionId, timeSpentOverrideSeconds);

  const currentIndex = Math.min(Math.max(0, Number(submission.current_section_index || 0)), sections.length - 1);
  const section = sections[currentIndex];
  const rowsForSection = sectionRows(exam, section.section);
  const answers = await listAnswersForSubmission(submissionId);
  const submittedAt = nowIso();
  const progress = ensureSectionsProgress(exam, submission);
  const timeSpent = Math.max(
    0,
    Math.floor(timeSpentOverrideSeconds ?? progress[currentIndex]?.timeSpentSeconds ?? submission.time_spent_seconds ?? 0)
  );

  let sectionCorrect = 0;
  let sectionTotal = 0;
  const answerUpdates: Answer[] = [];

  for (const row of rowsForSection) {
    const question = row.question;
    let answer = answers.find((item) => item.question_id === question.id);
    if (!answer) {
      answer = await saveAnswer({
        submissionId,
        questionId: question.id,
        selectedChoice: null,
        answerText: null,
        flagged: false
      });
    }

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
    !isFrqSection(exam, section) &&
    isFrqSection(exam, nextSection);
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
    for (const answer of answerUpdates) {
      await supabase.from("answers").update({
        is_correct: answer.is_correct,
        auto_score: answer.auto_score,
        manual_score: answer.manual_score,
        final_score: answer.final_score,
        updated_at: answer.updated_at
      }).eq("id", answer.id);
    }
    const { data, error } = await supabase
      .from("submissions")
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
        sections_progress: progress,
        updated_at: submittedAt
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalizeSubmissionRecord(data as Submission);
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
  const exam = await getExamWithQuestions(submission.exam_id, true);
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
      .from("submissions")
      .update({
        current_step: "section",
        break_completed_at: timestamp,
        break_skipped: skipped,
        sections_progress: progress,
        updated_at: timestamp
      })
      .eq("id", submissionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalizeSubmissionRecord(data as Submission);
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
    const { data, error } = await adminClient()
      .from("submissions")
      .select("*, exam:exams(*), student:profiles(*), answers:answers(*, question:questions(*))")
      .eq("id", submissionId)
      .single();
    if (error || !data) return null;
    const detail = data as SubmissionWithDetails;
    return {
      ...normalizeSubmissionRecord(detail),
      exam: detail.exam ? normalizeExamRecord(detail.exam) : null,
      student: detail.student,
      answers: detail.answers.map((answer) => ({
        ...answer,
        question: answer.question ? normalizeQuestionRecord(answer.question) : null
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
      .from("submissions")
      .select("*, exam:exams(*), student:profiles(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Submission & { exam: Exam | null; student: Profile | null }>).map((submission) => ({
      ...normalizeSubmissionRecord(submission),
      exam: submission.exam ? normalizeExamRecord(submission.exam) : null,
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
  const [students, exams, questions, guides, submissions] = await Promise.all([
    adminListStudents(),
    adminListExams(),
    listQuestions({}),
    adminListReviewGuides({}),
    adminListSubmissions()
  ]);

  return {
    studentsCount: students.length,
    examsCount: exams.length,
    questionsCount: questions.length,
    reviewGuidesCount: guides.length,
    recentSubmissions: submissions.slice(0, 5)
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
