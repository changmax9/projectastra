"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition
} from "react";
import { useRouter } from "next/navigation";
import * as RadixDialog from "@radix-ui/react-dialog";
import {
  Bookmark,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Highlighter,
  Keyboard,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  MoreVertical,
  RotateCcw,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  completeBluebookSectionAction,
  saveBluebookSectionProgressAction
} from "@/app/actions";
import { MathMarkdown } from "@/components/MathMarkdown";
import { AstraLogo } from "@/components/brand/AstraLogo";
import { BluebookCalculator } from "@/components/bluebook/BluebookCalculator";
import { BluebookTimer } from "@/components/bluebook/BluebookTimer";
import { QuestionImageAsset } from "@/components/exam/QuestionImageAsset";
import type { Answer, ExamAttemptStep, ExamSection, ExamWithQuestions, Question, Submission } from "@/lib/types";
import { cn } from "@/lib/utils";
import styles from "./BluebookExamClient.module.css";

type Overlay =
  | "directions"
  | "questionMenu"
  | "notes"
  | "calculator"
  | "more"
  | "shortcuts"
  | "exit"
  | "submit"
  | "fiveMinute"
  | null;

type ColorTheme = "default" | "cream" | "dark";
type FocusedPane = "prompt" | "response" | null;

interface ResponseState {
  selectedChoice: string | null;
  answerText: string;
  flagged: boolean;
  timeSpentSeconds: number;
  eliminatedChoiceIds: string[];
}

interface SessionState {
  screen: "question" | "review";
  currentIndex: number;
  overlay: Overlay;
  timerHidden: boolean;
  eliminatorEnabled: boolean;
  lineReaderEnabled: boolean;
  zoom: number;
  colorTheme: ColorTheme;
  focusedPane: FocusedPane;
}

interface BluebookTestFlow {
  sectionNumber: number;
  sectionCount: number;
  nextStep: ExamAttemptStep;
  nextSectionTitle: string | null;
}

type SessionAction =
  | { type: "GO_TO_QUESTION"; index: number }
  | { type: "SHOW_REVIEW" }
  | { type: "OPEN"; overlay: Overlay }
  | { type: "CLOSE" }
  | { type: "TOGGLE_TIMER" }
  | { type: "SHOW_TIMER" }
  | { type: "TOGGLE_ELIMINATOR" }
  | { type: "TOGGLE_LINE_READER" }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "SET_THEME"; theme: ColorTheme }
  | { type: "SET_FOCUSED_PANE"; pane: FocusedPane };

const emptyResponse: ResponseState = {
  selectedChoice: null,
  answerText: "",
  flagged: false,
  timeSpentSeconds: 0,
  eliminatedChoiceIds: []
};

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "GO_TO_QUESTION":
      return { ...state, screen: "question", currentIndex: action.index, overlay: null, focusedPane: null };
    case "SHOW_REVIEW":
      return { ...state, screen: "review", overlay: null, focusedPane: null };
    case "OPEN":
      return { ...state, overlay: action.overlay };
    case "CLOSE":
      return { ...state, overlay: null };
    case "TOGGLE_TIMER":
      return { ...state, timerHidden: !state.timerHidden };
    case "SHOW_TIMER":
      return { ...state, timerHidden: false };
    case "TOGGLE_ELIMINATOR":
      return { ...state, eliminatorEnabled: !state.eliminatorEnabled };
    case "TOGGLE_LINE_READER":
      return { ...state, lineReaderEnabled: !state.lineReaderEnabled, overlay: null };
    case "SET_ZOOM":
      return { ...state, zoom: Math.min(140, Math.max(80, action.zoom)), overlay: null };
    case "SET_THEME":
      return { ...state, colorTheme: action.theme, overlay: null };
    case "SET_FOCUSED_PANE":
      return { ...state, focusedPane: action.pane };
    default:
      return state;
  }
}

function fallbackSection(exam: ExamWithQuestions, questions: Question[]): ExamSection {
  const section = questions[0]?.section || exam.section || "Section";
  return {
    id: section.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    section,
    title: section,
    questionCount: questions.length,
    timeLimitMinutes: exam.time_limit_minutes,
    calculatorAllowed: Boolean(/math|calculus|physics|chemistry|statistics/i.test(exam.subject)),
    order: 1
  };
}

function isAnswered(question: Question, response: ResponseState | undefined) {
  if (!response) return false;
  if (question.type === "frq") return Boolean(response.answerText.trim());
  return Boolean(response.selectedChoice?.trim());
}

function sectionDirections(section: ExamSection, questionType: Question["type"]) {
  if (questionType === "frq") {
    return (
      <>
        <h2>{section.title}: {section.questionCount} Questions</h2>
        <ul>
          <li>Read every question and all of its parts carefully.</li>
          <li>Clearly label each part and support your response with evidence, calculations, or reasoning.</li>
          <li>You may move back and forth between questions until time expires.</li>
          <li>Once the next section begins, you cannot return to these questions.</li>
        </ul>
      </>
    );
  }

  return (
    <>
      <h2>{section.title}: {section.questionCount} Questions</h2>
      <ul>
        <li>Read each question carefully, including any passage, diagram, table, or graph.</li>
        <li>Choose the best answer from the choices provided.</li>
        <li>You may move back and forth between questions until time expires.</li>
        <li>Once the next section begins, you cannot return to these questions.</li>
      </ul>
      <p>{section.calculatorAllowed ? "A calculator is available in the testing tools." : "A calculator is not permitted in this section."}</p>
    </>
  );
}

