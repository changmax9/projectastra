import type { QuestionChoice, QuestionImage, QuestionImportItem } from "@/lib/types";
import { normalizeMarkdownStructure } from "@/lib/math-markdown";

const CHOICE_MARKER_RE = /\s\(([A-D])\)(?=\s)/g;
const PLACEHOLDER_CHOICE_RE = /^choice\s+[A-D]$/i;
const PDF_PAGE_IMAGE_RE =
  /(?:\b(?:mcq|frq)-page(?:-\d+)?|page-screenshot|full-page|pdf-page|pdf-page-image|whole-page|question-screenshot|full-question|pdf-import-pages\b|\/page-\d{3}\.png\b)/i;

function cleanExtractedText(value: string) {
  return String(value || "")
    .replace(/^2023\s+MCQ\s+\d+(?:\s+\(select two\))?:\s*/i, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/\bSTOP\s+END OF SECTION I\s+\d+\s*$/i, "")
    .replace(/\bUse the attached prompt image for diagrams, formulas, and any visual answer choices\.?$/i, "")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPlaceholderChoices(choices: QuestionChoice[]) {
  return choices.length === 0 || choices.every((choice) => PLACEHOLDER_CHOICE_RE.test(choice.text.trim()));
}

function splitFlattenedChoices(questionText: string) {
  const text = cleanExtractedText(questionText);
  const matches = [...text.matchAll(CHOICE_MARKER_RE)];
  if (matches.length < 2) return null;

  const stem = text.slice(0, matches[0].index).trim();
  const choices = matches.map((match, index) => {
    const id = match[1];
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const choiceText = text
      .slice(start, end)
      .replace(/\s+\d+$/, "")
      .trim();
    return {
      id,
      text: choiceText || `Option ${id}`,
      image_url: null
    };
  });

  return { stem, choices };
}

export function isPdfPageImageUrl(url: string) {
  return PDF_PAGE_IMAGE_RE.test(url);
}

export function getForbiddenImageReference(url: string) {
  return url.match(PDF_PAGE_IMAGE_RE)?.[0] || null;
}

export function stripPdfPageImages(images: QuestionImage[]) {
  return images.filter((image) => !isPdfPageImageUrl(image.url));
}

export function normalizeQuestionImportItem(item: QuestionImportItem): QuestionImportItem {
  const split = splitFlattenedChoices(item.question_text);
  const choices = split && isPlaceholderChoices(item.choices) ? split.choices : item.choices;

  return {
    ...item,
    question_text: normalizeMarkdownStructure(split?.stem || cleanExtractedText(item.question_text)),
    question_images: item.question_images || [],
    choices: choices.map((choice) => ({
      ...choice,
      text: normalizeMarkdownStructure(choice.text)
    })),
    explanation: normalizeMarkdownStructure(item.explanation)
  };
}

export function normalizeQuestionImportItems(items: QuestionImportItem[]) {
  return items.map(normalizeQuestionImportItem);
}
