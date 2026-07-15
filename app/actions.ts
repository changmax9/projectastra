"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  addQuestionToExam,
  completeSubmissionBreak,
  createOrContinueSubmission,
  createPdfImportJob,
  deletePdfUploadRecord,
  deleteExam,
  deleteMediaFile,
  deleteQuestion,
  deleteReviewGuide,
  getExamWithQuestionSummaries,
  getPdfImportSchemaStatus,
  getPdfUpload,
  getQuestion,
  getSubmission,
  importQuestionBatch,
  importQuestions,
  isPdfImportSchemaSetupError,
  listQuestions,
  linkImageToChoice,
  linkImageToQuestion,
  removeQuestionFromExam,
  requestPdfImportCancellation,
  retryPdfImportJob,
  recoverMockSubmission,
  reorderExamQuestion,
  saveAnswer,
  saveAnswers,
  saveMediaFile,
  savePdfUpload,
  submitSubmission,
  submitCurrentSection,
  updatePdfMetadata,
  updatePdfImportDraftStatus,
  updateSubmissionProgress,
  upsertExam,
  upsertQuestion,
  upsertReviewGuide
} from "@/lib/data";
import {
  clearAuthCookie,
  deleteCurrentStudentAccount,
  registerStudent,
  requireAdmin,
  requireProfile,
  resendSignupConfirmation,
  signInWithEmail,
  updateCurrentUserEmail
} from "@/lib/auth";
import { mockProfiles } from "@/lib/mock-data";
import { persistMockStore } from "@/lib/mock-store";
import { createSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";
import { examFormSchema, questionFormSchema, questionImportArraySchema, reviewGuideFormSchema } from "@/lib/schemas";
import type { QuestionImportBatch, QuestionImportItem } from "@/lib/types";
import { normalizeQuestionImportItems } from "@/lib/question-import";
import { PARSER_VERSION } from "@/lib/pdf";
import { deleteR2Object, deleteR2Prefix, r2Buckets } from "@/lib/r2";
import { nowIso, slugify } from "@/lib/utils";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function withActionTiming<T>(label: string, action: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await action();
  } finally {
    if (process.env.NODE_ENV === "development") {
      console.log(`${label} took ${Date.now() - start}ms`);
    }
  }
}

function getRequestOrigin() {
  const headerStore = headers();
  const forwardedProto = headerStore.get("x-forwarded-proto") || "http";
  const forwardedHost = headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  let destination = "/dashboard";

  try {
    const profile = await signInWithEmail(email, password);
    destination = profile.role === "admin" ? "/admin" : "/dashboard";
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to sign in." };
  }

  redirect(destination);
}

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "");

  try {
    const origin = getRequestOrigin();
    const result = await registerStudent(email, password, fullName, `${origin}/auth/callback?next=/dashboard`);
    if (result.emailConfirmationDisabled) {
      return { ok: true, message: "Account created. You can sign in now." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to register." };
  }

  return { ok: true, message: "Check your email to confirm your account before signing in." };
}

export async function signOutAction() {
  clearAuthCookie();
  redirect("/login");
}

export async function updateAccountSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const fullName = String(formData.get("full_name") || "").trim();

  try {
    const nextFullName = fullName || null;

    if (hasSupabaseEnv()) {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: nextFullName,
          updated_at: nowIso()
        })
        .eq("id", profile.id);
      if (error) throw error;
    } else {
      const existing = mockProfiles.find((item) => item.id === profile.id);
      if (!existing) throw new Error("Profile not found.");
      existing.full_name = nextFullName;
      existing.updated_at = nowIso();
      await persistMockStore();
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update settings." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Account settings updated." };
}

