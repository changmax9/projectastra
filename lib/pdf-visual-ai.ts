import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PdfImportAnalysisInput } from "@/lib/data";
import type { JsonRecord, PdfImportDraftQuestion, PdfImportPage, PdfUpload } from "@/lib/types";

export type PdfVisualAiMode = "off" | "audit" | "assist";

type AnalysisPage = PdfImportAnalysisInput["pages"][number];
type AnalysisDraft = PdfImportAnalysisInput["draftQuestions"][number];
type AnalysisDraftAsset = NonNullable<PdfImportAnalysisInput["draftAssets"]>[number];

interface PdfVisualAiPageInput {
  pageNumber: number;
  imageUrl: string;
  imageBytes: Buffer;
  contentType: string;
  pageWidth: number | null;
  pageHeight: number | null;
}

interface PdfVisualAiPageResult {
  pageNumber: number;
  provider: string;
  markdown: string;
  raw: JsonRecord;
  blocks: JsonRecord[];
  warnings: string[];
}

interface PdfVisualAiProvider {
  name: string;
  analyzePages(pages: PdfVisualAiPageInput[]): Promise<PdfVisualAiPageResult[]>;
}

export interface PdfVisualAiEnhancementResult {
  analysis: PdfImportAnalysisInput;
  mode: PdfVisualAiMode;
  provider: string | null;
  enhanced: boolean;
  shouldRefinalize: boolean;
  warnings: string[];
}

const DEFAULT_VISUAL_AI_MAX_PAGES = 8;
const DEFAULT_VISUAL_AI_LOW_CONFIDENCE = 0.65;
const DEFAULT_VISUAL_AI_TIMEOUT_MS = 60_000;
const DEFAULT_VISUAL_AI_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_VISUAL_AI_RETRIES = 1;

export function getPdfVisualAiMode(): PdfVisualAiMode {
  const raw = (process.env.PDF_VISUAL_AI_MODE || "off").trim().toLowerCase();
  return raw === "audit" || raw === "assist" ? raw : "off";
}

export function getPdfVisualAiPreflight() {
  const rawMode = (process.env.PDF_VISUAL_AI_MODE || "off").trim().toLowerCase();
  const mode = getPdfVisualAiMode();
  const provider = visualAiProviderName();
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!["off", "audit", "assist"].includes(rawMode)) {
    errors.push(`PDF_VISUAL_AI_MODE must be off, audit, or assist. Current value: ${process.env.PDF_VISUAL_AI_MODE}`);
  }
  if (mode !== "off") {
    if (!["mistral", "fixture"].includes(provider)) {
      errors.push(`PDF_VISUAL_AI_PROVIDER must be mistral or fixture when visual AI is enabled. Current value: ${provider}`);
    }
    if (provider === "mistral" && !configuredMistralKey()) {
      errors.push("PDF visual AI is enabled with Mistral, but PDF_VISUAL_AI_MISTRAL_API_KEY or MISTRAL_API_KEY is missing.");
    }
    const productionWorker = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
    if (provider === "fixture" && productionWorker && process.env.PDF_VISUAL_AI_ALLOW_FIXTURE_IN_PRODUCTION !== "1") {
      errors.push("PDF_VISUAL_AI_PROVIDER=fixture is only for local/evaluation runs. Set PDF_VISUAL_AI_PROVIDER=mistral for Railway production.");
    }
    if (mode === "assist") {
      warnings.push("PDF_VISUAL_AI_MODE=assist can influence crop-candidate generation, but generated evidence remains review-only.");
    }
  }
  if (parseMaxPages() > 25) warnings.push("PDF_VISUAL_AI_MAX_PAGES is above 25; watch provider latency and cost before using this in production.");
  return { enabled: mode !== "off", mode, provider, errors, warnings };
}

function visualAiProviderName() {
  return (process.env.PDF_VISUAL_AI_PROVIDER || "mistral").trim().toLowerCase();
}

function configuredMistralKey() {
  return process.env.PDF_VISUAL_AI_MISTRAL_API_KEY || process.env.MISTRAL_API_KEY || "";
}

