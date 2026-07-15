import type { ExamAttemptStep } from "@/lib/types";

export type ExamSectionFamily = "mcq" | "frq";

export interface ExamSectionTransition {
  nextSectionIndex: number;
  nextStep: ExamAttemptStep;
  shouldStartBreak: boolean;
  isTestComplete: boolean;
}

export function resolveExamSectionTransition(input: {
  currentSectionIndex: number;
  sectionFamilies: ExamSectionFamily[];
  breakAlreadyHandled: boolean;
}): ExamSectionTransition {
  const currentSectionIndex = Math.min(
    Math.max(0, Math.floor(input.currentSectionIndex || 0)),
    Math.max(0, input.sectionFamilies.length - 1)
  );
  const hasNextSection = currentSectionIndex + 1 < input.sectionFamilies.length;
  if (!hasNextSection) {
    return {
      nextSectionIndex: currentSectionIndex,
      nextStep: "completed",
      shouldStartBreak: false,
      isTestComplete: true
    };
  }

  const nextSectionIndex = currentSectionIndex + 1;
  const shouldStartBreak =
    !input.breakAlreadyHandled &&
    input.sectionFamilies[currentSectionIndex] === "mcq" &&
    input.sectionFamilies[nextSectionIndex] === "frq";

  return {
    nextSectionIndex,
    nextStep: shouldStartBreak ? "break" : "section",
    shouldStartBreak,
    isTestComplete: false
  };
}

export function cumulativeSectionTimeSeconds(sections: Array<{ timeSpentSeconds: number }>) {
  return sections.reduce(
    (total, section) => total + Math.max(0, Math.floor(section.timeSpentSeconds || 0)),
    0
  );
}
