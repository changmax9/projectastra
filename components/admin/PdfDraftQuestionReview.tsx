"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  adminRejectPdfDraftQuestionAction,
  adminSavePdfDraftQuestionAction,
  type ActionState
} from "@/app/actions";
import { MathMarkdown } from "@/components/MathMarkdown";
import type { PdfImportDraftQuestion, PdfImportPage } from "@/lib/types";

function SaveDraftButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || disabled}
      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save to question drafts"}
    </button>
  );
}

function RejectButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || disabled}
      className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? "Rejecting..." : "Reject draft"}
    </button>
  );
}

function inferredSelectionMeta(draft: PdfImportDraftQuestion) {
  const answerCount = (draft.correct_answer || "").split(",").map((item) => item.trim()).filter(Boolean).length;
  const requiresMultiple = answerCount > 1 || /\b(?:select|choose)\s+(?:two|2)\b/i.test(draft.question_text);
  return {
    selectionType: requiresMultiple ? "multiple" : "single",
    requiredSelections: requiresMultiple ? Math.max(2, answerCount || 2) : 1,
    maxSelections: requiresMultiple ? Math.max(2, answerCount || 2) : 1,
    tags: requiresMultiple ? ["multi-select", "select-two"] : []
  };
}

function explanationDefault(draft: PdfImportDraftQuestion) {
  return [
    draft.explanation,
    draft.scoring_notes ? `Scoring notes from source:\n${draft.scoring_notes}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function PdfDraftQuestionReview({
  draft,
  sourcePages
}: {
  draft: PdfImportDraftQuestion;
  sourcePages?: PdfImportPage[];
}) {
  const [state, action] = useFormState<ActionState, FormData>(adminSavePdfDraftQuestionAction, {});
  const disabled = draft.review_status !== "pending";
  const selectionMeta = inferredSelectionMeta(draft);
  const textWithParts =
    draft.frq_parts.length > 0
      ? `${draft.question_text}\n\n${draft.frq_parts.map((part) => `(${part.label}) ${part.prompt}`).join("\n\n")}`
      : draft.question_text;
  const tags = Array.from(
    new Set([
      ...draft.warnings.map((_, index) => `pdf-warning-${index + 1}`),
      ...selectionMeta.tags,
      "pdf-import",
      "needs-admin-review"
    ])
  ).join(", ");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span>Question {draft.question_number ?? "?"}</span>
            <span>Pages {draft.source_page_start}-{draft.source_page_end}</span>
            <span>{draft.type.toUpperCase()}</span>
            <span>{draft.review_status}</span>
            {draft.confidence !== null ? <span>Confidence {Math.round(draft.confidence * 100)}%</span> : null}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-ink">
            {draft.course} draft question {draft.question_number ?? ""}
          </h2>
        </div>
        {draft.saved_question_id ? (
          <Link href={`/admin/questions/${draft.saved_question_id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Open saved question
          </Link>
        ) : null}
      </div>

      {draft.warnings.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Review warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="exam-prose mt-2 font-serif text-base leading-7 text-ink">
          <MathMarkdown content={textWithParts} />
        </div>
        {draft.choices.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {draft.choices.map((choice) => (
              <div key={choice.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-semibold">{choice.id}.</span> {choice.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {sourcePages && sourcePages.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source pages</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {sourcePages.map((page) => (
              <div key={page.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Page {page.page_number}</span>
                  <span>
                    {page.extraction_method} · {page.ocr_status}
                    {page.confidence !== null ? ` · ${Math.round(page.confidence > 1 ? page.confidence : page.confidence * 100)}%` : ""}
                  </span>
                </div>
                {page.page_image_url ? (
                  <a href={page.page_image_url} target="_blank" className="mt-2 block overflow-hidden rounded border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.page_image_url} alt={`Source page ${page.page_number}`} className="h-auto max-h-96 w-full object-contain" />
                  </a>
                ) : null}
                <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap leading-5">
                  {page.text_extracted || page.ocr_text || "No accepted text for this page."}
                </p>
                {page.warnings.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-800">
                    {page.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="job_id" value={draft.job_id} />
        <input type="hidden" name="selection_type" value={selectionMeta.selectionType} />
        <input type="hidden" name="required_selections" value={selectionMeta.requiredSelections} />
        <input type="hidden" name="max_selections" value={selectionMeta.maxSelections} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Exam name
            <input name="exam_name" defaultValue={draft.exam_name} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Subject
            <input name="subject" defaultValue={draft.subject} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            AP Course
            <input name="course" defaultValue={draft.course} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            Year
            <input name="year" type="number" min={1900} defaultValue={draft.year ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Section
            <input name="section" defaultValue={draft.section} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Exam type
            <input name="exam_type" defaultValue={draft.exam_type} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Question #
            <input name="question_number" type="number" min={1} defaultValue={draft.question_number ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Type
            <select name="type" defaultValue={draft.type} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="mcq">mcq</option>
              <option value="frq">frq</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Unit
            <input name="unit" defaultValue={draft.unit} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Topic
            <input name="topic" defaultValue={draft.topic} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Difficulty
            <select name="difficulty" defaultValue={draft.difficulty} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Question text
          <textarea name="question_text" rows={6} defaultValue={textWithParts} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Choices JSON
            <textarea name="choices_json" rows={7} defaultValue={JSON.stringify(draft.choices, null, 2)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Question images JSON
            <textarea name="question_images_json" rows={7} defaultValue={JSON.stringify(draft.question_images, null, 2)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Correct answer
            <input name="correct_answer" defaultValue={draft.correct_answer || ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Points
            <input name="points" type="number" min={1} defaultValue={draft.type === "mcq" ? 1 : 4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Seconds
            <input name="time_estimate_seconds" type="number" min={1} defaultValue={draft.type === "mcq" ? 90 : 720} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <input name="status" readOnly value="draft" className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Explanation
          <textarea
            name="explanation"
            rows={5}
            defaultValue={explanationDefault(draft)}
            placeholder="Add a verified explanation or scoring note before saving."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <input type="hidden" name="source_pdf" value={`${draft.pdf_upload_id} pages ${draft.source_page_start}-${draft.source_page_end}`} />
        <input type="hidden" name="tags" value={tags} />
        {state.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
        {state.message ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{state.message}</p> : null}
        <div className="flex flex-wrap gap-3">
          <SaveDraftButton disabled={disabled} />
        </div>
      </form>

      <form action={adminRejectPdfDraftQuestionAction} className="mt-3">
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="job_id" value={draft.job_id} />
        <RejectButton disabled={disabled} />
      </form>
    </section>
  );
}