function numberFromRecord(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pageDimensions(page: AnalysisPage) {
  for (const block of page.raw_blocks || []) {
    const pageWidth = numberFromRecord(block, "page_width");
    const pageHeight = numberFromRecord(block, "page_height");
    if (pageWidth && pageHeight) return { pageWidth, pageHeight };
  }
  return { pageWidth: null, pageHeight: null };
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function draftNeedsVisualEvidence(draft: AnalysisDraft | PdfImportDraftQuestion) {
  const text = [
    draft.question_text,
    ...(draft.choices || []).map((choice) => choice.text),
    draft.scoring_notes,
    draft.explanation,
    ...(draft.warnings || [])
  ].join(" ");
  return /figure|diagram|graph|table|shown|below|image|plot|chart|grid|data/i.test(text) ||
    ((draft.choices || []).length > 0 && (draft.choices || []).some((choice) => clean(choice.text).length < 8 || /^Choice\s+[A-E]$/i.test(clean(choice.text))));
}

function draftAssetType(draft: AnalysisDraft): "diagram" | "table" | "unknown" {
  const text = [draft.question_text, ...(draft.choices || []).map((choice) => choice.text)].join(" ");
  if (/table/i.test(text) && !/diagram|graph|figure|image|plot|chart/i.test(text)) return "table";
  if (/diagram|graph|figure|image|plot|chart|shown|below|grid/i.test(text)) return "diagram";
  return "unknown";
}

function visualBlockCount(page: AnalysisPage) {
  return (page.raw_blocks || []).filter((block) => ["image", "table", "vector"].includes(String(block.kind))).length;
}

function parseMaxPages() {
  const raw = process.env.PDF_VISUAL_AI_MAX_PAGES;
  if (!raw) return DEFAULT_VISUAL_AI_MAX_PAGES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_VISUAL_AI_MAX_PAGES;
}

function parseLowConfidence() {
  const raw = process.env.PDF_VISUAL_AI_LOW_CONFIDENCE;
  if (!raw) return DEFAULT_VISUAL_AI_LOW_CONFIDENCE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VISUAL_AI_LOW_CONFIDENCE;
}

function parseTimeoutMs() {
  const raw = process.env.PDF_VISUAL_AI_TIMEOUT_MS;
  if (!raw) return DEFAULT_VISUAL_AI_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 300_000 ? Math.floor(parsed) : DEFAULT_VISUAL_AI_TIMEOUT_MS;
}

function parseMaxImageBytes() {
  const raw = process.env.PDF_VISUAL_AI_MAX_IMAGE_BYTES;
  if (!raw) return DEFAULT_VISUAL_AI_MAX_IMAGE_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_VISUAL_AI_MAX_IMAGE_BYTES;
}

function parseRetries() {
  const raw = process.env.PDF_VISUAL_AI_RETRIES;
  if (!raw) return DEFAULT_VISUAL_AI_RETRIES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 3 ? Math.floor(parsed) : DEFAULT_VISUAL_AI_RETRIES;
}

function failClosed() {
  return process.env.PDF_VISUAL_AI_FAIL_CLOSED === "1";
}

function shouldIncludeProviderImageBase64() {
  return process.env.PDF_VISUAL_AI_MISTRAL_INCLUDE_IMAGE_BASE64 === "1";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function selectedVisualAiPages(analysis: PdfImportAnalysisInput) {
  const byPage = new Map<number, { page: AnalysisPage; reasons: string[] }>();
  const pages = new Map(analysis.pages.map((page) => [page.page_number, page]));
  const add = (pageNumber: number, reason: string) => {
    const page = pages.get(pageNumber);
    if (!page) return;
    const existing = byPage.get(pageNumber) || { page, reasons: [] };
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    byPage.set(pageNumber, existing);
  };

  for (const draft of analysis.draftQuestions) {
    if (!draftNeedsVisualEvidence(draft) && draft.type !== "frq") continue;
    for (let pageNumber = draft.source_page_start; pageNumber <= draft.source_page_end; pageNumber += 1) {
      if (draftNeedsVisualEvidence(draft)) add(pageNumber, "draft references visual/table/graph evidence");
      if (draft.type === "frq" && draft.source_page_end > draft.source_page_start) add(pageNumber, "FRQ spans multiple pages and may need continuation context");
    }
  }

  const lowConfidenceThreshold = parseLowConfidence();
  for (const page of analysis.pages) {
    if (page.confidence !== null && page.confidence < lowConfidenceThreshold) add(page.page_number, `OCR confidence below ${Math.round(lowConfidenceThreshold * 100)}%`);
    if (visualBlockCount(page) > 0 && !(analysis.draftAssets || []).some((asset) => asset.page_number === page.page_number && asset.image_url)) {
      add(page.page_number, "visual regions exist without rendered crop evidence");
    }
  }

  return Array.from(byPage.values())
    .sort((a, b) => a.page.page_number - b.page.page_number)
    .slice(0, parseMaxPages());
}

async function pageImageInput(page: AnalysisPage): Promise<PdfVisualAiPageInput | null> {
  const imageUrl = page.page_image_url;
  if (!imageUrl) return null;
  let imageBytes: Buffer;
  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetchWithTimeout(imageUrl, {}, parseTimeoutMs());
    if (!response.ok) return null;
    imageBytes = Buffer.from(await response.arrayBuffer());
  } else if (imageUrl.startsWith("/uploads/")) {
    imageBytes = await readFile(path.join(process.cwd(), "public", imageUrl.replace(/^\/+/, "")));
  } else {
    return null;
  }
  if (imageBytes.length > parseMaxImageBytes()) {
    throw new Error(`rendered page image is ${imageBytes.length} bytes, above PDF_VISUAL_AI_MAX_IMAGE_BYTES`);
  }
  const { pageWidth, pageHeight } = pageDimensions(page);
  return { pageNumber: page.page_number, imageUrl, imageBytes, contentType: "image/png", pageWidth, pageHeight };
}

function dataUrl(input: PdfVisualAiPageInput) {
  return `data:${input.contentType};base64,${input.imageBytes.toString("base64")}`;
}

function markdownFromMistral(raw: JsonRecord) {
  if (typeof raw.markdown === "string") return raw.markdown;
  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  return pages.map((page) => typeof page?.markdown === "string" ? page.markdown : "").filter(Boolean).join("\n\n");
}

function bboxFromUnknown(value: unknown): [number, number, number, number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawBbox = record.bbox;
  if (Array.isArray(rawBbox) && rawBbox.length === 4 && rawBbox.every((item) => typeof item === "number" && Number.isFinite(item))) {
    const [x0, y0, x1, y1] = rawBbox as [number, number, number, number];
    if (x1 > x0 && y1 > y0) return [x0, y0, x1, y1];
  }
  const x = typeof record.x === "number" ? record.x : typeof record.left === "number" ? record.left : typeof record.top_left_x === "number" ? record.top_left_x : null;
  const y = typeof record.y === "number" ? record.y : typeof record.top === "number" ? record.top : typeof record.top_left_y === "number" ? record.top_left_y : null;
  const width = typeof record.width === "number" ? record.width : null;
  const height = typeof record.height === "number" ? record.height : null;
  if (x !== null && y !== null && width && height) return [x, y, x + width, y + height];
  const x1 = typeof record.right === "number" ? record.right : typeof record.bottom_right_x === "number" ? record.bottom_right_x : null;
  const y1 = typeof record.bottom === "number" ? record.bottom : typeof record.bottom_right_y === "number" ? record.bottom_right_y : null;
  if (x !== null && y !== null && x1 !== null && y1 !== null && x1 > x && y1 > y) return [x, y, x1, y1];
  return null;
}

function providerImageExtension(contentType: string) {
  if (/jpe?g/i.test(contentType)) return "jpg";
  if (/webp/i.test(contentType)) return "webp";
  return "png";
}

async function saveProviderImage(imageBase64: unknown, provider: string, pageNumber: number) {
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) return null;
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = match?.[1] || "image/png";
  const encoded = match?.[2] || imageBase64;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > parseMaxImageBytes()) return null;
  const relativeUrl = `/uploads/pdf-import-ai-evidence/${provider}-${pageNumber}-${randomUUID()}.${providerImageExtension(contentType)}`;
  const target = path.join(process.cwd(), "public", relativeUrl.replace(/^\/+/, ""));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return relativeUrl;
}

