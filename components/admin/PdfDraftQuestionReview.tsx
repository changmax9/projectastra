"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  adminSavePdfDraftAssetFeedbackAction,
  adminRejectPdfDraftQuestionAction,
  adminSavePdfDraftQuestionAction,
  type ActionState
} from "@/app/actions";
import { MathMarkdown } from "@/components/MathMarkdown";
import type { PdfImportDraftAsset, PdfImportDraftQuestion, PdfImportPage, QuestionChoice } from "@/lib/types";

function SaveDraftButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || disabled}
      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save verified draft"}
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
      {pending ? "Rejecting..." : "Reject this draft"}
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

type CandidateSelectionTarget = "question" | "choice";

type CandidateSelectionState = Record<string, {
  enabled: boolean;
  target: CandidateSelectionTarget;
  choiceId: string;
  croppedUrl: string;
  caption: string;
  alt: string;
  bbox: string;
  reviewerFeedback: string;
  reviewerNotes: string;
}>;

function assetMetadata(asset: PdfImportDraftAsset) {
  return asset.bbox && typeof asset.bbox === "object" ? asset.bbox : null;
}

function choiceIdFromAsset(asset: PdfImportDraftAsset) {
  const bbox = assetMetadata(asset);
  const choiceId = bbox && typeof bbox.choice_id === "string" ? bbox.choice_id.toUpperCase() : "";
  return /^[A-E]$/.test(choiceId) ? choiceId : "";
}

function initialCandidateSelection(asset: PdfImportDraftAsset) {
  const bbox = assetMetadata(asset);
  const hasGeneratedCrop = Boolean(asset.image_url && bbox && "bbox" in bbox);
  const reviewerFeedback = bbox && typeof bbox.reviewer_feedback === "string" ? bbox.reviewer_feedback : "unlabeled";
  const reviewerNotes = bbox && typeof bbox.reviewer_notes === "string" ? bbox.reviewer_notes : "";
  const choiceId = choiceIdFromAsset(asset);
  const target: CandidateSelectionTarget = asset.asset_type === "choice_image" && choiceId ? "choice" : "question";
  return {
    enabled: false,
    target,
    choiceId,
    croppedUrl: hasGeneratedCrop ? asset.image_url || "" : "",
    caption: target === "choice" && choiceId
      ? `Choice ${choiceId} visual evidence from PDF page ${asset.page_number}`
      : `${asset.asset_type === "unknown" ? "Visual evidence" : asset.asset_type} from PDF page ${asset.page_number}`,
    alt: target === "choice" && choiceId
      ? `Cropped answer choice ${choiceId} evidence from PDF page ${asset.page_number}`
      : `Cropped source evidence from PDF page ${asset.page_number}`,
    bbox: JSON.stringify(asset.bbox || { page_number: asset.page_number, source_image_url: asset.image_url }, null, 2),
    reviewerFeedback,
    reviewerNotes
  };
}

function placeholderChoiceText(choice: QuestionChoice) {
  const text = choice.text.trim();
  return !text || text === choice.id || new RegExp(`^(?:Choice|Option)\\s+${choice.id}$`, "i").test(text);
}