function toSelectedSet(value: string | null) {
  return new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

export function BluebookExamClient({
  exam,
  submission,
  initialAnswers,
  studentName,
  testFlow
}: {
  exam: ExamWithQuestions;
  submission: Submission;
  initialAnswers: Answer[];
  studentName: string;
  testFlow: BluebookTestFlow;
}) {
  const router = useRouter();
  const questions = useMemo(
    () => exam.exam_questions.map((row) => row.question).filter(Boolean),
    [exam.exam_questions]
  );
  const section = useMemo(
    () => exam.sections?.[0] || fallbackSection(exam, questions),
    [exam, questions]
  );
  const initialIndex = Math.min(
    Math.max(0, submission.current_question_index || 0),
    Math.max(0, questions.length - 1)
  );
  const activeQuestionIds = useMemo(() => new Set(questions.map((question) => question.id)), [questions]);
  const hasExistingWork = initialAnswers.some((answer) =>
    activeQuestionIds.has(answer.question_id) &&
    Boolean(answer.selected_choice || answer.answer_text?.trim() || answer.flagged || answer.eliminated_choice_ids?.length)
  );
  const currentProgress = submission.sections_progress?.find((progress) => progress.section === section.section);
  const initialElapsedSeconds = currentProgress?.timeSpentSeconds ?? submission.time_spent_seconds ?? 0;
  const timerStorageKey = `astra-timer:${submission.id}:${section.section}`;

  const [session, dispatch] = useReducer(sessionReducer, {
    screen: "question",
    currentIndex: initialIndex,
    overlay: initialIndex === 0 && !hasExistingWork ? "directions" : null,
    timerHidden: false,
    eliminatorEnabled: false,
    lineReaderEnabled: false,
    zoom: 100,
    colorTheme: "default",
    focusedPane: null
  });
  const [responses, setResponses] = useState<Record<string, ResponseState>>(() => {
    const initial: Record<string, ResponseState> = {};
    for (const answer of initialAnswers) {
      if (!activeQuestionIds.has(answer.question_id)) continue;
      initial[answer.question_id] = {
        selectedChoice: answer.selected_choice,
        answerText: answer.answer_text || "",
        flagged: answer.flagged,
        timeSpentSeconds: answer.time_spent_seconds || 0,
        eliminatedChoiceIds: answer.eliminated_choice_ids || []
      };
    }
    return initial;
  });
  const [notesByQuestion, setNotesByQuestion] = useState<Record<string, string>>({});
  const [highlightColor, setHighlightColor] = useState<"yellow" | "blue" | "pink">("yellow");
  const [dirtyQuestionVersions, setDirtyQuestionVersions] = useState<Record<string, number>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lineReaderY, setLineReaderY] = useState(260);
  const [isPending, startTransition] = useTransition();
  const questionEnteredAtRef = useRef(Date.now());
  const sectionElapsedBaselineRef = useRef(Math.max(0, initialElapsedSeconds));
  const sectionBaselineAtRef = useRef(Date.now());
  const submittingRef = useRef(false);
  const automaticSubmissionRef = useRef(false);
  const responsesRef = useRef(responses);
  const sessionRef = useRef(session);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const contentRootRef = useRef<HTMLDivElement>(null);
  const highlightRangesRef = useRef<Record<string, Range[]>>({ yellow: [], blue: [], pink: [] });
  responsesRef.current = responses;
  sessionRef.current = session;

  const currentQuestion = questions[session.currentIndex] || null;
  const currentResponse = currentQuestion ? responses[currentQuestion.id] || emptyResponse : emptyResponse;
  const answeredIndexes = useMemo(() => {
    const result = new Set<number>();
    questions.forEach((question, index) => {
      if (isAnswered(question, responses[question.id])) result.add(index);
    });
    return result;
  }, [questions, responses]);
  const flaggedIndexes = useMemo(() => {
    const result = new Set<number>();
    questions.forEach((question, index) => {
      if (responses[question.id]?.flagged) result.add(index);
    });
    return result;
  }, [questions, responses]);
  const unansweredCount = Math.max(0, questions.length - answeredIndexes.size);

  const updateResponse = useCallback((questionId: string, patch: Partial<ResponseState>) => {
    setResponses((previous) => ({
      ...previous,
      [questionId]: { ...(previous[questionId] || emptyResponse), ...patch }
    }));
    setDirtyQuestionVersions((current) => ({
      ...current,
      [questionId]: (current[questionId] || 0) + 1
    }));
  }, []);

  const commitCurrentQuestionTime = useCallback(() => {
    if (!currentQuestion) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - questionEnteredAtRef.current) / 1000));
    if (elapsed > 0) {
      setResponses((previous) => {
        const current = previous[currentQuestion.id] || emptyResponse;
        return {
          ...previous,
          [currentQuestion.id]: {
            ...current,
            timeSpentSeconds: current.timeSpentSeconds + elapsed
          }
        };
      });
      setDirtyQuestionVersions((current) => ({
        ...current,
        [currentQuestion.id]: (current[currentQuestion.id] || 0) + 1
      }));
    }
    questionEnteredAtRef.current = Date.now();
  }, [currentQuestion]);

  useEffect(() => {
    questionEnteredAtRef.current = Date.now();
  }, [session.currentIndex, session.screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.overlay) {
        dispatch({ type: "CLOSE" });
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        if (event.altKey && event.key.toLowerCase() === "t") {
          event.preventDefault();
          dispatch({ type: "TOGGLE_TIMER" });
        }
        if (event.altKey && event.key.toLowerCase() === "g") {
          event.preventDefault();
          dispatch({ type: "OPEN", overlay: "questionMenu" });
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          dispatch({ type: "SET_ZOOM", zoom: session.zoom + 10 });
        }
        if (event.key === "-") {
          event.preventDefault();
          dispatch({ type: "SET_ZOOM", zoom: session.zoom - 10 });
        }
        if (event.key === "0") {
          event.preventDefault();
          dispatch({ type: "SET_ZOOM", zoom: 100 });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session.overlay, session.zoom]);

  const goToQuestion = useCallback((index: number) => {
    commitCurrentQuestionTime();
    const nextIndex = Math.min(Math.max(0, index), Math.max(0, questions.length - 1));
    dispatch({ type: "GO_TO_QUESTION", index: nextIndex });
  }, [commitCurrentQuestionTime, questions.length]);

  const goNext = useCallback(() => {
    if (session.currentIndex >= questions.length - 1) {
      commitCurrentQuestionTime();
      dispatch({ type: "SHOW_REVIEW" });
      return;
    }
    goToQuestion(session.currentIndex + 1);
  }, [commitCurrentQuestionTime, goToQuestion, questions.length, session.currentIndex]);

  useEffect(() => {
    const now = Date.now();
    const localElapsed = sectionElapsedBaselineRef.current
      + Math.max(0, Math.floor((now - sectionBaselineAtRef.current) / 1000));
    const storedElapsed = typeof window === "undefined"
      ? 0
      : Number(window.sessionStorage.getItem(timerStorageKey) || "0");
    sectionElapsedBaselineRef.current = Math.max(
      localElapsed,
      initialElapsedSeconds,
      Number.isFinite(storedElapsed) ? storedElapsed : 0
    );
    sectionBaselineAtRef.current = now;
  }, [initialElapsedSeconds, timerStorageKey]);

  const sectionElapsedSeconds = useCallback(() => {
    const storedElapsed = typeof window === "undefined"
      ? 0
      : Number(window.sessionStorage.getItem(timerStorageKey) || "0");
    const localElapsed = sectionElapsedBaselineRef.current
      + Math.max(0, Math.floor((Date.now() - sectionBaselineAtRef.current) / 1000));
    return Math.max(localElapsed, Number.isFinite(storedElapsed) ? storedElapsed : 0);
  }, [timerStorageKey]);

  const responseSnapshot = useCallback(() => {
    const latestSession = sessionRef.current;
    const latestResponses = responsesRef.current;
    const activeQuestion = questions[latestSession.currentIndex] || null;
    const activeElapsed = activeQuestion && latestSession.screen === "question"
      ? Math.max(0, Math.floor((Date.now() - questionEnteredAtRef.current) / 1000))
      : 0;
    return questions.map((question) => {
      const response = latestResponses[question.id] || emptyResponse;
      return {
        questionId: question.id,
        selectedChoice: response.selectedChoice,
        answerText: response.answerText,
        flagged: response.flagged,
        timeSpentSeconds: response.timeSpentSeconds + (question.id === activeQuestion?.id ? activeElapsed : 0),
        eliminatedChoiceIds: response.eliminatedChoiceIds
      };
    });
  }, [questions]);

  const queueProgressSave = useCallback(() => {
    const request = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (submittingRef.current) return { ok: true, ignored: true };
        const result = await saveBluebookSectionProgressAction({
          submissionId: submission.id,
          expectedSectionIndex: testFlow.sectionNumber - 1,
          currentQuestionIndex: sessionRef.current.currentIndex,
          timeSpentSeconds: sectionElapsedSeconds(),
          responses: responseSnapshot()
        });
        setSyncError(result?.error || null);
        return result;
      })
      .catch(() => {
        const error = "Your progress could not be synced. Check your connection and try again.";
        setSyncError(error);
        return { error };
      });
    saveQueueRef.current = request.then(() => undefined, () => undefined);
    return request;
  }, [responseSnapshot, sectionElapsedSeconds, submission.id, testFlow.sectionNumber]);

  useEffect(() => {
    const dirtyEntries = Object.entries(dirtyQuestionVersions);
    if (!dirtyEntries.length) return;
    const timeout = window.setTimeout(async () => {
      const result = await queueProgressSave();
      if (result?.error) return;
      setDirtyQuestionVersions((current) => {
        const next = { ...current };
        for (const [questionId, version] of dirtyEntries) {
          if (next[questionId] === version) delete next[questionId];
        }
        return next;
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [dirtyQuestionVersions, queueProgressSave]);

  useEffect(() => {
    const interval = window.setInterval(() => void queueProgressSave(), 10_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void queueProgressSave();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [queueProgressSave]);

  const exitPractice = useCallback(() => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        await saveQueueRef.current;
        const result = await saveBluebookSectionProgressAction({
          submissionId: submission.id,
          expectedSectionIndex: testFlow.sectionNumber - 1,
          currentQuestionIndex: sessionRef.current.currentIndex,
          timeSpentSeconds: sectionElapsedSeconds(),
          responses: responseSnapshot()
        });
        if (result?.error) {
          submittingRef.current = false;
          setSyncError(result.error);
          dispatch({ type: "CLOSE" });
          return;
        }
        router.push("/dashboard");
      } catch {
        submittingRef.current = false;
        setSyncError("Your progress could not be saved. Please try again.");
        dispatch({ type: "CLOSE" });
      }
    });
  }, [responseSnapshot, router, sectionElapsedSeconds, submission.id, testFlow.sectionNumber]);

  const finishSection = useCallback((automatic = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    automaticSubmissionRef.current = automatic;
    startTransition(async () => {
      try {
        await saveQueueRef.current;
        const result = await completeBluebookSectionAction({
          submissionId: submission.id,
          expectedSectionIndex: testFlow.sectionNumber - 1,
          timeSpentSeconds: sectionElapsedSeconds(),
          responses: responseSnapshot()
        });
        if (result?.error) {
          submittingRef.current = false;
          automaticSubmissionRef.current = false;
          setSyncError(result.error);
          dispatch({ type: "CLOSE" });
          return;
        }
        if (result.completed) {
          window.sessionStorage.removeItem(timerStorageKey);
          router.replace(`/results/${result.submissionId}?submitted=1`);
          return;
        }
        window.sessionStorage.removeItem(timerStorageKey);
        dispatch({ type: "CLOSE" });
        router.refresh();
      } catch {
        submittingRef.current = false;
        automaticSubmissionRef.current = false;
        setSyncError("This section could not be submitted. Please try again.");
        dispatch({ type: "CLOSE" });
      }
    });
  }, [responseSnapshot, router, sectionElapsedSeconds, submission.id, testFlow.sectionNumber, timerStorageKey]);

  const applyHighlight = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !contentRootRef.current) return;
    const range = selection.getRangeAt(0).cloneRange();
    const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer as Element;
    if (!ancestor || !contentRootRef.current.contains(ancestor)) return;

    const highlightRegistry = (CSS as typeof CSS & {
      highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void };
    }).highlights;
    const HighlightConstructor = (window as typeof window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!highlightRegistry || !HighlightConstructor) return;

    highlightRangesRef.current[highlightColor].push(range);
    highlightRegistry.set(
      `bb-${highlightColor}`,
      new HighlightConstructor(...highlightRangesRef.current[highlightColor])
    );
    selection.removeAllRanges();
  }, [highlightColor]);

  const clearHighlights = useCallback(() => {
    const highlightRegistry = (CSS as typeof CSS & {
      highlights?: { delete: (name: string) => void };
    }).highlights;
    (Object.keys(highlightRangesRef.current) as Array<keyof typeof highlightRangesRef.current>).forEach((color) => {
      highlightRegistry?.delete(`bb-${color}`);
      highlightRangesRef.current[color] = [];
    });
  }, []);

  if (!currentQuestion) {
    return (
      <main className={styles.emptyState}>
        <h1>No questions are available in this section.</h1>
        <button type="button" onClick={() => router.push("/dashboard")}>Return to Dashboard</button>
      </main>
    );
  }

  const themeClass = session.colorTheme === "cream"
    ? styles.creamTheme
    : session.colorTheme === "dark"
      ? styles.darkTheme
      : "";
  const sectionLabel = `Section ${testFlow.sectionNumber} of ${testFlow.sectionCount}: ${section.title}`;
  const isFinalSection = testFlow.nextStep === "completed";
  const continueLabel = isFinalSection
    ? "Submit Test"
    : testFlow.nextStep === "break"
      ? "Start Break"
      : "Continue Test";
  const submitDialogTitle = isFinalSection
    ? "Submit This Test?"
    : testFlow.nextStep === "break"
      ? "Finish Multiple Choice?"
      : "Continue to the Next Section?";

  return (
    <main
      className={cn(styles.app, themeClass)}
      onMouseMove={(event) => {
        if (session.lineReaderEnabled) setLineReaderY(event.clientY - 24);
      }}
    >
      <div className={styles.brandBar}><AstraLogo /> <span>Astra Exams</span></div>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.sectionControl}
          onClick={() => dispatch({ type: "OPEN", overlay: session.overlay === "directions" ? null : "directions" })}
          aria-expanded={session.overlay === "directions"}
        >
          <span>{sectionLabel}</span>
          <span className={styles.directionsLabel}>
            Directions {session.overlay === "directions" ? <ChevronUp /> : <ChevronDown />}
          </span>
        </button>

        <BluebookTimer
          className={styles.timer}
          initialElapsedSeconds={initialElapsedSeconds}
          timeLimitMinutes={section.timeLimitMinutes || exam.time_limit_minutes}
          storageKey={timerStorageKey}
          hidden={session.timerHidden}
          onToggle={() => dispatch({ type: "TOGGLE_TIMER" })}
          onFiveMinutes={() => {
            dispatch({ type: "SHOW_TIMER" });
            dispatch({ type: "OPEN", overlay: "fiveMinute" });
          }}
          onExpire={() => finishSection(true)}
        />

        <nav className={styles.tools} aria-label="Testing tools">
          {section.calculatorAllowed ? (
            <button type="button" aria-label="Calculator" onClick={() => dispatch({ type: "OPEN", overlay: "calculator" })}>
              <Calculator aria-hidden="true" />
              <span>Calculator</span>
            </button>
          ) : null}
          <button type="button" aria-label="Highlights and notes" onClick={() => dispatch({ type: "OPEN", overlay: "notes" })}>
            <Highlighter aria-hidden="true" />
            <span>Annotate</span>
          </button>
          <button type="button" aria-label="More" onClick={() => dispatch({ type: "OPEN", overlay: "more" })}>
            <MoreVertical aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </header>
      <div className={styles.testStripe} />

      {syncError ? (
        <div className={styles.syncError} role="alert">
          <span>{syncError}</span>
          <button type="button" onClick={() => setSyncError(null)} aria-label="Dismiss message"><X /></button>
        </div>
      ) : null}

      {session.screen === "question" ? (
        <div
          ref={contentRootRef}
          className={cn(
            styles.workspace,
            session.focusedPane === "prompt" && styles.promptFocused,
            session.focusedPane === "response" && styles.responseFocused
          )}
          style={{ "--bb-zoom": session.zoom / 100 } as React.CSSProperties}
        >
          <section className={styles.promptPane} aria-label="Question content">
            <button
              type="button"
              className={styles.expandControl}
              onClick={() => dispatch({
                type: "SET_FOCUSED_PANE",
                pane: session.focusedPane === "prompt" ? null : "prompt"
              })}
              aria-label={session.focusedPane === "prompt" ? "Restore split view" : "Expand question content"}
            >
              {session.focusedPane === "prompt" ? <Minimize2 /> : <Maximize2 />}
            </button>
            <div className={styles.promptContent}>
              <MathMarkdown content={currentQuestion.question_text} className={styles.questionText} />
              {currentQuestion.question_images.length ? (
                <div className={styles.questionImages}>
                  {currentQuestion.question_images.map((image) => (
                    <figure key={image.id}>
                      <QuestionImageAsset src={image.url} alt={image.alt || image.caption || "Question image"} />
                      {image.caption ? <figcaption>{image.caption}</figcaption> : null}
                    </figure>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.responsePane} aria-label="Response area">
            <button
              type="button"
              className={styles.expandControl}
              onClick={() => dispatch({
                type: "SET_FOCUSED_PANE",
                pane: session.focusedPane === "response" ? null : "response"
              })}
              aria-label={session.focusedPane === "response" ? "Restore split view" : "Expand response area"}
            >
              {session.focusedPane === "response" ? <Minimize2 /> : <Maximize2 />}
            </button>
            <div className={styles.questionHeader}>
              <span className={styles.questionNumber}>{session.currentIndex + 1}</span>
              <button
                type="button"
                className={cn(styles.reviewButton, currentResponse.flagged && styles.reviewButtonActive)}
                onClick={() => updateResponse(currentQuestion.id, { flagged: !currentResponse.flagged })}
                aria-pressed={currentResponse.flagged}
              >
                <Bookmark className={currentResponse.flagged ? styles.bookmarkFilled : ""} aria-hidden="true" />
                <span>Mark for Review</span>
              </button>
              {currentQuestion.type === "mcq" ? (
                <button
                  type="button"
                  className={cn(styles.eliminatorToggle, session.eliminatorEnabled && styles.eliminatorToggleActive)}
                  onClick={() => dispatch({ type: "TOGGLE_ELIMINATOR" })}
                  aria-pressed={session.eliminatorEnabled}
                  aria-label="Toggle option eliminator"
                >
                  <span>ABC</span>
                </button>
              ) : null}
            </div>

            <div className={styles.responseContent}>
              {currentQuestion.type === "mcq" ? (
                <BluebookChoices
                  question={currentQuestion}
                  response={currentResponse}
                  eliminatorEnabled={session.eliminatorEnabled}
                  onSelectedChoice={(selectedChoice) => updateResponse(currentQuestion.id, { selectedChoice })}
                  onToggleEliminated={(choiceId) => {
                    const eliminated = new Set(currentResponse.eliminatedChoiceIds);
                    if (eliminated.has(choiceId)) eliminated.delete(choiceId);
                    else eliminated.add(choiceId);
                    updateResponse(currentQuestion.id, { eliminatedChoiceIds: Array.from(eliminated) });
                  }}
                />
              ) : (
                <div className={styles.frqResponse}>
                  <label htmlFor={`response-${currentQuestion.id}`}>Your Response</label>
                  <textarea
                    id={`response-${currentQuestion.id}`}
                    value={currentResponse.answerText}
                    onChange={(event) => updateResponse(currentQuestion.id, { answerText: event.target.value })}
                    placeholder="Type your response here."
                    spellCheck="true"
                  />
                  <span>{currentResponse.answerText.trim() ? currentResponse.answerText.trim().split(/\s+/).length : 0} words</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <BluebookReviewScreen
          sectionLabel={sectionLabel}
          questions={questions}
          currentIndex={session.currentIndex}
          answered={answeredIndexes}
          flagged={flaggedIndexes}
          onSelect={goToQuestion}
        />
      )}

      <div className={styles.testStripe} />
      <footer className={styles.footer}>
        <span className={styles.studentName}>{studentName}</span>
        <div className={styles.footerNavigation}>
          {session.screen === "question" ? (
            <>
              <button
                type="button"
                className={cn(styles.navButton, styles.backButton)}
                onClick={() => goToQuestion(session.currentIndex - 1)}
                disabled={session.currentIndex === 0}
                aria-label="Previous question"
              >
                <ChevronLeft aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                className={styles.questionMenuButton}
                onClick={() => dispatch({ type: "OPEN", overlay: "questionMenu" })}
                aria-label={`Open question menu. Question ${session.currentIndex + 1} of ${questions.length}`}
              >
                Question {session.currentIndex + 1} of {questions.length} <ChevronUp aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn(styles.navButton, styles.nextButton)}
                onClick={goNext}
                aria-label={session.currentIndex === questions.length - 1 ? "Review this section" : "Next question"}
              >
                {session.currentIndex === questions.length - 1 ? "Review" : "Next"}
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={cn(styles.navButton, styles.backButton)} onClick={() => goToQuestion(session.currentIndex)} aria-label="Back to questions">
                <ChevronLeft aria-hidden="true" /> Back to Questions
              </button>
              <span className={styles.reviewSummary}>{unansweredCount} unanswered</span>
              <button
                type="button"
                className={cn(styles.navButton, styles.nextButton)}
                onClick={() => dispatch({ type: "OPEN", overlay: "submit" })}
                aria-label={continueLabel}
              >
                {continueLabel} <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </footer>

      {session.lineReaderEnabled ? (
        <div className={styles.lineReader} style={{ top: lineReaderY }} aria-hidden="true" />
      ) : null}

      {session.overlay === "directions" ? (
        <div className={styles.directionsBackdrop} onMouseDown={() => dispatch({ type: "CLOSE" })}>
          <section className={styles.directionsPanel} onMouseDown={(event) => event.stopPropagation()} aria-label="Section directions">
            <div className={styles.directionsContent}>
              {sectionDirections(section, currentQuestion.type)}
            </div>
            <button type="button" className={styles.closeDirections} onClick={() => dispatch({ type: "CLOSE" })}>Continue</button>
          </section>
        </div>
      ) : null}

      {session.overlay === "questionMenu" ? (
        <BluebookDialog title={`${sectionLabel} Questions`} onClose={() => dispatch({ type: "CLOSE" })} wide>
          <QuestionGrid
            questions={questions}
            currentIndex={session.currentIndex}
            answered={answeredIndexes}
            flagged={flaggedIndexes}
            onSelect={goToQuestion}
          />
        </BluebookDialog>
      ) : null}

      {session.overlay === "notes" ? (
        <FloatingTool title="Highlights & Notes" onClose={() => dispatch({ type: "CLOSE" })}>
          <div className={styles.highlightControls}>
            <div className={styles.colorSwatches} role="group" aria-label="Highlight color">
              {(["yellow", "blue", "pink"] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(styles.swatch, styles[`${color}Swatch`], highlightColor === color && styles.swatchActive)}
                  onClick={() => setHighlightColor(color)}
                  aria-label={`${color} highlight`}
                  aria-pressed={highlightColor === color}
                />
              ))}
            </div>
            <div className={styles.annotationActions}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={applyHighlight}>
                <Highlighter /> Highlight
              </button>
              <button type="button" onClick={clearHighlights}><RotateCcw /> Clear</button>
            </div>
            <label htmlFor="bluebook-note">Note for Question {session.currentIndex + 1}</label>
            <textarea
              id="bluebook-note"
              value={notesByQuestion[currentQuestion.id] || ""}
              onChange={(event) => setNotesByQuestion((previous) => ({ ...previous, [currentQuestion.id]: event.target.value }))}
              placeholder="Add a note"
            />
          </div>
        </FloatingTool>
      ) : null}

      {session.overlay === "calculator" ? (
        <FloatingTool title="Calculator" onClose={() => dispatch({ type: "CLOSE" })} large>
          <BluebookCalculator />
        </FloatingTool>
      ) : null}

      {session.overlay === "more" ? (
        <div className={styles.moreMenu} role="menu">
          {section.calculatorAllowed ? (
            <button type="button" onClick={() => dispatch({ type: "OPEN", overlay: "calculator" })} role="menuitem">
              <Calculator /> <span>Calculator</span>
            </button>
          ) : null}
          <button type="button" onClick={() => dispatch({ type: "OPEN", overlay: "notes" })} role="menuitem">
            <Highlighter /> <span>Highlights & Notes</span>
          </button>
          <button type="button" onClick={() => dispatch({ type: "TOGGLE_LINE_READER" })} role="menuitem">
            <ScanLine /> <span>{session.lineReaderEnabled ? "Turn Off" : "Turn On"} Line Reader</span>
          </button>
          <button type="button" onClick={() => dispatch({ type: "SET_ZOOM", zoom: session.zoom + 10 })} role="menuitem">
            <ZoomIn /> <span>Zoom In</span><kbd>{session.zoom}%</kbd>
          </button>
          <button type="button" onClick={() => dispatch({ type: "SET_ZOOM", zoom: session.zoom - 10 })} role="menuitem">
            <ZoomOut /> <span>Zoom Out</span>
          </button>
          <div className={styles.themePicker}>
            <span>Color Theme</span>
            <div>
              <button type="button" className={styles.defaultThemeSwatch} onClick={() => dispatch({ type: "SET_THEME", theme: "default" })} aria-label="Default color theme" />
              <button type="button" className={styles.creamThemeSwatch} onClick={() => dispatch({ type: "SET_THEME", theme: "cream" })} aria-label="Cream color theme" />
              <button type="button" className={styles.darkThemeSwatch} onClick={() => dispatch({ type: "SET_THEME", theme: "dark" })} aria-label="Dark color theme" />
            </div>
          </div>
          <button type="button" onClick={() => dispatch({ type: "OPEN", overlay: "shortcuts" })} role="menuitem">
            <Keyboard /> <span>Keyboard Shortcuts</span>
          </button>
          <button type="button" onClick={() => dispatch({ type: "OPEN", overlay: "exit" })} role="menuitem">
            <LogOut /> <span>Exit Practice</span>
          </button>
        </div>
      ) : null}

      {session.overlay === "shortcuts" ? (
        <BluebookDialog title="Keyboard Shortcuts" onClose={() => dispatch({ type: "CLOSE" })}>
          <dl className={styles.shortcuts}>
            <div><dt>Show or hide timer</dt><dd>Ctrl/⌘ + Alt + T</dd></div>
            <div><dt>Open question menu</dt><dd>Ctrl/⌘ + Alt + G</dd></div>
            <div><dt>Zoom in</dt><dd>Ctrl/⌘ + Plus</dd></div>
            <div><dt>Zoom out</dt><dd>Ctrl/⌘ + Minus</dd></div>
            <div><dt>Reset zoom</dt><dd>Ctrl/⌘ + 0</dd></div>
          </dl>
        </BluebookDialog>
      ) : null}

      {session.overlay === "fiveMinute" ? (
        <BluebookDialog title="5 Minutes Remaining" onClose={() => dispatch({ type: "CLOSE" })}>
          <p className={styles.dialogCopy}>You have 5 minutes left in this section. The timer will stay visible.</p>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.primaryDialogButton} onClick={() => dispatch({ type: "CLOSE" })}>OK</button>
          </div>
        </BluebookDialog>
      ) : null}

      {session.overlay === "exit" ? (
        <BluebookDialog title="Exit This Practice Test?" onClose={() => dispatch({ type: "CLOSE" })}>
          <p className={styles.dialogCopy}>Your answers and current place will be saved. You can resume this test from your dashboard.</p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => dispatch({ type: "CLOSE" })} disabled={isPending}>Cancel</button>
            <button type="button" className={styles.primaryDialogButton} onClick={exitPractice} disabled={isPending}>
              {isPending ? "Saving..." : "Save and Exit"}
            </button>
          </div>
        </BluebookDialog>
      ) : null}

      {session.overlay === "submit" ? (
        <BluebookDialog title={submitDialogTitle} onClose={() => dispatch({ type: "CLOSE" })}>
          <p className={styles.dialogCopy}>
            {isFinalSection
              ? "This submits your entire test."
              : testFlow.nextStep === "break"
                ? "Your multiple-choice sections are complete. A scheduled break begins next, followed by free response."
                : `Your test continues directly to ${testFlow.nextSectionTitle || "the next section"}.`}{" "}
            You cannot return to this section after continuing. {unansweredCount ? `${unansweredCount} question${unansweredCount === 1 ? " is" : "s are"} unanswered.` : "All questions have an answer."}
          </p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => dispatch({ type: "CLOSE" })} disabled={isPending}>Keep Working</button>
            <button type="button" className={styles.primaryDialogButton} onClick={() => finishSection(false)} disabled={isPending}>
              {isPending ? "Continuing..." : continueLabel}
            </button>
          </div>
        </BluebookDialog>
      ) : null}

      {isPending && automaticSubmissionRef.current ? (
        <div className={styles.submittingOverlay} role="status">
          <div>{isFinalSection ? "Time is up. Submitting your test..." : "Time is up. Continuing your test..."}</div>
        </div>
      ) : null}
    </main>
  );
}