async function blocksFromMistral(pageNumber: number, raw: JsonRecord, input: PdfVisualAiPageInput, provider: string) {
  const pages = Array.isArray(raw.pages) ? raw.pages : [raw];
  const blocks: JsonRecord[] = [];
  for (const page of pages) {
    const pageRecord = page && typeof page === "object" ? page as Record<string, unknown> : {};
    const collections = [
      { key: "images", kind: "image", visualType: "diagram" },
      { key: "figures", kind: "image", visualType: "diagram" },
      { key: "tables", kind: "table", visualType: "table" }
    ];
    for (const collection of collections) {
      const items = Array.isArray(pageRecord[collection.key]) ? pageRecord[collection.key] as unknown[] : [];
      for (const [index, item] of items.entries()) {
        const itemRecord = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const bbox = bboxFromUnknown(item);
        const text = [
          typeof itemRecord.id === "string" ? itemRecord.id : "",
          typeof itemRecord.caption === "string" ? itemRecord.caption : "",
          typeof itemRecord.markdown === "string" ? itemRecord.markdown : ""
        ].filter(Boolean).join(" ");
        const imageUrl = shouldIncludeProviderImageBase64()
          ? await saveProviderImage(itemRecord.image_base64, provider, pageNumber)
          : null;
        blocks.push({
          kind: collection.kind,
          source: provider,
          text,
          ...(bbox ? { bbox } : {}),
          ...(imageUrl ? { image_url: imageUrl } : {}),
          page_width: input.pageWidth || undefined,
          page_height: input.pageHeight || undefined,
          block_number: index,
          visual_type: collection.visualType,
          confidence: typeof itemRecord.confidence === "number" ? itemRecord.confidence : undefined,
          ai_visual_evidence: true
        });
      }
    }
  }
  return blocks;
}