export async function resendVerificationEmailAction(_: ActionState, _formData: FormData): Promise<ActionState> {
  const profile = await requireProfile();

  if (!hasSupabaseEnv()) {
    return { message: "Email verification is not currently enabled for this project." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
    if (userError || !userData.user) {
      return { error: userError?.message || "Unable to read email verification status." };
    }
    if (userData.user.email_confirmed_at || userData.user.confirmed_at) {
      return { message: "Your email is already verified." };
    }

    await resendSignupConfirmation(profile.email, `${getRequestOrigin()}/auth/callback?next=/settings`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to resend verification email." };
  }

  return { ok: true, message: "Verification email sent." };
}

export async function updateEmailAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const nextEmail = String(formData.get("new_email") || "").trim().toLowerCase();
  if (!isValidEmail(nextEmail)) {
    return { error: "Enter a valid email address." };
  }
  if (nextEmail === profile.email.toLowerCase()) {
    return { error: "Use a different email from your current one." };
  }

  try {
    await updateCurrentUserEmail(nextEmail, `${getRequestOrigin()}/auth/callback?next=/settings`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to start email change." };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Check your current and new email inboxes to confirm the email change." };
}

export async function deleteAccountAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const currentPassword = String(formData.get("current_password") || "");
  const confirmation = String(formData.get("delete_confirmation") || "");

  if (confirmation !== "DELETE") {
    return { error: "Type DELETE to confirm account deletion." };
  }
  if (!currentPassword) {
    return { error: "Enter your current password to delete your account." };
  }

  try {
    await deleteCurrentStudentAccount(currentPassword);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to delete account." };
  }

  clearAuthCookie();
  redirect("/login");
}

export async function startExamAction(formData: FormData) {
  const profile = await requireProfile();
  const examId = String(formData.get("exam_id") || "");
  if (!examId) throw new Error("Missing exam id.");
  const exam = await getExamWithQuestionSummaries(examId);
  if (!exam) throw new Error("Exam not found.");
  const submission = await createOrContinueSubmission(examId, profile.id);
  revalidatePath("/dashboard");
  redirect(`/exam/${examId}/take?submission=${submission.id}`);
}

export async function launchBluebookPracticeAction(formData: FormData) {
  const profile = await requireProfile();
  const examId = String(formData.get("exam_id") || "");
  if (!examId) throw new Error("Missing exam id.");

  const exam = await getExamWithQuestionSummaries(examId);
  if (!exam || exam.status !== "published") {
    throw new Error("This practice test is not available.");
  }

  const submission = await createOrContinueSubmission(examId, profile.id);
  revalidatePath("/dashboard");
  redirect(`/exam/${examId}/take?submission=${submission.id}`);
}

export async function saveAnswerAction(input: {
  submissionId: string;
  questionId: string;
  selectedChoice?: string | null;
  answerText?: string | null;
  flagged?: boolean;
  timeSpentSeconds?: number | null;
  eliminatedChoiceIds?: string[];
}) {
  return withActionTiming("saveAnswerAction", async () => {
    const profile = await requireProfile();
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Submission not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only edit your own answers." };
      }
      if (submission.status !== "in_progress") {
        return { error: "This exam has already been submitted." };
      }

      await saveAnswer(input);
      return { ok: true, savedAt: nowIso() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Save failed. Please try again." };
    }
  });
}

export async function syncBluebookResponseAction(input: {
  submissionId: string;
  questionId: string;
  selectedChoice?: string | null;
  answerText?: string | null;
  flagged: boolean;
  timeSpentSeconds?: number | null;
  eliminatedChoiceIds: string[];
}) {
  return withActionTiming("syncBluebookResponseAction", async () => {
    const profile = await requireProfile();
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Testing session not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only update your own testing session." };
      }
      if (submission.status !== "in_progress" || submission.current_step === "completed") {
        return { error: "This testing session is no longer active." };
      }

      await saveAnswer({
        submissionId: input.submissionId,
        questionId: input.questionId,
        selectedChoice: input.selectedChoice ?? null,
        answerText: input.answerText ?? null,
        flagged: input.flagged,
        timeSpentSeconds: input.timeSpentSeconds ?? null,
        eliminatedChoiceIds: input.eliminatedChoiceIds
      });
      return { ok: true, syncedAt: nowIso() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Your answer could not be synced." };
    }
  });
}