function BluebookChoices({
  question,
  response,
  eliminatorEnabled,
  onSelectedChoice,
  onToggleEliminated
}: {
  question: Question;
  response: ResponseState;
  eliminatorEnabled: boolean;
  onSelectedChoice: (value: string | null) => void;
  onToggleEliminated: (choiceId: string) => void;
}) {
  const selected = toSelectedSet(response.selectedChoice);
  const eliminated = new Set(response.eliminatedChoiceIds);
  const multiSelect = question.selection_type === "multiple" || question.tags.includes("multi-select");
  const maxSelections = question.max_selections || question.required_selections || 2;

  return (
    <div className={styles.choices}>
      {multiSelect ? <p className={styles.multiSelectInstruction}>Select {question.required_selections || maxSelections} answers.</p> : null}
      {question.choices.map((choice) => {
        const isSelected = selected.has(choice.id);
        const isEliminated = eliminated.has(choice.id);
        const text = choice.text.trim();
        const showText = text && !(choice.image_url && /^Option [A-E]$/i.test(text));
        return (
          <div key={choice.id} className={cn(styles.choiceRow, isSelected && styles.choiceSelected, isEliminated && styles.choiceEliminated)}>
            <button
              type="button"
              className={styles.choiceButton}
              aria-pressed={isSelected}
              aria-label={`Option ${choice.id}: ${choice.text || `Choice ${choice.id}`}`}
              onClick={() => {
                if (!multiSelect) {
                  onSelectedChoice(choice.id);
                  return;
                }
                const next = new Set(selected);
                if (next.has(choice.id)) next.delete(choice.id);
                else if (next.size < maxSelections) next.add(choice.id);
                const ordered = question.choices.map((item) => item.id).filter((id) => next.has(id));
                onSelectedChoice(ordered.length ? ordered.join(",") : null);
              }}
            >
              <span className={styles.choiceLetter}>{choice.id}</span>
              <span className={styles.choiceContent}>
                {showText ? <MathMarkdown content={choice.text} /> : null}
                {choice.image_url ? <QuestionImageAsset src={choice.image_url} alt={`Choice ${choice.id}`} /> : null}
              </span>
            </button>
            {eliminatorEnabled ? (
              <button
                type="button"
                className={styles.eliminateButton}
                onClick={() => onToggleEliminated(choice.id)}
                aria-label={isEliminated ? `Restore option ${choice.id}` : `Eliminate option ${choice.id}`}
              >
                {isEliminated ? <RotateCcw /> : <X />}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BluebookReviewScreen({
  sectionLabel,
  questions,
  currentIndex,
  answered,
  flagged,
  onSelect
}: {
  sectionLabel: string;
  questions: Question[];
  currentIndex: number;
  answered: Set<number>;
  flagged: Set<number>;
  onSelect: (index: number) => void;
}) {
  return (
    <section className={styles.reviewScreen}>
      <div className={styles.reviewIntro}>
        <span>{sectionLabel}</span>
        <h1>Check Your Work</h1>
        <p>You can review your answers in this section. Once you submit, you will not be able to return.</p>
      </div>
      <QuestionGrid questions={questions} currentIndex={currentIndex} answered={answered} flagged={flagged} onSelect={onSelect} />
    </section>
  );
}

function QuestionGrid({
  questions,
  currentIndex,
  answered,
  flagged,
  onSelect
}: {
  questions: Question[];
  currentIndex: number;
  answered: Set<number>;
  flagged: Set<number>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className={styles.questionGridWrap}>
      <div className={styles.questionLegend}>
        <span><i className={styles.legendCurrent} /> Current</span>
        <span><i className={styles.legendAnswered} /> Answered</span>
        <span><Bookmark /> Marked for Review</span>
      </div>
      <div className={styles.questionGrid}>
        {questions.map((question, index) => (
          <button
            key={question.id}
            type="button"
            className={cn(
              answered.has(index) && styles.gridAnswered,
              currentIndex === index && styles.gridCurrent
            )}
            onClick={() => onSelect(index)}
            aria-label={`Question ${index + 1}${answered.has(index) ? ", answered" : ", unanswered"}${flagged.has(index) ? ", marked for review" : ""}`}
          >
            {index + 1}
            {flagged.has(index) ? <Bookmark className={styles.gridBookmark} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function BluebookDialog({
  title,
  children,
  onClose,
  wide = false
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.dialogBackdrop} />
        <RadixDialog.Content className={cn(styles.dialog, wide && styles.dialogWide)}>
          <header>
            <RadixDialog.Title>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button type="button" aria-label="Close"><X /></button>
            </RadixDialog.Close>
          </header>
          <div className={styles.dialogBody}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function FloatingTool({
  title,
  children,
  onClose,
  large = false
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  large?: boolean;
}) {
  return (
    <section className={cn(styles.floatingTool, large && styles.floatingToolLarge)} role="dialog" aria-label={title}>
      <header>
        <Menu aria-hidden="true" />
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close"><X /></button>
      </header>
      <div className={styles.floatingToolBody}>{children}</div>
    </section>
  );
}