function parseChoicesJson(value: string, fallback: QuestionChoice[]) {
  try {
    const parsed = JSON.parse(value) as QuestionChoice[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function buildChoicesJson(
  draft: PdfImportDraftQuestion,
  candidateAssets: PdfImportDraftAsset[],
  selections: CandidateSelectionState,
  currentChoicesJson?: string
) {
  const choices = (currentChoicesJson ? parseChoicesJson(currentChoicesJson, draft.choices) : draft.choices).map((choice) => ({ ...choice }));
  for (const asset of candidateAssets) {
    const selection = selections[asset.id];
    const croppedUrl = selection?.croppedUrl.trim();
    if (!selection?.enabled || selection.target !== "choice" || !selection.choiceId || !croppedUrl) continue;
    let choice = choices.find((item) => item.id.toUpperCase() === selection.choiceId.toUpperCase());
    if (!choice) {
      choice = { id: selection.choiceId.toUpperCase(), text: `Option ${selection.choiceId.toUpperCase()}`, image_url: null };
      choices.push(choice);
    }
    choice.image_url = croppedUrl;
    if (placeholderChoiceText(choice)) choice.text = `Option ${choice.id}`;
  }
  const order = ["A", "B", "C", "D", "E"];
  choices.sort((left, right) => {
    const leftIndex = order.indexOf(left.id.toUpperCase());
    const rightIndex = order.indexOf(right.id.toUpperCase());
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
  return JSON.stringify(choices, null, 2);
}

function buildQuestionImagesJson(
  draft: PdfImportDraftQuestion,
  candidateAssets: PdfImportDraftAsset[],
  selections: CandidateSelectionState
) {
  const approvedCrops = candidateAssets.flatMap((asset) => {
    const selection = selections[asset.id];
    const croppedUrl = selection?.croppedUrl.trim();
    if (!selection?.enabled || selection.target === "choice" || !croppedUrl) return [];
    const bbox = selection.bbox.trim();
    const feedback = [
      selection.reviewerFeedback && selection.reviewerFeedback !== "unlabeled" ? `Reviewer feedback: ${selection.reviewerFeedback.replace(/_/g, " ")}` : "",
      selection.reviewerNotes.trim() ? `Reviewer notes: ${selection.reviewerNotes.trim()}` : ""
    ].filter(Boolean).join(" ");
    const caption = [
      selection.caption.trim(),
      bbox ? `Crop/source bbox: ${bbox.replace(/\s+/g, " ")}` : "",
      feedback
    ].filter(Boolean).join(" ");
    return [{
      id: `pdf-crop-${asset.id}`,
      url: croppedUrl,
      caption: caption || null,
      alt: selection.alt.trim() || null
    }];
  });
  return JSON.stringify([...draft.question_images, ...approvedCrops], null, 2);
}

function snippet(value: unknown, maxLength = 900) {
  const text = typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function isAiVisualBlock(block: Record<string, unknown>) {
  const kind = String(block.kind || "");
  const source = String(block.source || "").toLowerCase();
  return (
    block.ai_visual_evidence === true ||
    kind === "ai_visual_markdown" ||
    Boolean(block.raw_provider_output) ||
    /visual-ai|mistral|openai|claude|gemini/.test(source)
  );
}

export function PdfDraftQuestionReview({
  draft,
  sourcePages,
  candidateAssets = [],
  position,
  totalDrafts
}: {
  draft: PdfImportDraftQuestion;
  sourcePages?: PdfImportPage[];
  candidateAssets?: PdfImportDraftAsset[];
  position?: number;
  totalDrafts?: number;
}) {
  const [state, action] = useFormState<ActionState, FormData>(adminSavePdfDraftQuestionAction, {});
  const [candidateSelections, setCandidateSelections] = useState<CandidateSelectionState>(() =>
    Object.fromEntries(candidateAssets.map((asset) => [asset.id, initialCandidateSelection(asset)]))
  );
  const [choicesJson, setChoicesJson] = useState(() =>
    buildChoicesJson(draft, candidateAssets, {})
  );
  const [questionImagesJson, setQuestionImagesJson] = useState(() =>
    buildQuestionImagesJson(draft, candidateAssets, {})
  );
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
  const candidateSelectionValues = useMemo(
    () => candidateAssets.map((asset) => ({
      asset,
      selection: candidateSelections[asset.id] || initialCandidateSelection(asset)
    })),
    [candidateAssets, candidateSelections]
  );
  const choiceCandidateSelectionValues = candidateSelectionValues.filter(({ asset }) => asset.asset_type === "choice_image");
  const promptCandidateSelectionValues = candidateSelectionValues.filter(({ asset }) => asset.asset_type !== "choice_image");
  const choiceTargetOptions = Array.from(new Set([
    ...draft.choices.map((choice) => choice.id.toUpperCase()).filter((id) => /^[A-E]$/.test(id)),
    ...candidateAssets.map(choiceIdFromAsset).filter(Boolean)
  ])).sort((left, right) => "ABCDE".indexOf(left) - "ABCDE".indexOf(right));
  const aiVisualEvidence = useMemo(() =>
    (sourcePages || []).flatMap((page) =>
      (page.raw_blocks || [])
        .filter((block) => isAiVisualBlock(block))
        .map((block, index) => ({
          key: `${page.id}-${index}`,
          pageNumber: page.page_number,
          kind: String(block.kind || "provider-output"),
          source: String(block.source || "visual provider"),
          text: snippet(block.text || block.markdown || block.raw_provider_output),
          bbox: snippet(block.bbox || block.region || null, 500)
        }))
    ),
    [sourcePages]
  );

  function updateCandidateSelection(assetId: string, patch: Partial<CandidateSelectionState[string]>) {
    setCandidateSelections((current) => {
      const asset = candidateAssets.find((item) => item.id === assetId);
      const next = {
        ...current,
        [assetId]: {
          ...(current[assetId] || (asset ? initialCandidateSelection(asset) : {
            enabled: false,
            target: "question",
            choiceId: "",
            croppedUrl: "",
            caption: "",
            alt: "",
            bbox: "",
            reviewerFeedback: "unlabeled",
            reviewerNotes: ""
          })),
          ...patch
        }
      };
      setQuestionImagesJson(buildQuestionImagesJson(draft, candidateAssets, next));
      setChoicesJson((currentChoicesJson) => buildChoicesJson(draft, candidateAssets, next, currentChoicesJson));
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {position && totalDrafts ? <span>Draft {position} of {totalDrafts}</span> : null}
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

      <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          Source pages: {sourcePages?.length || 0}
        </span>
        <span className={`rounded-md border px-3 py-2 ${draft.warnings.length > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"}`}>
          Warnings: {draft.warnings.length}
        </span>
        <span className={`rounded-md border px-3 py-2 ${candidateAssets.length > 0 ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-slate-50"}`}>
          Visual candidates: {candidateAssets.length}
        </span>
        <span className={`rounded-md border px-3 py-2 ${aiVisualEvidence.length > 0 ? "border-violet-200 bg-violet-50 text-violet-900" : "border-slate-200 bg-slate-50"}`}>
          AI evidence: {aiVisualEvidence.length}
        </span>
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
                    {page.confidence !== null ? ` · ${Math.round(page.confidence * 100)}%` : ""}
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

      {aiVisualEvidence.length > 0 ? (
        <div className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">AI visual evidence</p>
            <span className="text-xs font-medium text-violet-800">Review-only provider output</span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {aiVisualEvidence.map((item) => (
              <div key={item.key} className="rounded-md border border-violet-100 bg-white p-3 text-xs text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Page {item.pageNumber} · {item.kind}</span>
                  <span>{item.source}</span>
                </div>
                {item.text ? (
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 font-mono leading-5">
                    {item.text}
                  </pre>
                ) : (
                  <p className="mt-2 leading-5">Provider returned a visual region without text.</p>
                )}
                {item.bbox ? (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 font-mono leading-5">
                    {item.bbox}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {candidateAssets.length > 0 ? (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Candidate visual evidence</p>
            <span className="text-xs font-medium text-blue-800">Not saved automatically</span>
          </div>
          <div className="mt-3 space-y-4">
            {[
              { key: "choice", title: "Choice-level visual evidence", values: choiceCandidateSelectionValues },
              { key: "prompt", title: "Prompt-level visual evidence", values: promptCandidateSelectionValues }
            ].filter((group) => group.values.length > 0).map((group) => (
              <div key={group.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">{group.title}</p>
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  {group.values.map(({ asset, selection }) => {
                    const bbox = assetMetadata(asset);
                    const predictedChoice = choiceIdFromAsset(asset);
                    const confidence = bbox && typeof bbox.association_confidence === "string" ? bbox.association_confidence : "";
                    const targetValue = selection.target === "choice" && selection.choiceId ? `choice:${selection.choiceId}` : "question";
                    return (
                      <div key={asset.id} className="rounded-md border border-blue-100 bg-white p-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink">Page {asset.page_number} · {asset.asset_type}</span>
                          <span>{asset.status}</span>
                        </div>
                        {asset.asset_type === "choice_image" ? (
                          <p className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 font-medium text-blue-900">
                            Predicted choice {predictedChoice || "?"}{confidence ? ` · ${confidence} confidence` : ""}
                          </p>
                        ) : null}
                        {asset.image_url ? (
                          <a href={asset.image_url} target="_blank" className="mt-2 block overflow-hidden rounded border border-slate-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.image_url} alt={`Candidate visual evidence from page ${asset.page_number}`} className="h-auto max-h-80 w-full object-contain" />
                          </a>
                        ) : null}
                        <p className="mt-2 leading-5">{asset.notes}</p>
                        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                          <label className="block font-medium text-slate-700">
                            Save target
                            <select
                              value={targetValue}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === "question") updateCandidateSelection(asset.id, { target: "question", choiceId: "" });
                                else updateCandidateSelection(asset.id, { target: "choice", choiceId: value.replace(/^choice:/, "") });
                              }}
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                              disabled={disabled}
                            >
                              <option value="question">Use as question image</option>
                              {choiceTargetOptions.map((choiceId) => (
                                <option key={choiceId} value={`choice:${choiceId}`}>{`Use as choice ${choiceId} image`}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={selection.enabled}
                              onChange={(event) => updateCandidateSelection(asset.id, { enabled: event.target.checked })}
                              disabled={disabled}
                            />
                            {selection.target === "choice" && selection.choiceId ? `Use as choice ${selection.choiceId} image` : "Use cropped asset in saved draft"}
                          </label>
                          <label className="block font-medium text-slate-700">
                            Cropped asset URL
                            <input
                              value={selection.croppedUrl}
                              onChange={(event) => updateCandidateSelection(asset.id, { croppedUrl: event.target.value })}
                              placeholder="/uploads/media/cropped-diagram.png"
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                              disabled={disabled}
                            />
                          </label>
                          {selection.target === "question" ? (
                            <label className="block font-medium text-slate-700">
                              Caption
                              <input
                                value={selection.caption}
                                onChange={(event) => updateCandidateSelection(asset.id, { caption: event.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                                disabled={disabled}
                              />
                            </label>
                          ) : null}
                          <label className="block font-medium text-slate-700">
                            Crop/source bbox JSON
                            <textarea
                              value={selection.bbox}
                              onChange={(event) => updateCandidateSelection(asset.id, { bbox: event.target.value })}
                              rows={3}
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 font-mono"
                              disabled={disabled}
                            />
                          </label>
                          <form action={adminSavePdfDraftAssetFeedbackAction} className="space-y-2 rounded-md border border-blue-100 bg-white p-2">
                            <input type="hidden" name="asset_id" value={asset.id} />
                            <input type="hidden" name="job_id" value={draft.job_id} />
                            <label className="block font-medium text-slate-700">
                              Reviewer feedback
                              <select
                                name="reviewer_feedback"
                                value={selection.reviewerFeedback}
                                onChange={(event) => updateCandidateSelection(asset.id, { reviewerFeedback: event.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                                disabled={disabled}
                              >
                                <option value="unlabeled">Unlabeled</option>
                                <option value="useful_crop">Useful crop</option>
                                <option value="wrong_region">Wrong region</option>
                                <option value="missing_graph">Missing graph</option>
                                <option value="bad_segmentation">Bad segmentation</option>
                              </select>
                            </label>
                            <label className="block font-medium text-slate-700">
                              Reviewer notes
                              <textarea
                                name="reviewer_notes"
                                value={selection.reviewerNotes}
                                onChange={(event) => updateCandidateSelection(asset.id, { reviewerNotes: event.target.value })}
                                rows={2}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                                disabled={disabled}
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={disabled}
                              className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Save feedback
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form action={action} className="mt-5 space-y-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-ink">Verified draft fields</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Saving creates a draft question with needs-admin-review tags. It does not publish the question.
          </p>
        </div>
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
            <textarea name="choices_json" rows={7} value={choicesJson} onChange={(event) => setChoicesJson(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Question images JSON
            <textarea name="question_images_json" rows={7} value={questionImagesJson} onChange={(event) => setQuestionImagesJson(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
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