export async function saveBluebookSectionProgressAction(input: {
  submissionId: string;
  currentQuestionIndex: number;
  timeSpentSeconds: number;
  responses: Array<{
    questionId: string;
    selectedChoice?: string | null;
    answerText?: string | null;
    flagged: boolean;
    timeSpentSeconds?: number | null;
    eliminatedChoiceIds: string[];
  }>;
}) {
  return withActionTiming("saveBluebookSectionProgressAction", async () => {
    const profile = await requireProfile();
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Testing session not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only update your own testing session." };
      }
      if (submission.status !== "in_progress" || submission.current_step === "completed") {
        return { error: "This testing session is no longer active." };
      }

      await saveAnswers(
        input.responses.map((response) => ({
          submissionId: submission.id,
          questionId: response.questionId,
          selectedChoice: response.selectedChoice ?? null,
          answerText: response.answerText ?? null,
          flagged: response.flagged,
          timeSpentSeconds: response.timeSpentSeconds ?? null,
          eliminatedChoiceIds: response.eliminatedChoiceIds
        }))
      );
      await updateSubmissionProgress({
        submissionId: submission.id,
        currentQuestionIndex: Math.max(0, input.currentQuestionIndex),
        timeSpentSeconds: Math.max(0, input.timeSpentSeconds)
      });
      revalidatePath("/dashboard");
      return { ok: true, syncedAt: nowIso() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Testing progress could not be saved." };
    }
  });
}

export async function completeBluebookSectionAction(input: {
  submissionId: string;
  timeSpentSeconds: number;
  responses: Array<{
    questionId: string;
    selectedChoice?: string | null;
    answerText?: string | null;
    flagged: boolean;
    timeSpentSeconds?: number | null;
    eliminatedChoiceIds: string[];
  }>;
}) {
  return withActionTiming("completeBluebookSectionAction", async () => {
    const profile = await requireProfile();
    let destination = "";
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Testing session not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only submit your own testing session." };
      }
      if (submission.status !== "in_progress" || submission.current_step === "completed") {
        return { error: "This testing session is no longer active." };
      }

      await saveAnswers(
        input.responses.map((response) => ({
          submissionId: submission.id,
          questionId: response.questionId,
          selectedChoice: response.selectedChoice ?? null,
          answerText: response.answerText ?? null,
          flagged: response.flagged,
          timeSpentSeconds: response.timeSpentSeconds ?? null,
          eliminatedChoiceIds: response.eliminatedChoiceIds
        }))
      );

      const updated = submission.sections_progress?.length
        ? await submitCurrentSection(submission.id, Math.max(0, input.timeSpentSeconds))
        : await submitSubmission(submission.id, Math.max(0, input.timeSpentSeconds));
      destination =
        updated.current_step === "completed" || updated.status === "completed" || updated.status === "submitted"
          ? `/results/${updated.id}`
          : `/exam/${updated.exam_id}/take?submission=${updated.id}`;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "This section could not be submitted." };
    }

    revalidatePath("/dashboard");
    redirect(destination);
  });
}

export async function submitExamAction(submissionId: string) {
  const profile = await requireProfile();
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  if (profile.role !== "admin" && submission.student_id !== profile.id) {
    throw new Error("You can only submit your own exam.");
  }

  const submitted = await submitSubmission(submissionId);
  revalidatePath("/dashboard");
  redirect(`/results/${submitted.id}`);
}

export async function submitExamWithResponsesAction(input: {
  submissionId: string;
  examId: string;
  startedAt: string;
  section?: string | null;
  timeSpentSeconds?: number;
  responses: Array<{
    questionId: string;
    selectedChoice?: string | null;
    answerText?: string | null;
    flagged?: boolean;
    timeSpentSeconds?: number | null;
    eliminatedChoiceIds?: string[];
  }>;
}) {
  return withActionTiming("submitExamAction", async () => {
    const profile = await requireProfile();
    let submittedId = "";
    try {
      let submission = await getSubmission(input.submissionId);

      if (!submission) {
        const exam = await getExamWithQuestionSummaries(input.examId, true);
        const section = input.section
          ? exam?.sections?.find((item) => item.section === input.section || item.id === input.section) || null
          : null;
        submission = await recoverMockSubmission({
          id: input.submissionId,
          examId: input.examId,
          studentId: profile.id,
          startedAt: input.startedAt,
          section
        });
      }

      if (!submission) return { error: "Submission not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only submit your own exam." };
      }

      await saveAnswers(
        input.responses.map((response) => ({
          submissionId: submission.id,
          questionId: response.questionId,
          selectedChoice: response.selectedChoice ?? null,
          answerText: response.answerText ?? null,
          flagged: response.flagged ?? false,
          timeSpentSeconds: response.timeSpentSeconds ?? null,
          eliminatedChoiceIds: response.eliminatedChoiceIds ?? []
        }))
      );

      await updateSubmissionProgress({
        submissionId: submission.id,
        currentQuestionIndex: 0,
        timeSpentSeconds: input.timeSpentSeconds ?? submission.time_spent_seconds
      });

      const submitted = await submitSubmission(submission.id, input.timeSpentSeconds);
      submittedId = submitted.id;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Submit failed. Please try again." };
    }
    revalidatePath("/dashboard");
    redirect(`/results/${submittedId}`);
  });
}