function markdownEvidenceBlock(pageNumber: number, provider: string, markdown: string, raw: JsonRecord, input: PdfVisualAiPageInput) {
  return {
    kind: "ai_visual_markdown",
    source: provider,
    text: markdown,
    page_number: pageNumber,
    page_image_url: input.imageUrl,
    page_width: input.pageWidth || undefined,
    page_height: input.pageHeight || undefined,
    raw_provider_output: raw
  } satisfies JsonRecord;
}

function fixtureProvider(): PdfVisualAiProvider {
  return {
    name: "fixture-visual-ai",
    async analyzePages(pages) {
      return pages.map((page) => {
        const width = page.pageWidth || 612;
        const height = page.pageHeight || 792;
        const bbox: [number, number, number, number] = [
          Math.round(width * 0.2),
          Math.round(height * 0.2),
          Math.round(width * 0.8),
          Math.round(height * 0.55)
        ];
        const markdown = `Fixture visual evidence for page ${page.pageNumber}.\n\n| evidence | status |\n| --- | --- |\n| diagram/table candidate | review only |`;
        return {
          pageNumber: page.pageNumber,
          provider: "fixture-visual-ai",
          markdown,
          raw: { provider: "fixture-visual-ai", markdown, pages: [{ images: [{ id: "fixture-visual", bbox }] }] },
          blocks: [{
            kind: "image",
            source: "fixture-visual-ai",
            text: "fixture-visual",
            bbox,
            page_width: width,
            page_height: height,
            block_number: 0,
            visual_type: "diagram",
            ai_visual_evidence: true
          }],
          warnings: ["Fixture visual AI provider used for local audit flow verification."]
        };
      });
    }
  };
}

