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
  const questions = useMemo(() => exam.exam_questions.map((row) => row.question), [exam.exam_questions]);
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
        timeSpentSeconds: answer.time_spent_seconds
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
  const currentQuestion = questions[currentIndex];
  const currentSectionIndexes = useMemo(
    () =>
      questions
        .map((question, index) => ({ question, index }))
        .filter((item) => item.question.section === currentQuestion.section)
        .map((item) => item.index),
    [currentQuestion.section, questions]
  );
  const currentSection = useMemo(() => {
    const explicit = exam.sections?.find((section) => section.section === currentQuestion.section);
    return (
      explicit ||
      fallbackSection(
        currentQuestion.section,
        new Set(questions.slice(0, currentIndex + 1).map((question) => question.section)).size,
        currentSectionIndexes.length,
        exam.time_limit_minutes
      )
    );
  }, [currentIndex, currentQuestion.section, currentSectionIndexes.length, exam.sections, exam.time_limit_minutes, questions]);
  const currentSectionProgress = submission.sections_progress?.find(
    (progress) => progress.section === currentSection.section
  );
  const timerStartedAt = currentSectionProgress?.startedAt || submission.started_at;
  const timerElapsedSeconds = currentSectionProgress?.timeSpentSeconds ?? submission.time_spent_seconds;
  const currentSectionPosition = currentSectionIndexes.indexOf(currentIndex) + 1;
  const currentSectionRange =
    currentSectionIndexes.length > 0
      ? `${currentSectionIndexes[0] + 1}-${currentSectionIndexes[currentSectionIndexes.length - 1] + 1}`
      : `${currentIndex + 1}`;
  const isCurrentMultiSelect = currentQuestion.selection_type === "multiple" || currentQuestion.tags.includes("multi-select");
  const currentMaxSelections = isCurrentMultiSelect
    ? currentQuestion.max_selections || currentQuestion.required_selections || 2
    : 1;
  const currentResponse = responses[currentQuestion.id] || {
    selectedChoice: null,
    answerText: "",
    flagged: false,
    timeSpentSeconds: null
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
      const result = await saveAnswerAction({
        submissionId: submission.id,
        questionId,
        selectedChoice: response.selectedChoice,
        answerText: response.answerText,
        flagged: response.flagged,
        timeSpentSeconds: response.timeSpentSeconds
      });
      setSaveStatus(result?.error ? result.error : "All changes saved");
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
        ...patch
      };
      return { ...previous, [questionId]: next };
    });
    setDirtyQuestionId(questionId);
  }, []);

  const handleChoiceChange = useCallback(
    (choiceId: string) => {
      updateResponse(currentQuestion.id, { selectedChoice: choiceId });
    },
    [currentQuestion.id, updateResponse]
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
      const payload = {
        submissionId: submission.id,
        examId: exam.id,
        timeSpentSeconds: elapsedSeconds(),
        responses: responseSnapshot()
      };
      if (isSectionedExam) {
        await submitSectionWithResponsesAction(payload);
      } else {
        await submitExamWithResponsesAction({
          ...payload,
          startedAt: submission.started_at,
          section: submission.section
        });
      }
    });
  }, [
    elapsedSeconds,
    exam.id,
    isSectionedExam,
    responseSnapshot,
    submission.id,
    submission.section,
    submission.started_at
  ]);

  const saveAndExit = useCallback(() => {
    setSaveStatus("Saving...");
    startTransition(async () => {
      const result = await saveExamProgressAction({
        submissionId: submission.id,
        examId: exam.id,
        currentQuestionIndex: currentIndex,
        timeSpentSeconds: elapsedSeconds(),
        responses: responseSnapshot()
      });
      if (result?.error) {
        setSaveStatus(result.error);
        setDialog(null);
        return;
      }
      router.push("/dashboard");
    });
  }, [currentIndex, elapsedSeconds, exam.id, responseSnapshot, router, submission.id]);

  return (
    <div className="min-h-screen bg-paper">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{exam.subject}</p>
            <h1 className="text-lg font-semibold text-ink">{exam.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
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
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save & Exit
            </button>
            <button
              type="button"
              onClick={() => setDialog("submit")}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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
            currentIndex={currentIndex}
            answered={answered}
            flagged={flagged}
            onSelect={setCurrentIndex}
          />
        </aside>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current section</p>
                <h2 className="mt-1 font-semibold text-ink">{currentSection.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Question {currentSectionPosition} of {currentSection.questionCount} in this section · overall questions {currentSectionRange}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white px-3 py-1 text-blue-800 shadow-sm">
                  {currentSection.timeLimitMinutes} min section
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-blue-800 shadow-sm">
                  {currentSection.calculatorAllowed ? "Calculator allowed" : "No calculator"}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b-4 border-dashed border-ink pb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center bg-ink text-2xl font-bold text-white">
                {currentIndex + 1}
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
              className="rounded-md border-2 border-ink px-3 py-1 text-lg font-bold text-ink"
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
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
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
        confirmClassName="bg-brand text-white hover:bg-blue-700"
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
        confirmClassName="bg-brand text-white hover:bg-blue-700"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="exam-dialog-title" className="text-xl font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-3 leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn("rounded-md px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60", confirmClassName)}
          >
            {pending ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