export async function submitSectionWithResponsesAction(input: {
  submissionId: string;
  examId: string;
  timeSpentSeconds?: number;
  responses: Array<{
    questionId: string;
    selectedChoice?: string | null;
    answerText?: string | null;
    flagged?: boolean;
    timeSpentSeconds?: number | null;
    eliminatedChoiceIds?: string[];
  }>;
}) {
  return withActionTiming("endSectionAction", async () => {
    const profile = await requireProfile();
    let destination = "";
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Submission not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only submit your own exam." };
      }

      await saveAnswers(
        input.responses.map((response) => ({
          submissionId: submission.id,
          questionId: response.questionId,
          selectedChoice: response.selectedChoice ?? null,
          answerText: response.answerText ?? null,
          flagged: response.flagged ?? false,
          timeSpentSeconds: response.timeSpentSeconds ?? null,
          eliminatedChoiceIds: response.eliminatedChoiceIds ?? []
        }))
      );

      const updated = await submitCurrentSection(submission.id, input.timeSpentSeconds);
      destination =
        updated.current_step === "completed" || updated.status === "completed"
          ? `/results/${updated.id}`
          : `/exam/${updated.exam_id}/take?submission=${updated.id}`;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Submit failed. Please try again." };
    }
    revalidatePath("/dashboard");
    redirect(destination);
  });
}

export async function completeBreakAction(submissionId: string, skipped = true) {
  const profile = await requireProfile();
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found.");
  if (profile.role !== "admin" && submission.student_id !== profile.id) {
    throw new Error("You can only resume your own exam.");
  }
  const updated = await completeSubmissionBreak(submissionId, skipped);
  revalidatePath("/dashboard");
  redirect(`/exam/${updated.exam_id}/take?submission=${updated.id}`);
}

export async function resumeBluebookAfterBreakAction(submissionId: string, resumedEarly: boolean) {
  const profile = await requireProfile();
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("Testing session not found.");
  if (profile.role !== "admin" && submission.student_id !== profile.id) {
    throw new Error("You can only resume your own testing session.");
  }
  if (submission.current_step !== "break") {
    throw new Error("This testing session is not on a break.");
  }

  const updated = await completeSubmissionBreak(submissionId, resumedEarly);
  revalidatePath("/dashboard");
  redirect(`/exam/${updated.exam_id}/take?submission=${updated.id}`);
}

export async function saveExamProgressAction(input: {
  submissionId: string;
  examId: string;
  currentQuestionIndex: number;
  timeSpentSeconds: number;
  responses: Array<{
    questionId: string;
    selectedChoice?: string | null;
    answerText?: string | null;
    flagged?: boolean;
    timeSpentSeconds?: number | null;
    eliminatedChoiceIds?: string[];
  }>;
}) {
  return withActionTiming("saveExamProgressAction", async () => {
    const profile = await requireProfile();
    try {
      const submission = await getSubmission(input.submissionId);
      if (!submission) return { error: "Submission not found." };
      if (profile.role !== "admin" && submission.student_id !== profile.id) {
        return { error: "You can only save your own exam." };
      }
      if (submission.status !== "in_progress") {
        return { error: "This exam has already been submitted." };
      }

      await saveAnswers(
        input.responses.map((response) => ({
          submissionId: submission.id,
          questionId: response.questionId,
          selectedChoice: response.selectedChoice ?? null,
          answerText: response.answerText ?? null,
          flagged: response.flagged ?? false,
          timeSpentSeconds: response.timeSpentSeconds ?? null,
          eliminatedChoiceIds: response.eliminatedChoiceIds ?? []
        }))
      );

      await updateSubmissionProgress({
        submissionId: submission.id,
        currentQuestionIndex: input.currentQuestionIndex,
        timeSpentSeconds: input.timeSpentSeconds
      });
      revalidatePath("/dashboard");
      return { ok: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Save failed. Please try again." };
    }
  });
}

export async function adminSaveExamAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = examFormSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    subject: formData.get("subject"),
    course: formData.get("course"),
    year: formData.get("year"),
    section: formData.get("section"),
    exam_type: formData.get("exam_type"),
    time_limit_minutes: formData.get("time_limit_minutes"),
    status: formData.get("status")
  });
  const id = String(formData.get("id") || parsed.id || "") || undefined;
  await upsertExam({ id, ...parsed }, admin.id);
  revalidatePath("/admin/exams");
  redirect("/admin/exams");
}