function mistralProvider(): PdfVisualAiProvider | null {
  const apiKey = configuredMistralKey();
  if (!apiKey) return null;
  const endpoint = process.env.PDF_VISUAL_AI_MISTRAL_ENDPOINT || "https://api.mistral.ai/v1/ocr";
  const model = process.env.PDF_VISUAL_AI_MISTRAL_MODEL || "mistral-ocr-latest";
  return {
    name: "mistral-ocr",
    async analyzePages(pages) {
      const results: PdfVisualAiPageResult[] = [];
      for (const page of pages) {
        let result: PdfVisualAiPageResult | null = null;
        const retries = parseRetries();
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const response = await fetchWithTimeout(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model,
                document: {
                  type: "image_url",
                  image_url: dataUrl(page)
                },
                table_format: process.env.PDF_VISUAL_AI_MISTRAL_TABLE_FORMAT || "markdown",
                confidence_scores_granularity: process.env.PDF_VISUAL_AI_MISTRAL_CONFIDENCE || "page",
                include_image_base64: shouldIncludeProviderImageBase64()
              })
            }, parseTimeoutMs());
            if (response.ok) {
              const raw = await response.json() as JsonRecord;
              const markdown = markdownFromMistral(raw);
              result = {
                pageNumber: page.pageNumber,
                provider: "mistral-ocr",
                markdown,
                raw,
                blocks: await blocksFromMistral(page.pageNumber, raw, page, "mistral-ocr"),
                warnings: markdown ? [] : [`Mistral OCR returned no markdown for page ${page.pageNumber}.`]
              };
              break;
            }
            const body = await response.text();
            const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
            if (!retryable || attempt >= retries) {
              result = {
                pageNumber: page.pageNumber,
                provider: "mistral-ocr",
                markdown: "",
                raw: { error: `Mistral OCR failed with ${response.status}`, body },
                blocks: [],
                warnings: [`Mistral OCR failed for page ${page.pageNumber} with status ${response.status}.`]
              };
              break;
            }
          } catch (error) {
            if (attempt >= retries) {
              result = {
                pageNumber: page.pageNumber,
                provider: "mistral-ocr",
                markdown: "",
                raw: { error: error instanceof Error ? error.message : "Mistral OCR request failed." },
                blocks: [],
                warnings: [`Mistral OCR request failed for page ${page.pageNumber}: ${error instanceof Error ? error.message : "request failed"}.`]
              };
              break;
            }
          }
          await delay(750 * (attempt + 1));
        }
        if (result) results.push(result);
      }
      return results;
    }
  };
}

function visualAiProvider(): PdfVisualAiProvider | null {
  if (visualAiProviderName() === "fixture") return fixtureProvider();
  return mistralProvider();
}

function withAiRawBlocks(page: AnalysisPage, result: PdfVisualAiPageResult, input: PdfVisualAiPageInput): AnalysisPage {
  return {
    ...page,
    raw_blocks: [
      ...(page.raw_blocks || []),
      markdownEvidenceBlock(page.page_number, result.provider, result.markdown, result.raw, input),
      ...result.blocks
    ],
    warnings: Array.from(new Set([
      ...page.warnings,
      ...result.warnings,
      `AI visual evidence audit ran with ${result.provider}; output is review-only and untrusted until verified.`
    ]))
  };
}

function draftAssetsFromAiResults(analysis: PdfImportAnalysisInput, results: PdfVisualAiPageResult[]) {
  const assets: AnalysisDraftAsset[] = [];
  for (const result of results) {
    const matchingDraftIndexes = analysis.draftQuestions
      .map((draft, index) => ({ draft, index }))
      .filter(({ draft }) => draftNeedsVisualEvidence(draft) && result.pageNumber >= draft.source_page_start && result.pageNumber <= draft.source_page_end)
      .slice(0, 3);
    for (const { draft, index } of matchingDraftIndexes) {
      const blocksWithEvidence = result.blocks
        .filter((block) => Array.isArray(block.bbox) || typeof block.image_url === "string")
        .slice(0, 2);
      if (blocksWithEvidence.length === 0) {
        assets.push({
          draft_question_index: index,
          page_number: result.pageNumber,
          asset_type: draftAssetType(draft),
          image_url: null,
          bbox: {
            page_number: result.pageNumber,
            source: result.provider,
            markdown: result.markdown.slice(0, 4000),
            ai_visual_evidence: true
          },
          keep_for_question: false,
          status: "candidate",
          notes: `AI visual evidence from ${result.provider}. Review-only markdown/table/figure output; no crop was auto-selected.`
        });
      }
      for (const [blockIndex, block] of blocksWithEvidence.entries()) {
        assets.push({
          draft_question_index: index,
          page_number: result.pageNumber,
          asset_type: draftAssetType(draft),
          image_url: typeof block.image_url === "string" ? block.image_url : null,
          bbox: {
            page_number: result.pageNumber,
            ...(Array.isArray(block.bbox) ? { bbox: block.bbox } : {}),
            source: result.provider,
            block_number: blockIndex,
            ai_visual_evidence: true,
            markdown: result.markdown.slice(0, 2000)
          },
          keep_for_question: false,
          status: "candidate",
          notes: `AI visual evidence candidate from ${result.provider}. This is review-only provider output; admin must verify and crop before saving.`
        });
      }
    }
  }
  return assets;
}

