"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Save, Send } from "lucide-react";
import {
  saveAnswerAction,
  saveExamProgressAction,
  submitExamWithResponsesAction,
  submitSectionWithResponsesAction
} from "@/app/actions";
import type { Answer, ExamSection, ExamWithQuestions, Submission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChoiceList } from "@/components/exam/ChoiceList";
import { ExamTimer } from "@/components/exam/ExamTimer";
import { FRQAnswerBox } from "@/components/exam/FRQAnswerBox";
import { QuestionNavigator } from "@/components/exam/QuestionNavigator";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";

interface ResponseState {
  selectedChoice: string | null;
  answerText: string;
  flagged: boolean;
  timeSpentSeconds: number | null;
  eliminatedChoiceIds: string[];
}

function fallbackSection(section: string, order: number, questionCount: number, examTimeLimitMinutes: number): ExamSection {
  return {
    id: section.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    section,
    title: section,
    questionCount,
    timeLimitMinutes: examTimeLimitMinutes,
    calculatorAllowed: /calculator/i.test(section) && !/non|no/i.test(section),
    order
  };
}

export function TakeExamClient({
  exam,
  submission,
  initialAnswers
}: {
  exam: ExamWithQuestions;
  submission: Submission;
  initialAnswers: Answer[];
}) {
  const router = useRouter();
  const questions = useMemo(() => exam.exam_questions.map((row) => row.question).filter(Boolean), [exam.exam_questions]);
  const initialQuestionIndex = Math.min(
    Math.max(0, submission.current_question_index || 0),
    Math.max(0, questions.length - 1)
  );
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex);
  const [responses, setResponses] = useState<Record<string, ResponseState>>(() => {
    const state: Record<string, ResponseState> = {};
    for (const answer of initialAnswers) {
      state[answer.question_id] = {
        selectedChoice: answer.selected_choice,
        answerText: answer.answer_text || "",
        flagged: answer.flagged,
        timeSpentSeconds: answer.time_spent_seconds,
        eliminatedChoiceIds: []
      };
    }
    return state;
  });
  const [dirtyQuestionId, setDirtyQuestionId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const [dialog, setDialog] = useState<"exit" | "submit" | null>(null);
  const [sessionStartedAt] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const isSectionedExam = Boolean(submission.sections_progress?.length);
  const clampedCurrentIndex = questions.length
    ? Math.min(Math.max(0, currentIndex), questions.length - 1)
    : 0;
  const currentQuestion = questions[clampedCurrentIndex] || null;
  const currentQuestionId = currentQuestion?.id || null;
  const currentSectionKey = currentQuestion?.section || exam.sections?.[0]?.section || "";

  useEffect(() => {
    if (!questions.length) return;
    const nextIndex = Math.min(
      Math.max(0, submission.current_question_index || 0),
      Math.max(0, questions.length - 1)
    );
    setCurrentIndex(nextIndex);
  }, [questions.length, submission.current_question_index, submission.current_section_index, submission.id]);

  useEffect(() => {
    if (!questions.length) return;
    if (currentIndex === clampedCurrentIndex) return;
    setCurrentIndex(clampedCurrentIndex);
  }, [clampedCurrentIndex, currentIndex, questions.length]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log(
      `TakeExamClient questions=${questions.length} section=${currentSectionKey || "none"} currentQuestionIndex=${clampedCurrentIndex}`
    );
  }, [clampedCurrentIndex, currentSectionKey, questions.length]);

  const currentSectionIndexes = useMemo(
    () =>
      questions
        .map((question, index) => ({ question, index }))
        .filter((item) => item.question.section === currentSectionKey)
        .map((item) => item.index),
    [currentSectionKey, questions]
  );
  const currentSection = useMemo(() => {
    const explicit = exam.sections?.find((section) => section.section === currentSectionKey);
    return (
      explicit ||
      fallbackSection(
        currentSectionKey || "Section",
        new Set(questions.slice(0, clampedCurrentIndex + 1).map((question) => question.section)).size || 1,
        currentSectionIndexes.length || questions.length,
        exam.time_limit_minutes
      )
    );
  }, [clampedCurrentIndex, currentSectionKey, currentSectionIndexes.length, exam.sections, exam.time_limit_minutes, questions]);
  const currentSectionProgress = submission.sections_progress?.find(
    (progress) => progress.section === currentSection.section
  );
  const timerStartedAt = currentSectionProgress?.startedAt || submission.started_at;
  const timerElapsedSeconds = currentSectionProgress?.timeSpentSeconds ?? submission.time_spent_seconds;
  const currentSectionOffset = currentSectionIndexes.indexOf(clampedCurrentIndex);
  const currentSectionPosition = currentSectionOffset >= 0 ? currentSectionOffset + 1 : Math.min(clampedCurrentIndex + 1, questions.length || 1);
  const currentSectionRange =
    currentSectionIndexes.length > 0
      ? `${currentSectionIndexes[0] + 1}-${currentSectionIndexes[currentSectionIndexes.length - 1] + 1}`
      : `${clampedCurrentIndex + 1}`;
  const isCurrentMultiSelect = Boolean(
    currentQuestion &&
      (currentQuestion.selection_type === "multiple" || currentQuestion.tags.includes("multi-select"))
  );
  const currentMaxSelections = isCurrentMultiSelect
    ? currentQuestion?.max_selections || currentQuestion?.required_selections || 2
    : 1;
  const currentResponse = (currentQuestionId ? responses[currentQuestionId] : null) || {
    selectedChoice: null,
    answerText: "",
    flagged: false,
    timeSpentSeconds: null,
    eliminatedChoiceIds: []
  };
  const answered = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((question, index) => {
      const response = responses[question.id];
      if (!response) return;
      if (question.type === "mcq" && response.selectedChoice) set.add(index);
      if (question.type === "frq" && response.answerText.trim()) set.add(index);
    });
    return set;
  }, [questions, responses]);

  const flagged = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((question, index) => {
      if (responses[question.id]?.flagged) set.add(index);
    });
    return set;
  }, [questions, responses]);

  const persist = useCallback(
    async (questionId: string, response: ResponseState) => {
      setSaveStatus("Saving...");
      try {
        const result = await saveAnswerAction({
          submissionId: submission.id,
          questionId,
          selectedChoice: response.selectedChoice,
          answerText: response.answerText,
          flagged: response.flagged,
          timeSpentSeconds: response.timeSpentSeconds
        });
        setSaveStatus(result?.error ? result.error : "All changes saved");
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : "Save failed. Please try again.");
      }
    },
    [submission.id]
  );

  useEffect(() => {
    if (!dirtyQuestionId) return;
    const response = responses[dirtyQuestionId];
    if (!response) return;
    const timeout = window.setTimeout(() => {
      void persist(dirtyQuestionId, response);
      setDirtyQuestionId(null);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [dirtyQuestionId, persist, responses]);

  const updateResponse = useCallback((questionId: string, patch: Partial<ResponseState>) => {
    setResponses((previous) => {
      const next = {
        selectedChoice: previous[questionId]?.selectedChoice ?? null,
        answerText: previous[questionId]?.answerText ?? "",
        flagged: previous[questionId]?.flagged ?? false,
        timeSpentSeconds: previous[questionId]?.timeSpentSeconds ?? null,
        eliminatedChoiceIds: previous[questionId]?.eliminatedChoiceIds ?? [],
        ...patch
      };
      return { ...previous, [questionId]: next };
    });
    setDirtyQuestionId(questionId);
  }, []);

  const handleChoiceChange = useCallback(
    (choiceId: string) => {
      if (!currentQuestionId) return;
      const nextEliminated = (responses[currentQuestionId]?.eliminatedChoiceIds || []).filter(
        (id) => id !== choiceId
      );
      updateResponse(currentQuestionId, { selectedChoice: choiceId, eliminatedChoiceIds: nextEliminated });
    },
    [currentQuestionId, responses, updateResponse]
  );

  const toggleEliminatedChoice = useCallback(
    (choiceId: string) => {
      if (!currentQuestionId) return;
      setResponses((previous) => {
        const current = previous[currentQuestionId] || {
          selectedChoice: null,
          answerText: "",
          flagged: false,
          timeSpentSeconds: null,
          eliminatedChoiceIds: []
        };
        const eliminated = new Set(current.eliminatedChoiceIds);
        if (eliminated.has(choiceId)) eliminated.delete(choiceId);
        else eliminated.add(choiceId);
        return {
          ...previous,
          [currentQuestionId]: {
            ...current,
            eliminatedChoiceIds: Array.from(eliminated)
          }
        };
      });
    },
    [currentQuestionId]
  );

  const responseSnapshot = useCallback(() => {
    return questions.map((question) => {
      const response = responses[question.id] || {
        selectedChoice: null,
        answerText: "",
        flagged: false,
        timeSpentSeconds: null
      };
      return {
        questionId: question.id,
        selectedChoice: response.selectedChoice,
        answerText: response.answerText,
        flagged: response.flagged,
        timeSpentSeconds: response.timeSpentSeconds
      };
    });
  }, [questions, responses]);

  const elapsedSeconds = useCallback(() => {
    return Math.max(
      timerElapsedSeconds || 0,
      (timerElapsedSeconds || 0) + Math.floor((Date.now() - sessionStartedAt) / 1000)
    );
  }, [sessionStartedAt, timerElapsedSeconds]);

  const submit = useCallback(() => {
    startTransition(async () => {
      try {
        if (!questions.length) {
          setSaveStatus("No questions are loaded for this section.");
          setDialog(null);
          return;
        }
        setSaveStatus("Saving...");
        setDirtyQuestionId(null);
        const payload = {
          submissionId: submission.id,
          examId: exam.id,
          timeSpentSeconds: elapsedSeconds(),
          responses: responseSnapshot()
        };
        const result = isSectionedExam
          ? await submitSectionWithResponsesAction(payload)
          : await submitExamWithResponsesAction({
              ...payload,
              startedAt: submission.started_at,
              section: submission.section
            });
        if (result?.error) {
          setSaveStatus(result.error);
          setDialog(null);
        }
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : "Save failed. Please try again.");
        setDialog(null);
      }
    });
  }, [
    elapsedSeconds,
    exam.id,
    isSectionedExam,
    questions.length,
    responseSnapshot,
    submission.id,
    submission.section,
    submission.started_at
  ]);

  const saveAndExit = useCallback(() => {
    setSaveStatus("Saving...");
    startTransition(async () => {
      try {
        setDirtyQuestionId(null);
        const result = await saveExamProgressAction({
          submissionId: submission.id,
          examId: exam.id,
          currentQuestionIndex: clampedCurrentIndex,
          timeSpentSeconds: elapsedSeconds(),
          responses: responseSnapshot()
        });
        if (result?.error) {
          setSaveStatus(result.error);
          setDialog(null);
          return;
        }
        router.push("/dashboard");
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : "Save failed. Please try again.");
        setDialog(null);
      }
    });
  }, [clampedCurrentIndex, elapsedSeconds, exam.id, responseSnapshot, router, submission.id]);

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb]">
        <div className="border-b border-white/60 bg-white/70 shadow-[0_12px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{exam.subject}</p>
              <h1 className="text-lg font-semibold text-ink">{exam.title}</h1>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-xl transition hover:bg-white/90"
            >
              Back to dashboard
            </button>
          </div>
        </div>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-ink">Question not found for this section.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The current section did not return any playable questions. Try refreshing the page or resume from the dashboard.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-xl transition hover:bg-white/90"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb]">
      <div className="sticky top-0 z-20 border-b border-white/60 bg-white/70 shadow-[0_12px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{exam.subject}</p>
            <h1 className="text-lg font-semibold text-ink">{exam.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-500 backdrop-blur-xl">
              <Save className="h-4 w-4" />
              {saveStatus}
            </span>
            <ExamTimer
              startedAt={timerStartedAt}
              initialElapsedSeconds={timerElapsedSeconds}
              timeLimitMinutes={exam.time_limit_minutes}
              onExpire={submit}
            />
            <button
              type="button"
              onClick={() => setDialog("exit")}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-xl transition hover:bg-white/90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save & Exit
            </button>
            <button
              type="button"
              onClick={() => setDialog("submit")}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSectionedExam ? "End Section" : "Submit"}
            </button>
          </div>
        </div>
      </div>
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[96px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <QuestionNavigator
            count={questions.length}
            currentIndex={clampedCurrentIndex}
            answered={answered}
            flagged={flagged}
            onSelect={(index) => setCurrentIndex(Math.min(Math.max(0, index), Math.max(0, questions.length - 1)))}
          />
        </aside>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current section</p>
                <h2 className="mt-1 font-semibold text-ink">{currentSection.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Question {currentSectionPosition} of {currentSection.questionCount} in this section · overall questions {currentSectionRange}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-blue-800 shadow-sm">
                  {currentSection.timeLimitMinutes} min section
                </span>
                <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-blue-800 shadow-sm">
                  {currentSection.calculatorAllowed ? "Calculator allowed" : "No calculator"}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b-4 border-dashed border-ink pb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-2xl font-bold text-white shadow-lg shadow-slate-900/10">
                {clampedCurrentIndex + 1}
              </div>
              <button
                type="button"
                onClick={() =>
                  updateResponse(currentQuestion.id, { flagged: !currentResponse.flagged })
                }
                className={cn(
                  "inline-flex items-center gap-2 text-lg font-medium",
                  currentResponse.flagged ? "text-amber-700" : "text-ink hover:text-brand"
                )}
              >
                <Bookmark className={cn("h-8 w-8", currentResponse.flagged ? "fill-amber-300" : "")} />
                Mark for Review
              </button>
            </div>
            <button
              type="button"
              className="rounded-2xl border-2 border-ink px-3 py-1 text-lg font-bold text-ink"
              aria-label={`${currentQuestion.type.toUpperCase()}, ${currentQuestion.points} point${currentQuestion.points === 1 ? "" : "s"}`}
            >
              {currentQuestion.type === "mcq" ? "ABC" : "FRQ"}
            </button>
          </div>

          <QuestionRenderer question={currentQuestion} />

          <div className="mt-6">
            {currentQuestion.type === "mcq" ? (
              <ChoiceList
                choices={currentQuestion.choices}
                value={currentResponse.selectedChoice}
                multiSelect={isCurrentMultiSelect}
                requiredSelections={currentQuestion.required_selections || currentMaxSelections}
                maxSelections={currentMaxSelections}
                onChange={handleChoiceChange}
                eliminatedChoiceIds={currentResponse.eliminatedChoiceIds}
                onToggleEliminated={toggleEliminatedChoice}
              />
            ) : (
              <FRQAnswerBox
                value={currentResponse.answerText}
                onChange={(value) => updateResponse(currentQuestion.id, { answerText: value })}
                onBlur={() => void persist(currentQuestion.id, responses[currentQuestion.id] || currentResponse)}
              />
            )}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={clampedCurrentIndex === 0}
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
              className="rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={clampedCurrentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
              className="rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </section>
      </main>
      <ExamConfirmDialog
        open={dialog === "exit"}
        title="Save and exit exam?"
        description="Your progress will be saved. You can resume this exam later."
        confirmLabel="Save & Exit"
        confirmClassName="bg-slate-950 text-white shadow-lg shadow-slate-900/15 hover:-translate-y-0.5 hover:shadow-xl"
        pending={isPending}
        onCancel={() => setDialog(null)}
        onConfirm={saveAndExit}
      />
      <ExamConfirmDialog
        open={dialog === "submit"}
        title={isSectionedExam ? "End this section?" : "Submit exam?"}
        description={
          isSectionedExam
            ? "You will not be able to return to this section after submitting it."
            : "You will not be able to edit answers after submitting. Your saved responses will be graded."
        }
        confirmLabel={isSectionedExam ? "Submit Section" : "Submit Exam"}
        confirmClassName={isSectionedExam ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-slate-950 text-white shadow-lg shadow-slate-900/15 hover:-translate-y-0.5 hover:shadow-xl"}
        pending={isPending}
        onCancel={() => setDialog(null)}
        onConfirm={submit}
      />
    </div>
  );
}

function ExamConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmClassName,
  pending,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-[28px] border border-white/60 bg-white/85 p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl">
        <h2 id="exam-dialog-title" className="text-xl font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-3 leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-xl transition hover:bg-white/90 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn("rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-60", confirmClassName)}
          >
            {pending ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