export async function adminDeleteExamAction(formData: FormData) {
  await requireAdmin();
  await deleteExam(String(formData.get("id") || ""));
  revalidatePath("/admin/exams");
}

export async function adminAddQuestionToExamAction(formData: FormData) {
  await requireAdmin();
  const examId = String(formData.get("exam_id") || "");
  const questionId = String(formData.get("question_id") || "");
  await addQuestionToExam(examId, questionId);
  revalidatePath("/admin/exams");
}

export async function adminRemoveExamQuestionAction(formData: FormData) {
  await requireAdmin();
  await removeQuestionFromExam(String(formData.get("exam_question_id") || ""));
  revalidatePath("/admin/exams");
}

export async function adminReorderExamQuestionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("exam_question_id") || "");
  const direction = String(formData.get("direction") || "up") === "down" ? "down" : "up";
  await reorderExamQuestion(id, direction);
  revalidatePath("/admin/exams");
}

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

function parseQuestionFormData(formData: FormData) {
  return questionFormSchema.parse({
      id: String(formData.get("id") || "") || undefined,
      exam_name: formData.get("exam_name"),
      subject: formData.get("subject"),
      course: formData.get("course"),
      year: formData.get("year"),
      section: formData.get("section"),
      exam_type: formData.get("exam_type"),
      question_number: formData.get("question_number"),
      unit: formData.get("unit"),
      topic: formData.get("topic"),
      difficulty: formData.get("difficulty"),
      type: formData.get("type"),
      selection_type: String(formData.get("selection_type") || "") || undefined,
      required_selections: formData.get("required_selections")
        ? Number(formData.get("required_selections"))
        : null,
      max_selections: formData.get("max_selections")
        ? Number(formData.get("max_selections"))
        : null,
      question_text: formData.get("question_text"),
      question_images: parseJsonField(formData.get("question_images_json"), []),
      choices: parseJsonField(formData.get("choices_json"), []),
      correct_answer: String(formData.get("correct_answer") || "") || null,
      explanation: formData.get("explanation"),
      source_pdf: String(formData.get("source_pdf") || "") || null,
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: formData.get("status"),
      points: formData.get("points"),
      time_estimate_seconds: formData.get("time_estimate_seconds")
        ? Number(formData.get("time_estimate_seconds"))
        : null
    });
}

export async function adminSaveQuestionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const parsed = parseQuestionFormData(formData);
    const intent = String(formData.get("intent") || "save");
    const payload = intent === "save-draft" ? { ...parsed, status: "draft" as const } : parsed;
    await upsertQuestion(payload, admin.id);
    revalidatePath("/admin/questions");
    if (payload.id) revalidatePath(`/admin/questions/${payload.id}`);
    revalidatePath("/dashboard");
    return { ok: true, message: intent === "save-draft" ? "Draft saved." : "Question saved." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
    }
    return { error: error instanceof Error ? error.message : "Unable to save question." };
  }
}

export const updateQuestionAction = adminSaveQuestionAction;

function sortReviewQueue(a: { section: string; question_number: number | null }, b: { section: string; question_number: number | null }) {
  const sectionOrder = ["MCQ_NON_CALCULATOR", "MCQ_CALCULATOR", "FRQ_CALCULATOR", "FRQ_NON_CALCULATOR", "MCQ", "FRQ"];
  const sectionDelta = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
  if (sectionDelta !== 0) return sectionDelta;
  return (a.question_number || 0) - (b.question_number || 0);
}

export async function adminMarkQuestionReviewedAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  let destination = "/admin/questions?tag=needs-admin-review";
  try {
    const parsed = parseQuestionFormData(formData);
    if (!parsed.id) return { error: "Missing question id." };
    const payload = {
      ...parsed,
      status: "reviewed" as const,
      tags: parsed.tags.filter((tag) => tag !== "needs-admin-review")
    };
    await upsertQuestion(payload, admin.id);
    revalidatePath("/admin/questions");
    revalidatePath(`/admin/questions/${parsed.id}`);
    revalidatePath("/dashboard");

    const remaining = (await listQuestions({
      course: payload.course,
      tag: "needs-admin-review"
    }))
      .filter((question) => question.id !== payload.id)
      .sort(sortReviewQueue);
    if (remaining[0]) destination = `/admin/questions/${remaining[0].id}`;
    else {
      const params = new URLSearchParams({
        course: payload.course,
        tag: "needs-admin-review"
      });
      destination = `/admin/questions?${params.toString()}`;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
    }
    return { error: error instanceof Error ? error.message : "Unable to mark question reviewed." };
  }
  redirect(destination);
}

export async function adminDeleteQuestionAction(formData: FormData) {
  await requireAdmin();
  await deleteQuestion(String(formData.get("id") || ""));
  revalidatePath("/admin/questions");
}

export async function adminImportQuestionsAction(items: QuestionImportItem[]) {
  const admin = await requireAdmin();
  const parsed = questionImportArraySchema.parse(normalizeQuestionImportItems(items));
  const created = await importQuestions(parsed, admin.id);
  revalidatePath("/admin/questions");
  return { ok: true, count: created.length };
}

export async function adminImportQuestionBatchAction(batch: QuestionImportBatch) {
  const admin = await requireAdmin();
  const parsed = questionImportArraySchema.parse(normalizeQuestionImportItems(batch.questions));
  const created = await importQuestionBatch({ exam: batch.exam, questions: parsed }, admin.id);
  revalidatePath("/admin/questions");
  revalidatePath("/admin/exams");
  revalidatePath("/dashboard");
  return { ok: true, count: created.questions.length, examId: created.exam.id };
}

async function storeUpload(file: File, bucket: "question-media" | "pdf-uploads") {
  if (!file || file.size === 0) throw new Error("No file selected.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const objectName = `${Date.now()}-${safeName}`;

  if (hasSupabaseEnv()) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage.from(bucket).upload(objectName, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true
    });
    if (error) {
      throw new Error(
        `Storage upload failed. Make sure the "${bucket}" bucket exists and policies are configured. ${error.message}`
      );
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectName);
    return data.publicUrl;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, objectName), bytes);
  return `/uploads/${objectName}`;
}

export async function adminUploadMediaAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const file = formData.get("file") as File;
    if (!file.type.startsWith("image/")) throw new Error("Please upload an image file.");
    const url = await storeUpload(file, "question-media");
    await saveMediaFile({
      file_name: file.name,
      file_url: url,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: admin.id,
      linked_question_id: String(formData.get("linked_question_id") || "") || null
    });
    revalidatePath("/admin/media");
    return { ok: true, message: `Uploaded ${file.name}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload media." };
  }
}

export async function adminDeleteMediaAction(formData: FormData) {
  await requireAdmin();
  await deleteMediaFile(String(formData.get("id") || ""));
  revalidatePath("/admin/media");
}

export async function adminLinkImageToQuestionAction(formData: FormData) {
  await requireAdmin();
  await linkImageToQuestion(String(formData.get("question_id") || ""), String(formData.get("image_url") || ""));
  revalidatePath("/admin/media");
  revalidatePath("/admin/questions");
}

export async function adminLinkImageToChoiceAction(formData: FormData) {
  await requireAdmin();
  await linkImageToChoice(
    String(formData.get("question_id") || ""),
    String(formData.get("choice_id") || ""),
    String(formData.get("image_url") || "")
  );
  revalidatePath("/admin/media");
  revalidatePath("/admin/questions");
}

export async function adminUploadPdfAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const file = formData.get("file") as File;
    if (file.type !== "application/pdf") throw new Error("Please upload a PDF file.");
    const url = await storeUpload(file, "pdf-uploads");
    await savePdfUpload({
      file_name: file.name,
      file_url: url,
      subject: String(formData.get("subject") || "") || null,
      unit: String(formData.get("unit") || "") || null,
      topic: String(formData.get("topic") || "") || null,
      uploaded_by: admin.id
    });
    revalidatePath("/admin/pdfs");
    return { ok: true, message: `Uploaded ${file.name}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload PDF." };
  }
}

