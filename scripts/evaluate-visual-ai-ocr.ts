import { existsSync } from "node:fs";
import path from "node:path";
import { analyzePdfUpload } from "@/lib/pdf";
import { enhancePdfVisualEvidence } from "@/lib/pdf-visual-ai";
import type { PdfImportAnalysisInput } from "@/lib/data";
import type { JsonRecord, PdfImportDraftAsset, PdfUpload } from "@/lib/types";
import goldenSet from "../tests/fixtures/pdf-visual-ai-golden.json";

const DEFAULT_EVAL_PAGES = [150, 170, 205, 255, 570, 610];

type GoldenFixture = typeof goldenSet.fixtures[number];
type PageExpectation = GoldenFixture["expectations"]["pages"][number];

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function parsePages(raw: string) {
  if (!raw.trim()) return DEFAULT_EVAL_PAGES;
  const pages = raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  return pages.length > 0 ? pages : DEFAULT_EVAL_PAGES;
}

function selectedFixture() {
  const fixtureId = argumentValue("fixture") || process.env.PDF_VISUAL_AI_EVAL_FIXTURE || goldenSet.defaultFixtureId;
  const fixture = goldenSet.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error(`Unknown visual AI eval fixture: ${fixtureId}`);
  return fixture;
}

function aiVisualBlocks(analysis: PdfImportAnalysisInput) {
  return analysis.pages.flatMap((page) =>
    (page.raw_blocks || [])
      .filter((block) =>
        block.ai_visual_evidence === true ||
        String(block.kind || "") === "ai_visual_markdown" ||
        Boolean(block.raw_provider_output)
      )
      .map((block) => ({
        page_number: page.page_number,
        kind: block.kind || "provider-output",
        source: block.source || "visual-provider",
        has_bbox: Array.isArray(block.bbox),
        text_chars: typeof block.text === "string" ? block.text.length : 0
      }))
  );
}