export async function enhancePdfVisualEvidence(
  pdf: PdfUpload,
  analysis: PdfImportAnalysisInput
): Promise<PdfVisualAiEnhancementResult> {
  void pdf;
  const mode = getPdfVisualAiMode();
  if (mode === "off") return { analysis, mode, provider: null, enhanced: false, shouldRefinalize: false, warnings: [] };

  const provider = visualAiProvider();
  if (!provider) {
    const warning = "PDF visual AI enhancement skipped: configure MISTRAL_API_KEY or PDF_VISUAL_AI_MISTRAL_API_KEY, or set PDF_VISUAL_AI_PROVIDER=fixture for local flow tests.";
    return {
      analysis: { ...analysis, warnings: Array.from(new Set([...analysis.warnings, warning])) },
      mode,
      provider: null,
      enhanced: false,
      shouldRefinalize: false,
      warnings: [warning]
    };
  }

  const selectedPages = selectedVisualAiPages(analysis);
  if (selectedPages.length === 0) {
    const warning = "PDF visual AI enhancement found no hard visual pages to inspect.";
    return {
      analysis: { ...analysis, warnings: Array.from(new Set([...analysis.warnings, warning])) },
      mode,
      provider: provider.name,
      enhanced: false,
      shouldRefinalize: false,
      warnings: [warning]
    };
  }

  const pageInputs: PdfVisualAiPageInput[] = [];
  const warnings: string[] = [];
  for (const { page, reasons } of selectedPages) {
    try {
      const input = await pageImageInput(page);
      if (input) {
        pageInputs.push(input);
      } else {
        warnings.push(`PDF visual AI skipped page ${page.page_number}: no rendered page image was available. Reasons: ${reasons.join("; ")}.`);
      }
    } catch (error) {
      warnings.push(`PDF visual AI skipped page ${page.page_number}: ${error instanceof Error ? error.message : "unable to read rendered page image"}.`);
    }
  }
  if (pageInputs.length === 0) {
    return {
      analysis: { ...analysis, warnings: Array.from(new Set([...analysis.warnings, ...warnings])) },
      mode,
      provider: provider.name,
      enhanced: false,
      shouldRefinalize: false,
      warnings
    };
  }

  let results: PdfVisualAiPageResult[];
  try {
    results = await provider.analyzePages(pageInputs);
  } catch (error) {
    if (failClosed()) throw error;
    const warning = `PDF visual AI enhancement failed open with ${provider.name}: ${error instanceof Error ? error.message : "provider request failed"}.`;
    return {
      analysis: { ...analysis, warnings: Array.from(new Set([...analysis.warnings, ...warnings, warning])) },
      mode,
      provider: provider.name,
      enhanced: false,
      shouldRefinalize: false,
      warnings: [...warnings, warning]
    };
  }
  const resultByPage = new Map(results.map((result) => [result.pageNumber, result]));
  const inputByPage = new Map(pageInputs.map((input) => [input.pageNumber, input]));
  const pages = analysis.pages.map((page) => {
    const result = resultByPage.get(page.page_number);
    const input = inputByPage.get(page.page_number);
    return result && input ? withAiRawBlocks(page, result, input) : page;
  });
  const aiAssets = mode === "audit" ? draftAssetsFromAiResults(analysis, results) : [];
  const providerWarnings = results.flatMap((result) => result.warnings);
  const summaryWarning = `PDF visual AI ${mode} mode inspected ${results.length} page(s) with ${provider.name}; all output is review-only.`;
  const nextAnalysis = {
    ...analysis,
    ocrProvider: analysis.ocrProvider.includes("visual-ai") ? analysis.ocrProvider : `${analysis.ocrProvider}+visual-ai`,
    warnings: Array.from(new Set([...analysis.warnings, ...warnings, ...providerWarnings, summaryWarning])),
    pages,
    draftAssets: [...(analysis.draftAssets || []), ...aiAssets]
  };

  return {
    analysis: nextAnalysis,
    mode,
    provider: provider.name,
    enhanced: results.length > 0,
    shouldRefinalize: mode === "assist" && results.some((result) => result.blocks.length > 0),
    warnings: [summaryWarning, ...warnings, ...providerWarnings]
  };
}