export async function adminUpdatePdfMetadataAction(formData: FormData) {
  await requireAdmin();
  await updatePdfMetadata(String(formData.get("id") || ""), {
    subject: String(formData.get("subject") || "") || null,
    unit: String(formData.get("unit") || "") || null,
    topic: String(formData.get("topic") || "") || null
  });
  revalidatePath("/admin/pdfs");
}

export async function adminStartPdfImportAction(formData: FormData) {
  const admin = await requireAdmin();
  const pdfId = String(formData.get("pdf_id") || "");
  if (!pdfId) throw new Error("Missing PDF id.");
  const schemaStatus = await getPdfImportSchemaStatus();
  if (!schemaStatus.available) redirect("/admin/pdfs?import_error=schema_missing");
  let job: Awaited<ReturnType<typeof createPdfImportJob>>;
  try {
    const pdf = await getPdfUpload(pdfId);
    if (!pdf) throw new Error("PDF upload not found.");
    if (pdf.upload_status === "uploading") throw new Error("PDF upload has not completed yet.");
    job = await createPdfImportJob(pdf.id, admin.id, PARSER_VERSION);
  } catch (error) {
    if (isPdfImportSchemaSetupError(error)) redirect("/admin/pdfs?import_error=schema_missing");
    console.error("Unable to start PDF import:", error);
    redirect("/admin/pdfs?import_error=start_failed");
  }
  revalidatePath("/admin/pdfs");
  revalidatePath(`/admin/pdf-imports/${job.id}`);
  redirect(`/admin/pdfs?job_id=${job.id}`);
}

export async function adminCancelPdfImportAction(formData: FormData) {
  await requireAdmin();
  const jobId = String(formData.get("job_id") || "");
  if (jobId) await requestPdfImportCancellation(jobId);
  revalidatePath("/admin/pdfs");
}

export async function adminRetryPdfImportAction(formData: FormData) {
  await requireAdmin();
  const jobId = String(formData.get("job_id") || "");
  if (jobId) await retryPdfImportJob(jobId);
  revalidatePath("/admin/pdfs");
}

export async function adminDeletePdfUploadAction(formData: FormData) {
  await requireAdmin();
  const pdfId = String(formData.get("pdf_id") || "");
  const pdf = pdfId ? await getPdfUpload(pdfId) : null;
  if (!pdf) return;
  if (pdf.storage_provider === "r2") {
    if (pdf.storage_bucket && pdf.storage_object_key) await deleteR2Object(pdf.storage_bucket, pdf.storage_object_key);
    await deleteR2Prefix(r2Buckets.evidence, `evidence/${pdf.id}/`);
  }
  await deletePdfUploadRecord(pdf.id);
  revalidatePath("/admin/pdfs");
}

export async function adminSavePdfDraftQuestionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const draftId = String(formData.get("draft_id") || "");
  const jobId = String(formData.get("job_id") || "");
  try {
    if (!draftId) return { error: "Missing draft id." };
    const parsed = parseQuestionFormData(formData);
    const tags = Array.from(
      new Set([
        ...parsed.tags,
        "pdf-import",
        "needs-admin-review",
        jobId ? `pdf-import-job:${jobId}` : ""
      ].filter(Boolean))
    );
    const saved = await upsertQuestion(
      {
        ...parsed,
        status: "draft",
        tags
      },
      admin.id
    );
    await updatePdfImportDraftStatus(draftId, "saved", saved.id, admin.id);
    revalidatePath("/admin/questions");
    if (jobId) revalidatePath(`/admin/pdf-imports/${jobId}`);
    return { ok: true, message: "Saved as a draft question for admin review." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
    }
    return { error: error instanceof Error ? error.message : "Unable to save PDF draft question." };
  }
}

export async function adminRejectPdfDraftQuestionAction(formData: FormData) {
  const admin = await requireAdmin();
  const draftId = String(formData.get("draft_id") || "");
  const jobId = String(formData.get("job_id") || "");
  if (!draftId) throw new Error("Missing draft id.");
  await updatePdfImportDraftStatus(draftId, "rejected", null, admin.id);
  if (jobId) revalidatePath(`/admin/pdf-imports/${jobId}`);
}