function hasRawOcrAudit(page: PdfImportAnalysisInput["pages"][number] | undefined) {
  return Boolean(page?.raw_blocks?.some((block) =>
    String(block.kind || "") === "ocr_raw_text" ||
    String(block.source || "") === "tesseract-local-raw"
  ));
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function isAiAsset(asset: PdfImportDraftAsset | NonNullable<PdfImportAnalysisInput["draftAssets"]>[number]) {
  const bbox = jsonRecord(asset.bbox);
  return bbox.ai_visual_evidence === true || /AI visual evidence/i.test(asset.notes || "");
}

function isChoiceImageAsset(asset: PdfImportDraftAsset | NonNullable<PdfImportAnalysisInput["draftAssets"]>[number]) {
  const bbox = jsonRecord(asset.bbox);
  return asset.asset_type === "choice_image" || bbox.target === "choice" || typeof bbox.choice_id === "string";
}

function choiceIdForAsset(asset: PdfImportDraftAsset | NonNullable<PdfImportAnalysisInput["draftAssets"]>[number]) {
  const bbox = jsonRecord(asset.bbox);
  return typeof bbox.choice_id === "string" ? bbox.choice_id : null;
}

function confidenceCounts(assets: Array<PdfImportDraftAsset | NonNullable<PdfImportAnalysisInput["draftAssets"]>[number]>) {
  return assets.reduce<Record<string, number>>((counts, asset) => {
    const bbox = jsonRecord(asset.bbox);
    const confidence = typeof bbox.association_confidence === "string" ? bbox.association_confidence : "unknown";
    counts[confidence] = (counts[confidence] || 0) + 1;
    return counts;
  }, {});
}

function draftsForPage(analysis: PdfImportAnalysisInput, pageNumber: number) {
  return analysis.draftQuestions.filter((draft) =>
    pageNumber >= draft.source_page_start && pageNumber <= draft.source_page_end
  );
}

function assetsForPage(analysis: PdfImportAnalysisInput, pageNumber: number) {
  return (analysis.draftAssets || []).filter((asset) => asset.page_number === pageNumber);
}

function check(name: string, pass: boolean, actual: unknown, expected: unknown) {
  return { name, pass, actual, expected };
}

function evaluatePage(
  expectation: PageExpectation,
  before: PdfImportAnalysisInput,
  after: PdfImportAnalysisInput,
  aiBlocks: ReturnType<typeof aiVisualBlocks>
) {
  const pageNumber = expectation.pageNumber;
  const page = after.pages.find((item) => item.page_number === pageNumber);
  const drafts = draftsForPage(after, pageNumber);
  const assets = assetsForPage(after, pageNumber);
  const questionNumbers = drafts.map((draft) => draft.question_number).filter((item) => item !== null);
  const types = Array.from(new Set(drafts.map((draft) => draft.type)));
  const choiceCount = drafts.reduce((sum, draft) => sum + draft.choices.length, 0);
  const frqPartCount = drafts.reduce((sum, draft) => sum + draft.frq_parts.length, 0);
  const pageAiBlocks = aiBlocks.filter((block) => block.page_number === pageNumber);
  const choiceImageAssets = assets.filter(isChoiceImageAsset);
  const pageChecks = [
    check("page-present", Boolean(page), page ? "present" : "missing", "present"),
    check("min-ai-blocks", pageAiBlocks.length >= (expectation.minAiBlocks || 0), pageAiBlocks.length, expectation.minAiBlocks || 0),
    check("min-drafts", drafts.length >= (expectation.minDrafts || 0), drafts.length, expectation.minDrafts || 0),
    check("min-candidate-assets", assets.length >= (expectation.minCandidateAssets || 0), assets.length, expectation.minCandidateAssets || 0)
  ];
  if (expectation.requiresRawOcrAudit) {
    pageChecks.push(check("raw-ocr-audit", hasRawOcrAudit(page), hasRawOcrAudit(page), true));
  }
  if (expectation.expectedQuestionNumbers?.length) {
    pageChecks.push(check(
      "expected-question-numbers",
      expectation.expectedQuestionNumbers.every((questionNumber) => questionNumbers.includes(questionNumber)),
      questionNumbers,
      expectation.expectedQuestionNumbers
    ));
  }
  if (expectation.expectedTypes?.length) {
    pageChecks.push(check(
      "expected-types",
      expectation.expectedTypes.every((type) => types.includes(type as "mcq" | "frq")),
      types,
      expectation.expectedTypes
    ));
  }
  if (expectation.minChoiceCount) {
    pageChecks.push(check("min-choice-count", choiceCount >= expectation.minChoiceCount, choiceCount, expectation.minChoiceCount));
  }
  if (expectation.minFrqParts) {
    pageChecks.push(check("min-frq-parts", frqPartCount >= expectation.minFrqParts, frqPartCount, expectation.minFrqParts));
  }
  return {
    page_number: pageNumber,
    label: expectation.label,
    checks: pageChecks,
    pass: pageChecks.every((item) => item.pass),
    targets: {
      question_numbers: "targetQuestionNumbers" in expectation ? expectation.targetQuestionNumbers : undefined,
      types: "targetTypes" in expectation ? expectation.targetTypes : undefined,
      min_frq_parts: "targetMinFrqParts" in expectation ? expectation.targetMinFrqParts : undefined
    },
    actual: {
      ocr_status: page?.ocr_status || "missing",
      extraction_method: page?.extraction_method || "missing",
      confidence: page?.confidence ?? null,
      raw_ocr_audit: hasRawOcrAudit(page),
      draft_count_before: draftsForPage(before, pageNumber).length,
      draft_count_after: drafts.length,
      question_numbers: questionNumbers,
      types,
      choice_count: choiceCount,
      frq_part_count: frqPartCount,
      candidate_asset_count: assets.length,
      choice_image_candidate_count: choiceImageAssets.length,
      choice_image_choices_detected: Array.from(new Set(choiceImageAssets.map(choiceIdForAsset).filter(Boolean))).sort(),
      choice_pairing_confidence_counts: confidenceCounts(choiceImageAssets),
      ai_asset_count: assets.filter(isAiAsset).length,
      ai_block_count: pageAiBlocks.length,
      crop_usefulness_label: expectation.cropUsefulness || "unlabeled",
      false_positive_expected: expectation.falsePositiveExpected === true
    }
  };
}

async function main() {
  const fixture = selectedFixture();
  process.env.PDF_VISUAL_AI_MODE ||= "audit";
  if (!process.env.PDF_VISUAL_AI_PROVIDER && !process.env.PDF_VISUAL_AI_MISTRAL_API_KEY && !process.env.MISTRAL_API_KEY) {
    process.env.PDF_VISUAL_AI_PROVIDER = "fixture";
  }

  const pdfPath = argumentValue("pdf") || process.env.PDF_VISUAL_AI_EVAL_PDF || (existsSync(fixture.pdfPathHint) ? fixture.pdfPathHint : "");
  if (!pdfPath) {
    throw new Error(`Provide --pdf=/path/to/sample.pdf or PDF_VISUAL_AI_EVAL_PDF. Fixture path hint: ${fixture.pdfPathHint}`);
  }
  const absolutePdfPath = path.resolve(pdfPath);
  if (!existsSync(absolutePdfPath)) throw new Error(`PDF not found: ${absolutePdfPath}`);

  const pages = parsePages(argumentValue("pages") || process.env.PDF_VISUAL_AI_EVAL_PAGES || fixture.pages.join(","));
  const pdf: PdfUpload = {
    id: "visual_ai_eval",
    file_name: path.basename(absolutePdfPath),
    file_url: absolutePdfPath,
    subject: "AP Physics",
    unit: "Visual evidence evaluation",
    topic: "Hybrid OCR",
    status: "uploaded",
    storage_provider: "local",
    storage_bucket: null,
    storage_object_key: null,
    mime_type: "application/pdf",
    upload_status: "completed",
    uploaded_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const startedAt = performance.now();
  const before = await analyzePdfUpload(pdf, { ocrPageNumbers: pages });
  const enhanced = await enhancePdfVisualEvidence(pdf, before);
  const latencyMs = Math.round(performance.now() - startedAt);
  const after = enhanced.analysis;
  const aiBlocks = aiVisualBlocks(after);
  const assetDelta = (after.draftAssets || []).length - (before.draftAssets || []).length;
  const visualAiAssetDelta = (after.draftAssets || []).filter(isAiAsset).length - (before.draftAssets || []).filter(isAiAsset).length;
  const choiceImageAssets = (after.draftAssets || []).filter(isChoiceImageAsset);
  const expectations = fixture.expectations;
  const pageExpectations = expectations.pages.filter((item) => pages.includes(item.pageNumber));
  const pageResults = pageExpectations.map((expectation) => evaluatePage(expectation, before, after, aiBlocks));
  const costPerPage = process.env.PDF_VISUAL_AI_COST_PER_PAGE_USD ? Number(process.env.PDF_VISUAL_AI_COST_PER_PAGE_USD) : null;
  const globalChecks = [
    check("status-after", after.status === expectations.statusAfter, after.status, expectations.statusAfter),
    check("min-draft-count", after.draftQuestions.length >= expectations.minDraftCount, after.draftQuestions.length, expectations.minDraftCount),
    check(
      "draft-count-stable",
      !expectations.draftCountStable || Math.abs(after.draftQuestions.length - before.draftQuestions.length) <= expectations.maxDraftCountDelta,
      { before: before.draftQuestions.length, after: after.draftQuestions.length },
      `delta <= ${expectations.maxDraftCountDelta}`
    ),
    check("min-visual-ai-asset-delta", visualAiAssetDelta >= expectations.minVisualAiAssetDelta, visualAiAssetDelta, expectations.minVisualAiAssetDelta),
    check(
      "min-ai-blocks-per-page",
      pages.every((pageNumber) => aiBlocks.filter((block) => block.page_number === pageNumber).length >= expectations.minAiBlocksPerPage),
      Object.fromEntries(pages.map((pageNumber) => [pageNumber, aiBlocks.filter((block) => block.page_number === pageNumber).length])),
      expectations.minAiBlocksPerPage
    )
  ];
  if (expectations.requiresRawOcrAudit) {
    globalChecks.push(check(
      "raw-ocr-audit-coverage",
      pages.every((pageNumber) => hasRawOcrAudit(after.pages.find((page) => page.page_number === pageNumber))),
      Object.fromEntries(pages.map((pageNumber) => [pageNumber, hasRawOcrAudit(after.pages.find((page) => page.page_number === pageNumber))])),
      true
    ));
  }
  const visualEvidenceRecall = pageResults.length > 0
    ? pageResults.filter((page) => page.checks.some((item) => item.name === "min-ai-blocks" && item.pass)).length / pageResults.length
    : null;
  const badCropLabels = pageResults.filter((page) => page.actual.crop_usefulness_label === "bad" || page.actual.crop_usefulness_label === "wrong_region").length;
  const labeledCropPages = pageResults.filter((page) => page.actual.crop_usefulness_label !== "unlabeled").length;
  const pass = globalChecks.every((item) => item.pass) && pageResults.every((item) => item.pass);

  const report = {
    pdf: absolutePdfPath,
    fixture_id: fixture.id,
    fixture_description: fixture.description,
    pages,
    mode: enhanced.mode,
    provider: enhanced.provider,
    pass,
    status_before: before.status,
    status_after: after.status,
    draft_count_before: before.draftQuestions.length,
    draft_count_after: after.draftQuestions.length,
    draft_asset_count_before: before.draftAssets?.length || 0,
    draft_asset_count_after: after.draftAssets?.length || 0,
    draft_asset_delta: assetDelta,
    choice_image_candidate_count: choiceImageAssets.length,
    choice_image_choices_detected: Array.from(new Set(choiceImageAssets.map(choiceIdForAsset).filter(Boolean))).sort(),
    choice_pairing_confidence_counts: confidenceCounts(choiceImageAssets),
    visual_ai_asset_delta: visualAiAssetDelta,
    ai_visual_blocks: aiBlocks,
    global_checks: globalChecks,
    page_results: pageResults,
    metrics: {
      latency_ms: latencyMs,
      latency_ms_per_page: pages.length > 0 ? Math.round(latencyMs / pages.length) : null,
      visual_evidence_recall: visualEvidenceRecall,
      bad_crop_rate: labeledCropPages > 0 ? badCropLabels / labeledCropPages : null,
      bad_crop_rate_note: labeledCropPages > 0 ? "computed from golden labels" : "unlabeled until reviewer feedback is collected",
      draft_over_generation: Math.max(0, after.draftQuestions.length - before.draftQuestions.length),
      scoring_guide_rejection: "not_applicable_for_fixture",
      cost_per_page_usd: costPerPage,
      estimated_total_cost_usd: costPerPage === null ? null : Number((costPerPage * pages.length).toFixed(4))
    },
    selected_page_summary: pages.map((pageNumber) => {
      const page = after.pages.find((item) => item.page_number === pageNumber);
      return {
        page_number: pageNumber,
        ocr_status: page?.ocr_status || "missing",
        extraction_method: page?.extraction_method || "missing",
        confidence: page?.confidence ?? null,
        raw_block_count: page?.raw_blocks?.length || 0,
        ai_block_count: aiBlocks.filter((block) => block.page_number === pageNumber).length,
        warning_count: page?.warnings?.length || 0
      };
    }),
    warnings: after.warnings,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!pass && !hasFlag("allow-failures")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