export async function adminSaveReviewGuideAction(formData: FormData) {
  const admin = await requireAdmin();
  const questionIds = formData.getAll("question_ids").map(String).filter(Boolean);
  const parsed = reviewGuideFormSchema.parse({
    title: formData.get("title"),
    slug: String(formData.get("slug") || "") || slugify(String(formData.get("title") || "")),
    description: formData.get("description"),
    subject: formData.get("subject"),
    unit: formData.get("unit"),
    topic: formData.get("topic"),
    difficulty: formData.get("difficulty"),
    content_markdown: formData.get("content_markdown"),
    status: formData.get("status"),
    cover_image_url: String(formData.get("cover_image_url") || "") || null,
    estimated_reading_time_minutes: formData.get("estimated_reading_time_minutes"),
    question_ids: questionIds
  });
  const id = String(formData.get("id") || "") || undefined;
  await upsertReviewGuide({ id, ...parsed }, admin.id);
  revalidatePath("/admin/review-guides");
  revalidatePath("/review");
  redirect("/admin/review-guides");
}

export async function adminDeleteReviewGuideAction(formData: FormData) {
  await requireAdmin();
  await deleteReviewGuide(String(formData.get("id") || ""));
  revalidatePath("/admin/review-guides");
  revalidatePath("/review");
}

export async function adminToggleReviewGuideStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "");
  const guide = {
    id,
    title,
    slug: String(formData.get("slug") || ""),
    description: String(formData.get("description") || ""),
    subject: String(formData.get("subject") || ""),
    unit: String(formData.get("unit") || ""),
    topic: String(formData.get("topic") || ""),
    difficulty: String(formData.get("difficulty") || "medium") as "easy" | "medium" | "hard",
    content_markdown: String(formData.get("content_markdown") || ""),
    status: String(formData.get("next_status") || "draft") === "published" ? "published" : "draft",
    cover_image_url: String(formData.get("cover_image_url") || "") || null,
    estimated_reading_time_minutes: Number(formData.get("estimated_reading_time_minutes") || 8)
  } as const;
  await upsertReviewGuide(guide, admin.id);
  revalidatePath("/admin/review-guides");
  revalidatePath("/review");
}

export async function adminCreateQuestionFromMinimalAction(formData: FormData) {
  const admin = await requireAdmin();
  const type = String(formData.get("type") || "mcq") === "frq" ? "frq" : "mcq";
  await upsertQuestion(
    {
      subject: String(formData.get("subject") || "Physics"),
      exam_name: String(formData.get("course") || formData.get("subject") || "AP Physics 1"),
      course: String(formData.get("course") || formData.get("subject") || "AP Physics 1"),
      year: formData.get("year") ? Number(formData.get("year")) : null,
      section: type === "frq" ? "FRQ" : "MCQ",
      exam_type: "Custom Quiz",
      question_number: null,
      unit: String(formData.get("unit") || "Unit"),
      topic: String(formData.get("topic") || "Topic"),
      difficulty: "medium",
      type,
      question_text: String(formData.get("question_text") || "New question"),
      question_images: [],
      choices:
        type === "mcq"
          ? [
              { id: "A", text: "Choice A", image_url: null },
              { id: "B", text: "Choice B", image_url: null },
              { id: "C", text: "Choice C", image_url: null },
              { id: "D", text: "Choice D", image_url: null }
            ]
          : [],
      correct_answer: type === "mcq" ? "A" : null,
      explanation: "Add an explanation before publishing this question.",
      source_pdf: null,
      tags: [],
      status: "draft",
      points: type === "mcq" ? 1 : 4,
      time_estimate_seconds: type === "mcq" ? 90 : 480
    },
    admin.id
  );
  revalidatePath("/admin/questions");
}

export async function adminQuickStatusExamAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const existing = await upsertExam(
    {
      id,
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      subject: String(formData.get("subject") || ""),
      course: String(formData.get("course") || ""),
      year: formData.get("year") ? Number(formData.get("year")) : null,
      section: String(formData.get("section") || "Full Exam"),
      exam_type: String(formData.get("exam_type") || "Practice Exam"),
      time_limit_minutes: Number(formData.get("time_limit_minutes") || 45),
      status: String(formData.get("status") || "draft") as "draft" | "reviewed" | "published" | "archived"
    },
    admin.id
  );
  revalidatePath("/admin/exams");
  return existing;
}
