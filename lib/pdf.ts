import { existsSync } from "node:fs";
import { execFile, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { inferSubjectFromCourse, normalizeExamType, normalizeSection, parseYearFromText } from "@/lib/ap-taxonomy";
import type { PdfImportAnalysisInput } from "@/lib/data";
import type {
  PdfFrqPartDraft,
  PdfImportDraftQuestion,
  PdfImportPage,
  PdfUpload,
  JsonRecord,
  QuestionChoice
} from "@/lib/types";

export const PARSER_VERSION = "pdf-import-mvp-2026-06-13";
const CHOICE_MARKER_RE = /(?:^|\s)(?:\(([A-E])\)|([A-E])[\).])\s+/g;
const FRQ_PART_RE = /(?:^|\s)\(((?:[a-g])|(?:i{1,3}|iv|v))\)\s+/gi;
const DEFAULT_OCR_MAX_PAGES = 12;
const DEFAULT_OCR_PSM = 3;
const DEFAULT_OCR_TRIAGE_SAMPLE_PAGES = 48;
const DEFAULT_OCR_TRIAGE_DPI = 105;
const DEFAULT_OCR_TRIAGE_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_MAX_PAGES = 24;
const DEFAULT_OCR_TIMEOUT_MS = 30_000;
const DEFAULT_OCR_TIMEOUT_PER_PAGE_MS = 15_000;
const MAX_DEFAULT_OCR_TIMEOUT_MS = 600_000;
const DEFAULT_TEXT_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

type DraftQuestionWithoutStorage = PdfImportAnalysisInput["draftQuestions"][number];
type PageWithoutStorage = PdfImportAnalysisInput["pages"][number];
type PdfQuestionSection = "mcq" | "frq" | "unknown" | "non_question";

interface QuestionBlockCandidate {
  questionNumber: number | null;
  pageStart: number;
  pageEnd: number;
  text: string;
  pageNumbers?: number[];
  section: PdfQuestionSection;
}

interface AnswerKeyEntry {
  questionNumber: number;
  answer: string;
  pageNumber: number;
}

interface ExplanationEntry {
  questionNumber: number;
  explanation: string;
  pageNumber: number;
}

interface ScoringContentClassification {
  shouldSuppressDrafts: boolean;
  textPageCount: number;
  scoringHeavyPageNumbers: number[];
  scoringOnlyPageNumbers: number[];
  questionLikePageNumbers: number[];
  warningsByPage: Map<number, string[]>;
  warnings: string[];
}

interface OcrProvider {
  name: string;
  analyzePage(pageNumber: number): Promise<{
    text: string;
    status: PdfImportPage["ocr_status"];
    pageImageUrl: string | null;
    warnings: string[];
  }>;
}

const unavailableOcrProvider: OcrProvider = {
  name: "unavailable-local-ocr",
  async analyzePage(pageNumber) {
    return {
      text: "",
      status: "unavailable",
      pageImageUrl: null,
      warnings: [
        `Page ${pageNumber} appears scanned or image-only. Local OCR/rendering is not configured yet, so this page needs OCR before question segmentation.`
      ]
    };
  }
};

interface LocalOcrPageResult {
  page_number: number;
  status: PdfImportPage["ocr_status"];
  text: string;
  raw_text?: string;
  raw_blocks?: JsonRecord[];
  confidence: number | null;
  image_url: string | null;
  warnings: string[];
}

interface LocalOcrRunResult {
  provider: string;
  results: Map<number, LocalOcrPageResult>;
  warnings: string[];
  skippedPageNumbers: Set<number>;
}

interface LocalRenderRunResult {
  results: Map<number, { page_number: number; image_url: string | null; warnings: string[] }>;
  warnings: string[];
  skippedPageNumbers: Set<number>;
}

interface VisualCropCandidate {
  candidateId: string;
  draftIndex: number;
  pageNumber: number;
  assetType: "diagram" | "table" | "unknown";
  bbox: [number, number, number, number];
  blockNumber: number | null;
  source: string;
  association: string;
  associationScore: number;
  associationConfidence: "high" | "medium" | "low";
  questionWindowOverlap: number;
}

interface LocalVisualCropRunResult {
  results: Map<string, { candidate_id: string; page_number: number; image_url: string | null; bbox: [number, number, number, number] | null; warnings: string[] }>;
  warnings: string[];
}

interface LocalTextPageResult {
  page_number: number;
  text: string;
  raw_blocks: JsonRecord[];
  warnings: string[];
}

interface LocalTextRunResult {
  provider: "pymupdf-text" | "embedded-text";
  pageCount: number | null;
  results: Map<number, LocalTextPageResult>;
  warnings: string[];
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "pdf";
}

function commandExists(candidate: string) {
  if (path.isAbsolute(candidate)) return existsSync(candidate);
  return spawnSync(candidate, ["--version"], { stdio: "ignore", windowsHide: true }).status === 0;
}

function findPythonCommand() {
  if (process.env.PDF_OCR_PYTHON) {
    return commandExists(process.env.PDF_OCR_PYTHON) ? process.env.PDF_OCR_PYTHON : null;
  }
  return ["D:\\Anaconda\\python.exe", "python3", "python"].find(commandExists) || null;
}

function findTesseractCommand() {
  if (process.env.TESSERACT_CMD) {
    return commandExists(process.env.TESSERACT_CMD) ? process.env.TESSERACT_CMD : null;
  }
  return ["D:\\Codex\\tools\\tesseract-ocr\\tesseract.exe", "tesseract"].find(commandExists) || null;
}

function findTextPythonCommand() {
  if (process.env.PDF_TEXT_PYTHON) {
    return commandExists(process.env.PDF_TEXT_PYTHON) ? process.env.PDF_TEXT_PYTHON : null;
  }
  return findPythonCommand();
}

function parseOcrMaxPages() {
  const raw = process.env.PDF_OCR_MAX_PAGES;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_OCR_MAX_PAGES, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      value: DEFAULT_OCR_MAX_PAGES,
      warning: `Invalid PDF_OCR_MAX_PAGES value "${raw}". Using the default limit of ${DEFAULT_OCR_MAX_PAGES} pages.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function parseOcrPsm() {
  const raw = process.env.PDF_OCR_PSM;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_OCR_PSM, warning: null as string | null };
  const parsed = Number(raw);
  if (![3, 4, 6, 11].includes(parsed)) {
    return {
      value: DEFAULT_OCR_PSM,
      warning: `Invalid PDF_OCR_PSM value "${raw}". Using the default page segmentation mode of ${DEFAULT_OCR_PSM}.`
    };
  }
  return { value: parsed, warning: null as string | null };
}

function parseOcrTriageSamplePages() {
  const raw = process.env.PDF_OCR_TRIAGE_SAMPLE_PAGES;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_OCR_TRIAGE_SAMPLE_PAGES, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      value: DEFAULT_OCR_TRIAGE_SAMPLE_PAGES,
      warning: `Invalid PDF_OCR_TRIAGE_SAMPLE_PAGES value "${raw}". Using the default of ${DEFAULT_OCR_TRIAGE_SAMPLE_PAGES} sampled pages.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function parseOcrTriageTimeoutMs() {
  const raw = process.env.PDF_OCR_TRIAGE_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_OCR_TRIAGE_TIMEOUT_MS, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: DEFAULT_OCR_TRIAGE_TIMEOUT_MS,
      warning: `Invalid PDF_OCR_TRIAGE_TIMEOUT_MS value "${raw}". Using the default timeout of ${DEFAULT_OCR_TRIAGE_TIMEOUT_MS} ms.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function parseOcrTimeoutMs(pageCount: number) {
  const scaledDefault = Math.min(
    MAX_DEFAULT_OCR_TIMEOUT_MS,
    Math.max(DEFAULT_OCR_TIMEOUT_MS, pageCount * DEFAULT_OCR_TIMEOUT_PER_PAGE_MS)
  );
  const raw = process.env.PDF_OCR_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return { value: scaledDefault, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: scaledDefault,
      warning: `Invalid PDF_OCR_TIMEOUT_MS value "${raw}". Using the page-scaled default timeout of ${scaledDefault} ms.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function parseRenderMaxPages() {
  const raw = process.env.PDF_RENDER_MAX_PAGES;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_RENDER_MAX_PAGES, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      value: DEFAULT_RENDER_MAX_PAGES,
      warning: `Invalid PDF_RENDER_MAX_PAGES value "${raw}". Using the default limit of ${DEFAULT_RENDER_MAX_PAGES} pages.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function parseTextTimeoutMs() {
  const raw = process.env.PDF_TEXT_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_TEXT_TIMEOUT_MS, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: DEFAULT_TEXT_TIMEOUT_MS,
      warning: `Invalid PDF_TEXT_TIMEOUT_MS value "${raw}". Using the default timeout of ${DEFAULT_TEXT_TIMEOUT_MS} ms.`
    };
  }
  return { value: Math.floor(parsed), warning: null as string | null };
}

function stringFromChildOutput(value: unknown) {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function workerFailureMessage(error: unknown, fallback: string) {
  const childError = error as { stdout?: unknown; stderr?: unknown } | null;
  const stdout = stringFromChildOutput(childError?.stdout);
  const jsonStart = stdout.lastIndexOf('{"ok"');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(stdout.slice(jsonStart)) as { ok?: boolean; error?: string };
      if (parsed.ok === false && parsed.error) return parsed.error;
    } catch {
      // Fall through to stderr/Error.message.
    }
  }

  const stderr = stringFromChildOutput(childError?.stderr).trim();
  if (stderr) return stderr.split(/\r?\n/).slice(-3).join("\n");

  const message = error instanceof Error ? error.message : fallback;
  return message.replaceAll(process.cwd(), "<project>");
}

async function materializePdfForWorker(pdf: PdfUpload) {
  if (!/^https?:\/\//i.test(pdf.file_url) && !pdf.file_url.startsWith("/")) return pdf.file_url;
  const bytes = await loadPdfBytes(pdf);
  const tempDir = path.join(process.cwd(), ".pdf-ocr-temp");
  await mkdir(tempDir, { recursive: true });
  const pdfPath = path.join(tempDir, `${safePathSegment(pdf.id)}.pdf`);
  await writeFile(pdfPath, bytes);
  return pdfPath;
}

async function runLocalStructuredTextExtraction(pdf: PdfUpload) {
  const pythonPath = findTextPythonCommand();
  const warnings: string[] = [];
  if (!pythonPath) {
    if (process.env.PDF_TEXT_PYTHON) warnings.push(`Configured PDF_TEXT_PYTHON was not found: ${process.env.PDF_TEXT_PYTHON}`);
    else if (process.env.PDF_OCR_PYTHON) warnings.push(`Configured PDF_OCR_PYTHON was not found: ${process.env.PDF_OCR_PYTHON}`);
    return {
      provider: "embedded-text",
      pageCount: null,
      results: new Map<number, LocalTextPageResult>(),
      warnings
    } satisfies LocalTextRunResult;
  }

  const { value: timeoutMs, warning: timeoutWarning } = parseTextTimeoutMs();
  if (timeoutWarning) warnings.push(timeoutWarning);

  try {
    const pdfPath = await materializePdfForWorker(pdf);
    const env = {
      ...process.env,
      PYTHONPATH: [
        process.env.PDF_OCR_PYTHONPATH,
        "D:\\Codex\\tools\\pdf-ocr-python",
        process.env.PYTHONPATH
      ]
        .filter(Boolean)
        .join(path.delimiter)
    };
    const { stdout } = await execFileAsync(
      pythonPath,
      [
        path.join(process.cwd(), "scripts", "pdf-text-worker.py"),
        "--pdf",
        pdfPath
      ],
      { env, maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs }
    );
    const jsonStart = stdout.lastIndexOf('{"ok"');
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const parsed = JSON.parse(jsonText) as {
      ok: boolean;
      error?: string;
      page_count?: number;
      pages?: LocalTextPageResult[];
    };
    if (!parsed.ok) {
      return {
        provider: "embedded-text",
        pageCount: null,
        results: new Map<number, LocalTextPageResult>(),
        warnings: [...warnings, parsed.error || "Structured PDF text extraction failed."]
      } satisfies LocalTextRunResult;
    }
    return {
      provider: "pymupdf-text",
      pageCount: Number.isInteger(parsed.page_count) ? parsed.page_count || null : null,
      results: new Map((parsed.pages || []).map((page) => [page.page_number, page])),
      warnings
    } satisfies LocalTextRunResult;
  } catch (error) {
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerMessage = workerFailureMessage(error, "Structured PDF text extraction failed.");
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(workerMessage)
        ? `Structured PDF text worker timed out after ${timeoutMs} ms.`
        : workerMessage;
    return {
      provider: "embedded-text",
      pageCount: null,
      results: new Map<number, LocalTextPageResult>(),
      warnings: [...warnings, workerWarning]
    } satisfies LocalTextRunResult;
  }
}

async function runLocalTesseractOcr(pdf: PdfUpload, pageNumbers: number[]) {
  const tesseractCmd = findTesseractCommand();
  if (!tesseractCmd) {
    return {
      provider: unavailableOcrProvider.name,
      results: new Map<number, LocalOcrPageResult>(),
      warnings: [
        process.env.TESSERACT_CMD
          ? `Configured TESSERACT_CMD was not found: ${process.env.TESSERACT_CMD}`
          : "Tesseract executable was not found. Install Tesseract or set TESSERACT_CMD."
      ],
      skippedPageNumbers: new Set<number>()
    } satisfies LocalOcrRunResult;
  }

  const pythonPath = findPythonCommand();
  if (!pythonPath) {
    return {
      provider: unavailableOcrProvider.name,
      results: new Map<number, LocalOcrPageResult>(),
      warnings: [
        process.env.PDF_OCR_PYTHON
          ? `Configured PDF_OCR_PYTHON was not found: ${process.env.PDF_OCR_PYTHON}`
          : "Python executable was not found. Set PDF_OCR_PYTHON to enable local OCR."
      ],
      skippedPageNumbers: new Set<number>()
    } satisfies LocalOcrRunResult;
  }

  const { value: maxPages, warning: maxPagesWarning } = parseOcrMaxPages();
  const { value: psm, warning: psmWarning } = parseOcrPsm();
  const triage = maxPages > 0 && pageNumbers.length > maxPages
    ? await runLocalOcrTriage(pdf, pageNumbers, maxPages, pythonPath, tesseractCmd)
    : { selectedPages: pageNumbers, warnings: [] as string[] };
  const selectedPages = maxPages > 0 ? triage.selectedPages.slice(0, maxPages) : pageNumbers;
  const { value: timeoutMs, warning: timeoutWarning } = parseOcrTimeoutMs(selectedPages.length);
  const skippedPageNumbers = new Set(pageNumbers.filter((pageNumber) => !selectedPages.includes(pageNumber)));
  const warnings = [
    ...triage.warnings,
    ...(
    maxPages > 0 && pageNumbers.length > selectedPages.length
      ? [`Full OCR limited to ${selectedPages.length} of ${pageNumbers.length} requested pages. Set PDF_OCR_MAX_PAGES=0 to process all pages.`]
      : []
    )
  ];
  if (maxPagesWarning) warnings.unshift(maxPagesWarning);
  if (psmWarning) warnings.unshift(psmWarning);
  if (timeoutWarning) warnings.unshift(timeoutWarning);
  if (selectedPages.length === 0) {
    return { provider: "tesseract-local", results: new Map<number, LocalOcrPageResult>(), warnings, skippedPageNumbers } satisfies LocalOcrRunResult;
  }

  const pdfPath = await materializePdfForWorker(pdf);
  const outputKey = `${safePathSegment(pdf.id)}-${Date.now().toString(36)}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", "pdf-import-pages", outputKey);
  const publicPrefix = `/uploads/pdf-import-pages/${outputKey}`;
  await mkdir(outputDir, { recursive: true });

  const env = {
    ...process.env,
    PYTHONPATH: [
      process.env.PDF_OCR_PYTHONPATH,
      "D:\\Codex\\tools\\pdf-ocr-python",
      process.env.PYTHONPATH
    ]
      .filter(Boolean)
      .join(path.delimiter)
  };

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [
        path.join(process.cwd(), "scripts", "pdf-ocr-worker.py"),
        "--pdf",
        pdfPath,
        "--pages",
        selectedPages.join(","),
        "--out-dir",
        outputDir,
        "--public-prefix",
        publicPrefix,
        "--tesseract-cmd",
        tesseractCmd,
        "--psm",
        String(psm)
      ],
      { env, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    const jsonStart = stdout.lastIndexOf('{"ok"');
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const parsed = JSON.parse(jsonText) as {
      ok: boolean;
      error?: string;
      pages?: LocalOcrPageResult[];
    };
    if (!parsed.ok) {
      return {
        provider: unavailableOcrProvider.name,
        results: new Map<number, LocalOcrPageResult>(),
        warnings: [...warnings, parsed.error || "Local OCR worker failed."],
        skippedPageNumbers
      } satisfies LocalOcrRunResult;
    }
    return {
      provider: "tesseract-local",
      results: new Map((parsed.pages || []).map((page) => [page.page_number, page])),
      warnings,
      skippedPageNumbers
    } satisfies LocalOcrRunResult;
  } catch (error) {
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerMessage = workerFailureMessage(error, "Local OCR worker failed.");
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(workerMessage)
        ? `Local OCR worker timed out after ${timeoutMs} ms.`
        : workerMessage;
    return {
      provider: unavailableOcrProvider.name,
      results: new Map<number, LocalOcrPageResult>(),
      warnings: [...warnings, workerWarning],
      skippedPageNumbers
    } satisfies LocalOcrRunResult;
  }
}

async function runLocalPageRender(pdf: PdfUpload, pageNumbers: number[]) {
  const pythonPath = findTextPythonCommand();
  const warnings: string[] = [];
  if (!pythonPath) {
    warnings.push(
      process.env.PDF_TEXT_PYTHON || process.env.PDF_OCR_PYTHON
        ? "Configured Python path for PDF rendering was not found."
        : "Python executable was not found. Set PDF_TEXT_PYTHON or PDF_OCR_PYTHON to render visual source pages."
    );
    return { results: new Map(), warnings, skippedPageNumbers: new Set<number>() } satisfies LocalRenderRunResult;
  }

  const uniquePageNumbers = Array.from(new Set(pageNumbers.filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0))).sort((a, b) => a - b);
  const { value: maxPages, warning: maxPagesWarning } = parseRenderMaxPages();
  const selectedPages = maxPages > 0 ? uniquePageNumbers.slice(0, maxPages) : uniquePageNumbers;
  const { value: timeoutMs, warning: timeoutWarning } = parseOcrTimeoutMs(selectedPages.length);
  const skippedPageNumbers = new Set(uniquePageNumbers.filter((pageNumber) => !selectedPages.includes(pageNumber)));
  if (maxPagesWarning) warnings.push(maxPagesWarning);
  if (timeoutWarning) warnings.push(timeoutWarning);
  if (maxPages > 0 && uniquePageNumbers.length > selectedPages.length) {
    warnings.push(`Source page rendering limited to first ${selectedPages.length} of ${uniquePageNumbers.length} visual-reference pages. Set PDF_RENDER_MAX_PAGES=0 to render all candidates.`);
  }
  if (selectedPages.length === 0) {
    return { results: new Map(), warnings, skippedPageNumbers } satisfies LocalRenderRunResult;
  }

  const pdfPath = await materializePdfForWorker(pdf);
  const outputKey = `${safePathSegment(pdf.id)}-visual-${Date.now().toString(36)}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", "pdf-import-pages", outputKey);
  const publicPrefix = `/uploads/pdf-import-pages/${outputKey}`;
  await mkdir(outputDir, { recursive: true });
  const env = {
    ...process.env,
    PYTHONPATH: [
      process.env.PDF_OCR_PYTHONPATH,
      "D:\\Codex\\tools\\pdf-ocr-python",
      process.env.PYTHONPATH
    ]
      .filter(Boolean)
      .join(path.delimiter)
  };

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [
        path.join(process.cwd(), "scripts", "pdf-ocr-worker.py"),
        "--pdf",
        pdfPath,
        "--pages",
        selectedPages.join(","),
        "--out-dir",
        outputDir,
        "--public-prefix",
        publicPrefix,
        "--render-only"
      ],
      { env, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    const jsonStart = stdout.lastIndexOf('{"ok"');
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const parsed = JSON.parse(jsonText) as {
      ok: boolean;
      error?: string;
      pages?: Array<{ page_number: number; image_url: string | null; warnings: string[] }>;
    };
    if (!parsed.ok) {
      return { results: new Map(), warnings: [...warnings, parsed.error || "PDF page rendering failed."], skippedPageNumbers } satisfies LocalRenderRunResult;
    }
    return {
      results: new Map((parsed.pages || []).map((page) => [page.page_number, page])),
      warnings,
      skippedPageNumbers
    } satisfies LocalRenderRunResult;
  } catch (error) {
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerMessage = workerFailureMessage(error, "PDF page rendering failed.");
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(workerMessage)
        ? `PDF page rendering timed out after ${timeoutMs} ms.`
        : workerMessage;
    return { results: new Map(), warnings: [...warnings, workerWarning], skippedPageNumbers } satisfies LocalRenderRunResult;
  }
}

async function runLocalVisualCropRender(pdf: PdfUpload, candidates: VisualCropCandidate[]) {
  const pythonPath = findTextPythonCommand();
  const warnings: string[] = [];
  if (!pythonPath) {
    warnings.push(
      process.env.PDF_TEXT_PYTHON || process.env.PDF_OCR_PYTHON
        ? "Configured Python path for PDF crop rendering was not found."
        : "Python executable was not found. Set PDF_TEXT_PYTHON or PDF_OCR_PYTHON to render visual evidence crops."
    );
    return { results: new Map(), warnings } satisfies LocalVisualCropRunResult;
  }
  if (candidates.length === 0) {
    return { results: new Map(), warnings } satisfies LocalVisualCropRunResult;
  }

  const { value: timeoutMs, warning: timeoutWarning } = parseOcrTimeoutMs(candidates.length);
  if (timeoutWarning) warnings.push(timeoutWarning);
  const pdfPath = await materializePdfForWorker(pdf);
  const outputKey = `${safePathSegment(pdf.id)}-crops-${Date.now().toString(36)}`;
  const outputDir = path.join(process.cwd(), "public", "uploads", "pdf-import-crops", outputKey);
  const publicPrefix = `/uploads/pdf-import-crops/${outputKey}`;
  await mkdir(outputDir, { recursive: true });
  const env = {
    ...process.env,
    PYTHONPATH: [
      process.env.PDF_OCR_PYTHONPATH,
      "D:\\Codex\\tools\\pdf-ocr-python",
      process.env.PYTHONPATH
    ]
      .filter(Boolean)
      .join(path.delimiter)
  };

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [
        path.join(process.cwd(), "scripts", "pdf-ocr-worker.py"),
        "--pdf",
        pdfPath,
        "--out-dir",
        outputDir,
        "--public-prefix",
        publicPrefix,
        "--render-only",
        "--crops-json",
        JSON.stringify(candidates.map((candidate) => ({
          candidate_id: candidate.candidateId,
          page_number: candidate.pageNumber,
          bbox: candidate.bbox
        })))
      ],
      { env, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    const jsonStart = stdout.lastIndexOf('{"ok"');
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const parsed = JSON.parse(jsonText) as {
      ok: boolean;
      error?: string;
      crops?: Array<{ candidate_id: string; page_number: number; image_url: string | null; bbox: [number, number, number, number] | null; warnings: string[] }>;
    };
    if (!parsed.ok) {
      return { results: new Map(), warnings: [...warnings, parsed.error || "PDF crop rendering failed."] } satisfies LocalVisualCropRunResult;
    }
    return {
      results: new Map((parsed.crops || []).map((crop) => [crop.candidate_id, crop])),
      warnings
    } satisfies LocalVisualCropRunResult;
  } catch (error) {
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerMessage = workerFailureMessage(error, "PDF crop rendering failed.");
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(workerMessage)
        ? `PDF crop rendering timed out after ${timeoutMs} ms.`
        : workerMessage;
    return { results: new Map(), warnings: [...warnings, workerWarning] } satisfies LocalVisualCropRunResult;
  }
}

function cleanText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, Number(normalized.toFixed(4))));
}

function textQuality(value: string) {
  const text = value || "";
  if (!text.trim()) return { usable: false, reason: "empty text" };
  const chars = [...text];
  const controlCount = chars.filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && !/\s/.test(char);
  }).length;
  const replacementCount = chars.filter((char) => char === "\uFFFD").length;
  const latinCount = chars.filter((char) => /[A-Za-z0-9]/.test(char)).length;
  const suspiciousSymbolCount = chars.filter((char) => /[¥�]/.test(char)).length;
  const controlRatio = controlCount / Math.max(1, chars.length);
  const replacementRatio = replacementCount / Math.max(1, chars.length);
  const suspiciousRatio = suspiciousSymbolCount / Math.max(1, chars.length);
  const latinRatio = latinCount / Math.max(1, chars.length);

  if (text.trim().length < 20) return { usable: false, reason: "too little extracted text" };
  if (controlRatio > 0.01) return { usable: false, reason: "embedded text contains control-code artifacts" };
  if (replacementRatio > 0.005) return { usable: false, reason: "embedded text contains replacement-character artifacts" };
  if (suspiciousRatio > 0.03) return { usable: false, reason: "embedded text appears font-encoded or garbled" };
  if (latinRatio < 0.2) return { usable: false, reason: "embedded text has too few readable characters" };
  return { usable: true, reason: "" };
}

function decodePdfLiteralString(raw: string) {
  return raw
    .replace(/\\([nrtbf()\\])/g, (_, escaped: string) => {
      const replacements: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "(": "(",
        ")": ")",
        "\\": "\\"
      };
      return replacements[escaped] ?? escaped;
    })
    .replace(/\\\r?\n/g, "")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfHexString(raw: string) {
  const normalized = raw.replace(/\s+/g, "");
  const even = normalized.length % 2 === 0 ? normalized : `${normalized}0`;
  const bytes: number[] = [];
  for (let index = 0; index < even.length; index += 2) {
    const value = parseInt(even.slice(index, index + 2), 16);
    if (Number.isFinite(value)) bytes.push(value);
  }
  return Buffer.from(bytes).toString("utf8").replace(/\0/g, "");
}

function extractTextFromContentStream(content: string) {
  if (content.length > 2_000_000) return "";
  const pieces: string[] = [];
  const literalString = String.raw`\((?:\\.|[^\\)])*\)`;
  const hexString = String.raw`<[\da-fA-F\s]+>`;
  const stringToken = `(?:${literalString}|${hexString})`;
  const numberToken = String.raw`-?\d+(?:\.\d+)?`;

  function decodeToken(token: string) {
    return token.startsWith("<") ? decodePdfHexString(token.slice(1, -1)) : decodePdfLiteralString(token.slice(1, -1));
  }

  function pushText(text: string) {
    if (!text) return;
    pieces.push(text);
    pieces.push(" ");
  }

  function pushLineBreak() {
    if (pieces.length > 0 && pieces[pieces.length - 1] !== "\n") pieces.push("\n");
  }

  try {
    const tokenRe = new RegExp(
      [
        `(${stringToken})\\s*Tj`,
        `\\[((?:\\s*(?:${stringToken}|${numberToken}))*\\s*)\\]\\s*TJ`,
        `${numberToken}\\s+${numberToken}\\s+T[dD]\\b`,
        `T\\*`,
        `(${stringToken})\\s*'`,
        `${numberToken}\\s+${numberToken}\\s+(${stringToken})\\s*"`
      ].join("|"),
      "g"
    );
    for (const match of content.matchAll(tokenRe)) {
      if (match[1]) {
        pushText(decodeToken(match[1]));
        continue;
      }
      if (match[2]) {
        const tokens = [...match[2].matchAll(new RegExp(stringToken, "g"))].map((item) => decodeToken(item[0]));
        pushText(tokens.join(""));
        continue;
      }
      if (match[3]) {
        pushLineBreak();
        pushText(decodeToken(match[3]));
        continue;
      }
      if (match[4]) {
        pushLineBreak();
        pushText(decodeToken(match[4]));
        continue;
      }
      pushLineBreak();
    }
  } catch {
    return "";
  }

  return cleanText(pieces.join(""));
}

function decodeStream(dict: string, raw: string) {
  const rawBuffer = Buffer.from(raw, "binary");
  if (!/\/FlateDecode\b/.test(dict)) return rawBuffer.toString("binary");
  try {
    return inflateSync(rawBuffer).toString("binary");
  } catch {
    return "";
  }
}

function isImageOrBinaryStream(dict: string) {
  return /\/Subtype\s*\/Image\b|\/(?:DCTDecode|JPXDecode|JBIG2Decode|CCITTFaxDecode)\b/.test(dict);
}

function hasPdfTextOperators(content: string) {
  return /\b(?:BT|Tj|TJ)\b/.test(content);
}

function extractStreamTexts(pdfText: string) {
  const streamTexts: string[] = [];
  const streamRe = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of pdfText.matchAll(streamRe)) {
    const dict = match[1];
    if (isImageOrBinaryStream(dict)) continue;
    const decoded = decodeStream(dict, match[2]);
    if (!hasPdfTextOperators(decoded)) continue;
    const text = extractTextFromContentStream(decoded);
    if (text) streamTexts.push(text);
  }
  return streamTexts;
}

function stripPdfStreams(pdfText: string) {
  return pdfText.replace(/stream\r?\n[\s\S]*?\r?\nendstream/g, "stream\nendstream");
}

function countPdfPages(pdfText: string) {
  const withoutStreams = stripPdfStreams(pdfText);
  const pageMatches = withoutStreams.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, pageMatches?.length || 1);
}

function isPdfBytes(bytes: Buffer) {
  const header = bytes.subarray(0, 1024).toString("latin1");
  return header.includes("%PDF-");
}

async function loadPdfBytes(pdf: PdfUpload) {
  if (path.isAbsolute(pdf.file_url) && existsSync(pdf.file_url)) {
    return readFile(pdf.file_url);
  }
  if (pdf.file_url.startsWith("/")) {
    const relative = pdf.file_url.replace(/^\/+/, "");
    return readFile(path.join(process.cwd(), "public", relative));
  }
  if (/^https?:\/\//i.test(pdf.file_url)) {
    const response = await fetch(pdf.file_url);
    if (!response.ok) throw new Error(`Unable to download PDF: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(pdf.file_url);
}

function distributeStreamTextToPages(streamTexts: string[], pageCount: number) {
  const pages = Array.from({ length: pageCount }, () => "");
  if (streamTexts.length === 0) return pages;
  streamTexts.forEach((text, index) => {
    const pageIndex = Math.min(pageCount - 1, index);
    pages[pageIndex] = cleanText([pages[pageIndex], text].filter(Boolean).join("\n\n"));
  });
  return pages;
}

function acceptedPageText(page: PageWithoutStorage) {
  if (page.extraction_method === "text") return page.text_extracted;
  if (page.extraction_method === "ocr") return page.ocr_text;
  return "";
}

function splitTrailingLabeledSections(text: string) {
  const match = text.match(
    /(?:^|\n)\s*(Answer\s+Key|Answer|Correct\s+Answer|Key|Explanations?|Explanation|Rationale|Scoring\s+Notes?|Rubric|Scoring\s+Guideline)\s*[:\-]?\s+|(?:^|\s)(Answer\s+Key|Answer|Correct\s+Answer|Key|Explanations?|Explanation|Rationale|Scoring\s+Notes?|Rubric|Scoring\s+Guideline)\s*[:\-]\s+/i
  );
  if (!match || match.index === undefined) return { promptText: text, labeledText: "" };
  const labelStart = match.index + (match[0].match(/^\s/) ? 1 : 0);
  return {
    promptText: cleanText(text.slice(0, labelStart)),
    labeledText: cleanText(text.slice(labelStart))
  };
}

function isAnswerKeyLikeText(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return false;
  if (/^(answer\s+key|answers?|explanations?)\b/i.test(cleaned)) return true;
  const shortAnswerLines = cleaned
    .split(/\n+/)
    .filter(Boolean)
    .filter((line) => /^\d{1,3}[\).]?\s*[A-E](?:\s*,\s*[A-E])?\b/i.test(line.trim())).length;
  return shortAnswerLines >= 3 && shortAnswerLines / Math.max(1, cleaned.split(/\n+/).filter(Boolean).length) > 0.5;
}

function scoringGuideSignalScore(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned || isAnswerKeyLikeText(cleaned)) return 0;
  const phraseMatches = cleaned.match(
    /\b(?:answer\s+and\s+scoring\s+guidelines?|scoring\s+guidelines?|scoring\s+guide|rubric|scoring\s+criteria|sample\s+responses?|student\s+samples?|chief\s+reader|commentary|model\s+solution|acceptable\s+responses?|expected\s+responses?|does\s+not\s+earn|earns?\s+(?:the\s+)?point|point\s+(?:is\s+)?(?:earned|awarded)|select\s+a\s+point\s+value|maximum\s+points?|task\s+verbs?|learning\s+objective)\b/gi
  ) || [];
  const pointLineMatches = cleaned.match(
    /(?:^|\s)(?:one|two|three|four|five|\d+)\s+points?\b|\b\d+\s+point\b|\b\d+\/\d+\s+point\b/gi
  ) || [];
  const scoringTableMatches = cleaned.match(/\b(?:row|point|criteria|decision\s+rules?)\b.{0,80}\b(?:earned|awarded|response|score)\b/gi) || [];
  return phraseMatches.length * 2 + pointLineMatches.length + scoringTableMatches.length;
}

function hasQuestionPromptContent(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return false;
  const questionStarts = cleaned.match(/(?:^|\n|\s)(?:Question\s+)?\d{1,3}[\).](?:\s+(?=[A-Z(])|[ \t]*\n(?=[a-z]))/g) || [];
  const { choices } = splitChoices(cleaned);
  const frqParts = extractFrqParts(cleaned);
  const promptLikeStart = questionStarts.length > 0 && /\b(?:which|what|why|how|calculate|derive|explain|describe|identify|select|choose|answer)\b/i.test(cleaned);
  return promptLikeStart || choices.length >= 2 || frqParts.length >= 2 || /\bFree-Response\s+Questions\b/i.test(cleaned);
}

function isScoringGuideContentHeavy(text: string) {
  return scoringGuideSignalScore(text) >= 3 || isScoringSectionStart(text);
}

function isScoringGuideOnlyText(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned || isAnswerKeyLikeText(cleaned)) return false;
  return isScoringGuideContentHeavy(cleaned) && !hasQuestionPromptContent(cleaned);
}

function classifyScoringGuideContent(pages: PageWithoutStorage[]): ScoringContentClassification {
  const warningsByPage = new Map<number, string[]>();
  const scoringHeavyPageNumbers: number[] = [];
  const scoringOnlyPageNumbers: number[] = [];
  const questionLikePageNumbers: number[] = [];
  let totalSignalScore = 0;
  let textPageCount = 0;

  for (const page of pages) {
    const text = acceptedPageText(page);
    if (!text) continue;
    textPageCount += 1;
    const score = scoringGuideSignalScore(text);
    const questionLike = hasQuestionPromptContent(text);
    const scoringHeavy = score >= 3 || isScoringSectionStart(text);
    totalSignalScore += score;
    if (questionLike) questionLikePageNumbers.push(page.page_number);
    if (scoringHeavy) scoringHeavyPageNumbers.push(page.page_number);
    if (scoringHeavy && !questionLike && !isAnswerKeyLikeText(text)) {
      scoringOnlyPageNumbers.push(page.page_number);
      warningsByPage.set(page.page_number, ["Excluded from question segmentation because content signals look like scoring/rubric/sample-response material."]);
    }
  }

  const scoringHeavyRatio = scoringHeavyPageNumbers.length / Math.max(1, textPageCount);
  const scoringOnlyRatio = scoringOnlyPageNumbers.length / Math.max(1, textPageCount);
  const shouldSuppressDrafts = textPageCount > 0 && scoringHeavyPageNumbers.length > 0 && (
    (scoringOnlyRatio >= 0.5 && scoringOnlyPageNumbers.length > questionLikePageNumbers.length) ||
    (scoringHeavyRatio >= 0.6 && totalSignalScore >= textPageCount * 2) ||
    (scoringHeavyPageNumbers.length >= 2 && questionLikePageNumbers.length <= Math.max(1, Math.floor(scoringHeavyPageNumbers.length / 3)))
  );
  const warnings: string[] = [];
  if (scoringOnlyPageNumbers.length > 0) {
    warnings.push(`Excluded ${scoringOnlyPageNumbers.length} scoring/rubric-only page(s) from question segmentation.`);
  }
  if (shouldSuppressDrafts) {
    warnings.push("Content-based scoring-guide detection suppressed draft generation because the document is mostly scoring, rubric, sample-response, or commentary material.");
  } else if (scoringHeavyPageNumbers.length > 0) {
    warnings.push(`Detected scoring/rubric signals on ${scoringHeavyPageNumbers.length} page(s); admin must verify prompts are not scoring-guide material.`);
  }

  return {
    shouldSuppressDrafts,
    textPageCount,
    scoringHeavyPageNumbers,
    scoringOnlyPageNumbers,
    questionLikePageNumbers,
    warningsByPage,
    warnings
  };
}

function extractAnswerKeyEntries(text: string, pageNumber: number) {
  if (!isAnswerKeyLikeText(text)) return [] as AnswerKeyEntry[];
  const entries: AnswerKeyEntry[] = [];
  const seen = new Set<string>();
  const normalized = cleanText(text);
  const entryRe = /(?:^|\s)(\d{1,3})[\).]?\s*(?:answer\s*)?[:\-]?\s*\(?([A-E](?:\s*,\s*[A-E])?)\)?(?=\s|$)/gi;
  for (const match of normalized.matchAll(entryRe)) {
    const questionNumber = Number(match[1]);
    const answer = match[2]
      .split(",")
      .map((label) => label.trim().toUpperCase())
      .filter(Boolean)
      .join(",");
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || !answer) continue;
    const key = `${questionNumber}:${answer}:${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ questionNumber, answer, pageNumber });
  }
  return entries;
}

function extractExplanationEntries(text: string, pageNumber: number) {
  const cleaned = cleanText(text);
  if (!cleaned || !/\b(?:explanations?|rationales?)\b/i.test(cleaned)) return [] as ExplanationEntry[];
  const sectionMatch = cleaned.match(/\b(?:explanations?|rationales?)\b[:\-\s]*([\s\S]+)$/i);
  const explanationSection = cleanText(sectionMatch?.[1] || "");
  if (!explanationSection) return [];
  const starts = [...explanationSection.matchAll(/(?:^|\s)(\d{1,3})[\).]\s+(?=[A-Z(])/g)];
  if (starts.length === 0) return [];
  const entries: ExplanationEntry[] = [];
  const seen = new Set<string>();
  starts.forEach((match, index) => {
    const questionNumber = Number(match[1]);
    const start = (match.index || 0) + match[0].length;
    const end = starts[index + 1]?.index ?? explanationSection.length;
    const explanation = cleanText(explanationSection.slice(start, end));
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || explanation.length < 12) return;
    if (/^[A-E](?:\s*,\s*[A-E])?$/i.test(explanation)) return;
    const key = `${questionNumber}:${pageNumber}:${explanation}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ questionNumber, explanation, pageNumber });
  });
  return entries;
}

function applyExplicitAnswerKeyEntries(drafts: DraftQuestionWithoutStorage[], entries: AnswerKeyEntry[]) {
  const warnings: string[] = [];
  if (entries.length === 0) return { appliedCount: 0, warnings };
  const byQuestion = new Map<number, AnswerKeyEntry[]>();
  for (const entry of entries) {
    const group = byQuestion.get(entry.questionNumber) || [];
    group.push(entry);
    byQuestion.set(entry.questionNumber, group);
  }

  let appliedCount = 0;
  for (const draft of drafts) {
    if (draft.type !== "mcq" || draft.correct_answer || draft.question_number === null || draft.choices.length === 0) continue;
    const candidates = byQuestion.get(draft.question_number) || [];
    if (candidates.length === 0) continue;
    const uniqueAnswers = Array.from(new Set(candidates.map((entry) => entry.answer)));
    if (uniqueAnswers.length !== 1) {
      warnings.push(`Conflicting explicit answer-key entries were found for question ${draft.question_number}; no answer was attached.`);
      continue;
    }
    const answer = uniqueAnswers[0];
    const labels = answer.split(",");
    const choiceIds = new Set(draft.choices.map((choice) => choice.id));
    if (!labels.every((label) => choiceIds.has(label))) {
      warnings.push(`Explicit answer-key entry for question ${draft.question_number} did not match parsed choices; no answer was attached.`);
      continue;
    }
    const sourcePages = Array.from(new Set(candidates.filter((entry) => entry.answer === answer).map((entry) => entry.pageNumber))).sort((a, b) => a - b);
    draft.correct_answer = answer;
    draft.warnings = Array.from(new Set([
      ...draft.warnings.filter((warning) => !/No explicit answer key was detected/i.test(warning)),
      `Correct answer matched from explicit answer-key page ${sourcePages.join(", ")}. Admin must verify before saving.`
    ]));
    appliedCount += 1;
  }
  return { appliedCount, warnings };
}

function applyExplicitExplanationEntries(drafts: DraftQuestionWithoutStorage[], entries: ExplanationEntry[]) {
  const warnings: string[] = [];
  if (entries.length === 0) return { appliedCount: 0, warnings };
  const byQuestion = new Map<number, ExplanationEntry[]>();
  for (const entry of entries) {
    const group = byQuestion.get(entry.questionNumber) || [];
    group.push(entry);
    byQuestion.set(entry.questionNumber, group);
  }

  let appliedCount = 0;
  for (const draft of drafts) {
    if (draft.explanation || draft.question_number === null) continue;
    const candidates = byQuestion.get(draft.question_number) || [];
    if (candidates.length === 0) continue;
    const uniqueExplanations = Array.from(new Set(candidates.map((entry) => entry.explanation)));
    if (uniqueExplanations.length !== 1) {
      warnings.push(`Conflicting explicit explanation entries were found for question ${draft.question_number}; no explanation was attached.`);
      continue;
    }
    const explanation = uniqueExplanations[0];
    const sourcePages = Array.from(new Set(candidates.filter((entry) => entry.explanation === explanation).map((entry) => entry.pageNumber))).sort((a, b) => a - b);
    draft.explanation = explanation;
    draft.warnings = Array.from(new Set([
      ...draft.warnings,
      `Explanation matched from explicit explanation/rationale page ${sourcePages.join(", ")}. Admin must verify before saving.`
    ]));
    appliedCount += 1;
  }
  return { appliedCount, warnings };
}

function isTableOfContentsLikeText(text: string) {
  const cleaned = cleanText(text);
  return /\bContents\b/i.test(cleaned) && /\bSECTION\s+I\b/i.test(cleaned) && /\bSECTION\s+II\b/i.test(cleaned);
}

function isScoringSectionStart(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned || isTableOfContentsLikeText(cleaned)) return false;
  return (
    /\bAnswer\s+and\s+Scoring\s+Guidelines\b/i.test(cleaned) ||
    /^Scoring\s+Guide\b/i.test(cleaned) ||
    /\bSelect\s+a\s+point\s+value\s+to\s+view\s+scoring\s+criteria\b/i.test(cleaned)
  );
}

function isFrqSectionStart(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned || isTableOfContentsLikeText(cleaned)) return false;
  return /\bSECTION\s+II\b/i.test(cleaned) || /\bFree-Response\s+Questions\b/i.test(cleaned);
}

function isMcqSectionStart(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned || isTableOfContentsLikeText(cleaned)) return false;
  return (
    /\bSECTION\s+I\b/i.test(cleaned) ||
    /\bMultiple\s+Choice\s+Questions\b/i.test(cleaned) ||
    /\bquestions\s+or\s+incomplete\s+statements\b.*\bfour\s+suggested\s+answers\b/i.test(cleaned)
  );
}

function buildSegmentationSections(pages: PageWithoutStorage[]) {
  const sectionByPage = new Map<number, PdfQuestionSection>();
  const warningsByPage = new Map<number, string[]>();
  let currentSection: PdfQuestionSection = "unknown";
  let inScoringSection = false;

  for (const page of pages) {
    const text = acceptedPageText(page);
    const warnings: string[] = [];
    let section: PdfQuestionSection = currentSection;
    if (!text) {
      sectionByPage.set(page.page_number, "non_question");
      continue;
    }
    if (isTableOfContentsLikeText(text)) {
      section = "non_question";
      warnings.push("Excluded from question segmentation because this page looks like a table of contents.");
    } else if (inScoringSection || isScoringSectionStart(text) || isScoringGuideOnlyText(text) || isAnswerKeyLikeText(text)) {
      inScoringSection = true;
      section = "non_question";
      warnings.push("Excluded from question segmentation because this page looks like answer/scoring material.");
    } else if (isFrqSectionStart(text)) {
      currentSection = "frq";
      section = "frq";
    } else if (isMcqSectionStart(text)) {
      currentSection = "mcq";
      section = "mcq";
    }
    sectionByPage.set(page.page_number, section);
    if (warnings.length > 0) warningsByPage.set(page.page_number, warnings);
  }

  return { sectionByPage, warningsByPage };
}

function choiceDiagnostics(choices: QuestionChoice[]) {
  const warnings: string[] = [];
  const ids = choices.map((choice) => choice.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const expectedIds = ids.map((_, index) => String.fromCharCode(65 + index));
  if (duplicateIds.length > 0) warnings.push(`Duplicate choice labels detected: ${Array.from(new Set(duplicateIds)).join(", ")}.`);
  if (ids.length > 0 && ids.join(",") !== expectedIds.join(",")) warnings.push("Choice labels are not in normal A/B/C/D order.");
  if (choices.length > 0 && choices.length < 4) warnings.push("Fewer than four answer choices were detected.");
  if (choices.length > 5) warnings.push(`Too many answer choices were detected (${choices.length}). This draft likely merged multiple questions.`);
  return warnings;
}

function isFrqPacket(pdf: PdfUpload) {
  return /\bfrq\b|free-response/i.test(pdf.file_name);
}

function isScoringGuidePdf(pdf: PdfUpload) {
  return /\bsg\b|scoring\s+guidelines?|sample\s+responses?/i.test(pdf.file_name);
}

function splitChoices(text: string) {
  const { promptText } = splitTrailingLabeledSections(text);
  const matches = [...promptText.matchAll(CHOICE_MARKER_RE)];
  if (matches.length < 2) return { stem: cleanText(promptText), choices: [] as QuestionChoice[] };
  const stem = cleanText(promptText.slice(0, matches[0].index).trim());
  const choices = matches.map((match, index) => {
    const id = match[1] || match[2] || String.fromCharCode(65 + index);
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? promptText.length;
    return {
      id,
      text: cleanText(promptText.slice(start, end)) || `Choice ${id}`,
      image_url: null
    };
  });
  return { stem, choices };
}

function extractExplicitAnswer(text: string, choices: QuestionChoice[]) {
  const match = text.match(/\b(?:answer|correct answer|key)\s*[:\-]\s*\(?([A-E](?:\s*,\s*[A-E])?)\)?\b/i);
  if (!match) return null;
  const labels = match[1].split(",").map((item) => item.trim().toUpperCase());
  if (labels.every((label) => choices.some((choice) => choice.id === label))) return labels.join(",");
  return null;
}

function extractExplanation(text: string) {
  const match = text.match(/\b(?:explanation|rationale)\s*[:\-]\s*([\s\S]+)$/i);
  return cleanText(match?.[1] || "");
}

function extractScoringNotes(text: string) {
  const match = text.match(/\b(?:scoring notes?|rubric|scoring guideline)\s*[:\-]\s*([\s\S]+)$/i);
  return cleanText(match?.[1] || "");
}

function extractFrqParts(text: string, allowSinglePart = false): PdfFrqPartDraft[] {
  const matches = [...text.matchAll(FRQ_PART_RE)];
  if (matches.length < 2 && !allowSinglePart) return [];
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      label: match[1].toLowerCase(),
      prompt: cleanText(text.slice(start, end))
    };
  });
}

function splitQuestionBlocks(pages: PageWithoutStorage[], sectionByPage: Map<number, PdfQuestionSection>) {
  const joined = pages
    .map((page) => {
      const usableText = acceptedPageText(page);
      const section = sectionByPage.get(page.page_number) || "unknown";
      if (!usableText || section === "non_question") return "";
      return `\n\n[[PAGE ${page.page_number} SECTION ${section}]]\n${usableText}`;
    })
    .filter(Boolean)
    .join("\n");
  const pageMarkerRe = /\[\[PAGE\s+(\d+)\s+SECTION\s+([a-z_]+)\]\]/g;
  const pageMarkers = [...joined.matchAll(pageMarkerRe)].map((match) => ({
    index: match.index || 0,
    pageNumber: Number(match[1]),
    section: (match[2] || "unknown") as PdfQuestionSection
  }));
  function pageMarkerAt(index: number) {
    let current = pageMarkers[0] || { pageNumber: 1, section: "unknown" as PdfQuestionSection, index: 0 };
    for (const marker of pageMarkers) {
      if (marker.index <= index) current = marker;
      else break;
    }
    return current;
  }

  const questionStartRe = /(?:^|\n)(?:Question\s+)?(\d{1,3})[\).](?:\s+(?=[A-Z(])|[ \t]*\n(?=[a-z]))/g;
  const starts = [...joined.matchAll(questionStartRe)];
  if (starts.length === 0) {
    return [];
  }

  return starts.map((match, index): QuestionBlockCandidate => {
    const startMarker = pageMarkerAt(match.index || 0);
    const start = (match.index || 0) + match[0].length;
    const end = starts[index + 1]?.index ?? joined.length;
    const chunk = joined.slice(start, end);
    const allChunkMarkers = [...chunk.matchAll(pageMarkerRe)];
    let previousPageNumber = startMarker.pageNumber;
    const firstGapMarker = allChunkMarkers.find((item) => {
      const pageNumber = Number(item[1]);
      const hasGap = pageNumber > previousPageNumber + 1;
      previousPageNumber = pageNumber;
      return hasGap;
    });
    const effectiveChunk = firstGapMarker?.index === undefined ? chunk : chunk.slice(0, firstGapMarker.index);
    const chunkMarkers = [...effectiveChunk.matchAll(pageMarkerRe)];
    const chunkPageMarkers = chunkMarkers
      .filter((item, markerIndex) => {
        const followingStart = (item.index || 0) + item[0].length;
        const followingEnd = chunkMarkers[markerIndex + 1]?.index ?? effectiveChunk.length;
        return cleanText(effectiveChunk.slice(followingStart, followingEnd)).length > 0;
      })
      .map((item) => Number(item[1]));
    const pageNumbers = Array.from(new Set([startMarker.pageNumber, ...chunkPageMarkers].filter(Number.isFinite))).sort((a, b) => a - b);
    return {
      questionNumber: Number(match[1]),
      pageStart: Math.min(...pageNumbers),
      pageEnd: Math.max(...pageNumbers),
      text: cleanText(effectiveChunk.replace(pageMarkerRe, "")),
      pageNumbers,
      section: startMarker.section
    };
  });
}

function isQuestionGroupExportText(text: string) {
  return /\bAll Question Groups\b|\bGROUPS\s+QUESTIONS\s+SECTIONS\b|\bSection\s+\d+,\s*Module\s+\d+/i.test(text);
}

function isQuestionGroupHeaderLine(line: string) {
  return (
    /^All Question Groups$/i.test(line) ||
    /^Source:/i.test(line) ||
    /^(?:GROUPS|QUESTIONS|SECTIONS|CONTENTS|All|normal|NORMAL)$/i.test(line) ||
    /^Section\s+\d+,\s*Module\s+\d+/i.test(line) ||
    /^\d+\s+questions$/i.test(line)
  );
}

function inferAnswerDelimitedQuestionNumber(lines: string[], expectedQuestionNumber: number | null) {
  const explicitQuestion = lines
    .map((line) => line.match(/^Question\s+(\d{1,3})\b/i)?.[1])
    .find(Boolean);
  if (explicitQuestion) return Number(explicitQuestion);

  const standaloneNumbers = lines
    .map((line, index) => ({ index, value: Number(line) }))
    .filter((item) => Number.isInteger(item.value) && item.value > 0 && item.value < 200);

  if (expectedQuestionNumber !== null) {
    const expected = standaloneNumbers.find((item) => item.value === expectedQuestionNumber && item.index < 40);
    if (expected) return expected.value;
  }

  const beforeChoices = standaloneNumbers.find((item) => {
    const followingText = lines.slice(item.index + 1, item.index + 8).join(" ");
    return /\b(?:which|what|does|if|based|assuming|according|find|calculate|estimate|determine)\b/i.test(followingText);
  });
  if (beforeChoices) return beforeChoices.value;

  return expectedQuestionNumber;
}

function cleanAnswerDelimitedQuestionText(rawText: string, questionNumber: number | null) {
  const lines = cleanText(rawText.replace(/\[\[PAGE\s+\d+\s+SECTION\s+[a-z_]+\]\]/g, ""))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const questionNumberIndex =
    questionNumber === null ? -1 : lines.findIndex((line) => line === String(questionNumber));
  let startIndex = questionNumberIndex >= 0 ? questionNumberIndex : 0;
  while (startIndex > 0) {
    const previous = lines[startIndex - 1];
    if (isQuestionGroupHeaderLine(previous)) break;
    if (/^\d{1,3}$/.test(previous) && questionNumberIndex - startIndex > 4) break;
    startIndex -= 1;
  }

  const kept = lines.slice(startIndex).filter((line, index) => {
    if (questionNumber !== null && line === String(questionNumber) && (questionNumberIndex < 0 || startIndex + index === questionNumberIndex)) {
      return false;
    }
    return !isQuestionGroupHeaderLine(line);
  });
  return cleanText(kept.join("\n"));
}

function splitAnswerDelimitedMcqBlocks(pages: PageWithoutStorage[], sectionByPage: Map<number, PdfQuestionSection>) {
  const joined = pages
    .map((page) => {
      const usableText = acceptedPageText(page);
      if (!usableText) return "";
      const section = sectionByPage.get(page.page_number) || "unknown";
      const canUseNonQuestionPage = isQuestionGroupExportText(usableText);
      const canUseAnswerDelimitedPage = canUseNonQuestionPage || /\bAnswer\s*:\s*[A-E]\b/i.test(usableText);
      if (section === "non_question" && !canUseAnswerDelimitedPage) return "";
      if (isAnswerKeyLikeText(usableText) && !canUseAnswerDelimitedPage) return "";
      if (isScoringGuideOnlyText(usableText) && !canUseAnswerDelimitedPage) return "";
      return `\n\n[[PAGE ${page.page_number} SECTION ${section === "non_question" ? "mcq" : section}]]\n${usableText}`;
    })
    .filter(Boolean)
    .join("\n");
  if (!joined || !/\bAnswer\s*:\s*[A-E]\b/i.test(joined)) return [] as QuestionBlockCandidate[];

  const pageMarkerRe = /\[\[PAGE\s+(\d+)\s+SECTION\s+([a-z_]+)\]\]/g;
  const pageMarkers = [...joined.matchAll(pageMarkerRe)].map((match) => ({
    index: match.index || 0,
    pageNumber: Number(match[1]),
    section: (match[2] || "unknown") as PdfQuestionSection
  }));
  function pageMarkerAt(index: number) {
    let current = pageMarkers[0] || { pageNumber: 1, section: "mcq" as PdfQuestionSection, index: 0 };
    for (const marker of pageMarkers) {
      if (marker.index <= index) current = marker;
      else break;
    }
    return current;
  }

  const answerRe = /\bAnswer\s*:\s*([A-E])\b/gi;
  const blocks: QuestionBlockCandidate[] = [];
  let blockStart = 0;
  let lastQuestionNumber = 0;
  for (const match of joined.matchAll(answerRe)) {
    const chunkStart = blockStart;
    const answerEnd = (match.index || 0) + match[0].length;
    const rawChunk = joined.slice(chunkStart, answerEnd);
    blockStart = answerEnd;
    const cleanChunkWithoutMarkers = cleanText(rawChunk.replace(pageMarkerRe, ""));
    const lines = cleanChunkWithoutMarkers.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const expected = lastQuestionNumber > 0 ? lastQuestionNumber + 1 : 1;
    const questionNumber = inferAnswerDelimitedQuestionNumber(lines, expected);
    const questionText = cleanAnswerDelimitedQuestionText(rawChunk, questionNumber);
    const { choices } = splitChoices(questionText);
    if (!questionText || choices.length < 2) continue;

    const startMarker = pageMarkerAt(chunkStart);
    const answerMarker = pageMarkerAt(match.index || 0);
    const chunkPageMarkers = [...rawChunk.matchAll(pageMarkerRe)].map((item) => Number(item[1]));
    const pageNumbers = Array.from(new Set([startMarker.pageNumber, answerMarker.pageNumber, ...chunkPageMarkers].filter(Number.isFinite))).sort((a, b) => a - b);
    blocks.push({
      questionNumber,
      pageStart: Math.min(...pageNumbers),
      pageEnd: Math.max(...pageNumbers),
      text: questionText,
      pageNumbers,
      section: "mcq"
    });
    if (questionNumber !== null) lastQuestionNumber = questionNumber;
  }
  return blocks;
}

function draftFromBlock(
  block: QuestionBlockCandidate,
  pages: PageWithoutStorage[],
  pdf: PdfUpload
): DraftQuestionWithoutStorage {
  const { stem, choices } = splitChoices(block.text);
  const frqParts = extractFrqParts(block.text);
  const type = block.section === "mcq" && choices.length >= 2 && !isFrqPacket(pdf) ? "mcq" : block.section === "frq" ? "frq" : !isFrqPacket(pdf) && choices.length >= 2 ? "mcq" : "frq";
  const structuredFrqParts = type === "frq" ? extractFrqParts(block.text, true) : [];
  const course = pdf.subject?.startsWith("AP ") ? pdf.subject : pdf.subject || "AP Course";
  const subject = course.startsWith("AP ") ? inferSubjectFromCourse(course) : pdf.subject || "AP";
  const year = parseYearFromText(pdf.file_name, block.text);
  const section = normalizeSection(type === "frq" ? "FRQ" : "MCQ");
  const warnings = [
    "Auto-segmented from PDF text. Admin must verify wording, math formatting, choices, and diagrams before saving."
  ];
  const choiceWarnings = choiceDiagnostics(choices);
  const hasSevereChoiceIssue = choiceWarnings.some((warning) => /Duplicate choice labels|Too many answer choices/.test(warning));
  warnings.push(...choiceWarnings);
  if (hasSevereChoiceIssue) {
    warnings.push("This draft looks like merged or corrupted choices; split or repair it before saving.");
  }
  if (type === "mcq" && !extractExplicitAnswer(block.text, choices)) {
    warnings.push("No explicit answer key was detected.");
  }
  if (/figure|diagram|graph|table|shown|below/i.test(block.text)) {
    warnings.push("The text appears to reference a visual. A source crop or verified visual evidence is required before saving.");
  }
  if (type === "frq" && /(?:^|\s)[A-E][\).]?\s+\S/i.test(block.text)) {
    warnings.push("Possible answer choices were detected, but labels were too noisy to create a reliable MCQ draft.");
  }
  const blockPages = pages.filter((page) => (block.pageNumbers || []).includes(page.page_number));
  const normalizedConfidences = blockPages
    .map((page) => page.confidence)
    .filter((value): value is number => typeof value === "number")
    .map((value) => normalizeConfidence(value))
    .filter((value): value is number => typeof value === "number");
  const minPageConfidence = normalizedConfidences.length > 0 ? Math.min(...normalizedConfidences) : null;
  let confidence = choices.length >= 2 || structuredFrqParts.length > 0 ? 0.65 : 0.35;
  if (choiceWarnings.length > 0) confidence -= 0.2;
  if (hasSevereChoiceIssue) confidence -= 0.25;
  if (minPageConfidence !== null && minPageConfidence < 0.6) confidence -= 0.25;
  if (minPageConfidence !== null && minPageConfidence < 0.5) warnings.push("OCR/page confidence is low; verify the source before saving.");
  confidence = Math.max(0.1, Math.min(0.9, Number(confidence.toFixed(2))));

  return {
    question_number: block.questionNumber,
    source_page_start: block.pageStart,
    source_page_end: block.pageEnd,
    type,
    exam_name: course,
    subject,
    course,
    year,
    section,
    exam_type: normalizeExamType("Practice Exam"),
    unit: pdf.unit || "Imported PDF",
    topic: pdf.topic || "Needs classification",
    difficulty: "medium",
    question_text: type === "mcq" ? stem : cleanText(block.text),
    choices,
    correct_answer: type === "mcq" ? extractExplicitAnswer(block.text, choices) : null,
    explanation: extractExplanation(block.text),
    scoring_notes: extractScoringNotes(block.text),
    frq_parts: structuredFrqParts,
    question_images: [],
    confidence,
    warnings
  };
}

function isSegmentedBlockWorthReview(block: QuestionBlockCandidate, pdf: PdfUpload) {
  if (block.section === "non_question") return false;
  if (block.text.length < 20) return false;
  const { choices } = splitChoices(block.text);
  const frqParts = extractFrqParts(block.text);
  if (block.section === "mcq" && !isFrqPacket(pdf)) {
    return choices.length >= 2;
  }
  if (block.section === "frq") {
    if (block.questionNumber !== null && block.questionNumber > 20) return false;
    const hasExplicitFrqPart = /(?:^|\s)\([a-g]\)\s+\S/i.test(block.text);
    const hasFrqPromptVerb = /\b(?:calculate|derive|explain|describe|determine|identify|justify|sketch|plot|show|predict)\b/i.test(block.text);
    return frqParts.length > 0 ||
      /\bAnswer\s+the\s+following\s+questions\b/i.test(block.text) ||
      (block.questionNumber !== null && hasExplicitFrqPart && hasFrqPromptVerb && block.text.length >= 80);
  }
  return block.text.length >= 20;
}

function draftNeedsVisualEvidence(draft: DraftQuestionWithoutStorage) {
  const text = [draft.question_text, ...draft.choices.map((choice) => choice.text), draft.scoring_notes, draft.explanation].join(" ");
  return /figure|diagram|graph|table|shown|below|image|plot|chart/i.test(text) ||
    draft.warnings.some((warning) => /visual|diagram|table|graph/i.test(warning));
}

function recordNumber(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rawBlockBbox(record: JsonRecord): [number, number, number, number] | null {
  const raw = record.bbox;
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const values = raw.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null));
  if (values.some((value) => value === null)) return null;
  const [x0, y0, x1, y1] = values as [number, number, number, number];
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1, y1];
}

function usableVisualBlock(record: JsonRecord) {
  if (!["image", "table", "vector"].includes(String(record.kind))) return null;
  const bbox = rawBlockBbox(record);
  if (!bbox) return null;
  const [x0, y0, x1, y1] = bbox;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 16 || height < 16) return null;
  const pageWidth = recordNumber(record, "page_width");
  const pageHeight = recordNumber(record, "page_height");
  if (pageWidth && pageHeight) {
    const pageArea = pageWidth * pageHeight;
    const blockArea = width * height;
    if (blockArea > pageArea * 0.72) return null;
  }
  return {
    bbox,
    blockNumber: recordNumber(record, "block_number"),
    kind: String(record.kind) as "image" | "table" | "vector",
    pageWidth,
    pageHeight,
    y0,
    y1,
    x0
  };
}

function evenlySpacedPageNumbers(pageNumbers: number[], maxSamples: number) {
  const unique = Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  if (maxSamples <= 0) return [];
  if (unique.length <= maxSamples) return unique;
  const selected = new Set<number>();
  for (let index = 0; index < maxSamples; index += 1) {
    const sourceIndex = Math.round((index * (unique.length - 1)) / Math.max(1, maxSamples - 1));
    selected.add(unique[sourceIndex]);
  }
  return Array.from(selected).sort((a, b) => a - b);
}

function questionPageTriageScore(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return -100;
  const strongNegative =
    /\b(?:scoring\s+guidelines?|distribution\s+of\s+points|points?\s+total|sample\s+responses?|course\s+and\s+exam\s+description|content\s+outline|table\s+of\s+contents|return\s+to\s+table\s+of\s+contents|question\s+descriptors\s+and\s+performance\s+data|answers?\s+to\s+multiple-choice\s+questions?)\b/i.test(cleaned) ||
    (/\bLearning\s+Objectives\b/i.test(cleaned) && /\bEssential\s+Knowledge\b/i.test(cleaned) && /\b%\s*Correct\b/i.test(cleaned));
  const scoringLines = cleaned.match(/\bFor\s+(?:indicating|selecting|calculating|correct|using|describing|mentioning)\b/gi) || [];
  if (strongNegative || scoringLines.length >= 3) return -30 - scoringLines.length;

  const questionStarts = cleaned.match(/(?:^|\n)\s*(?:Question\s+)?\d{1,3}[\).,]\s+/gim) || [];
  const choiceLabels = cleaned.match(/(?:^|\n)\s*(?:\(?[A-E]\)?[\).]?|[©®])\s+\S/gim) || [];
  const promptVerbs = cleaned.match(/\b(?:which|what|why|how|calculate|derive|explain|describe|determine|identify|select|justify|sketch|predict)\b/gi) || [];
  const frqParts = cleaned.match(/(?:^|\n)\s*\(?[a-g]\)?[\).,]\s+/gim) || [];
  let score = questionStarts.length * 4 + Math.min(choiceLabels.length, 12) * 1.5 + Math.min(promptVerbs.length, 8) + Math.min(frqParts.length, 8);
  if (/\b(?:free-response\s+questions?|multiple[- ]choice\s+questions?|section\s+i{1,2})\b/i.test(cleaned)) score += 5;
  if (/\bGO\s+ON\s+TO\s+THE\s+NEXT\s+PAGE\b/i.test(cleaned)) score += 2;
  if (/\b(?:answer\s+key|solutions?|explanations?)\b/i.test(cleaned)) score -= 8;
  return score;
}

function selectTriagedOcrPages(pageNumbers: number[], scoredSamples: Array<{ pageNumber: number; score: number }>, maxPages: number) {
  const allowed = new Set(pageNumbers);
  const selected: number[] = [];
  const add = (pageNumber: number) => {
    if (allowed.has(pageNumber) && !selected.includes(pageNumber) && selected.length < maxPages) selected.push(pageNumber);
  };
  for (const sample of scoredSamples.filter((item) => item.score >= 4).sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)) {
    add(sample.pageNumber);
    add(sample.pageNumber - 1);
    add(sample.pageNumber + 1);
    add(sample.pageNumber - 2);
    add(sample.pageNumber + 2);
    if (selected.length >= maxPages) break;
  }
  return selected.sort((a, b) => a - b);
}

async function runLocalOcrTriage(
  pdf: PdfUpload,
  pageNumbers: number[],
  maxPages: number,
  pythonPath: string,
  tesseractCmd: string
) {
  const { value: sampleLimit, warning: sampleWarning } = parseOcrTriageSamplePages();
  const { value: timeoutMs, warning: timeoutWarning } = parseOcrTriageTimeoutMs();
  const sampledPages = evenlySpacedPageNumbers(pageNumbers, sampleLimit);
  const warnings = [sampleWarning, timeoutWarning].filter((warning): warning is string => Boolean(warning));
  if (sampledPages.length === 0) return { selectedPages: pageNumbers.slice(0, maxPages), warnings };

  const pdfPath = await materializePdfForWorker(pdf);
  const outputKey = `${safePathSegment(pdf.id)}-triage-${Date.now().toString(36)}`;
  const outputDir = path.join(process.cwd(), ".pdf-ocr-temp", outputKey);
  await mkdir(outputDir, { recursive: true });
  const env = {
    ...process.env,
    PYTHONPATH: [process.env.PDF_OCR_PYTHONPATH, "D:\\Codex\\tools\\pdf-ocr-python", process.env.PYTHONPATH]
      .filter(Boolean)
      .join(path.delimiter)
  };

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [
        path.join(process.cwd(), "scripts", "pdf-ocr-worker.py"),
        "--pdf",
        pdfPath,
        "--pages",
        sampledPages.join(","),
        "--out-dir",
        outputDir,
        "--public-prefix",
        "/pdf-ocr-triage",
        "--tesseract-cmd",
        tesseractCmd,
        "--dpi",
        String(DEFAULT_OCR_TRIAGE_DPI),
        "--psm",
        "3"
      ],
      { env, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs }
    );
    const jsonStart = stdout.lastIndexOf('{"ok"');
    const parsed = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout) as { ok: boolean; error?: string; pages?: LocalOcrPageResult[] };
    if (!parsed.ok) throw new Error(parsed.error || "OCR triage worker failed.");
    const scoredSamples = (parsed.pages || []).map((page) => ({
      pageNumber: page.page_number,
      score: questionPageTriageScore(page.text)
    }));
    const selectedPages = selectTriagedOcrPages(pageNumbers, scoredSamples, maxPages);
    if (selectedPages.length === 0) {
      warnings.push(`Document-wide OCR triage sampled ${sampledPages.length} page(s) but found no strong question-page candidates; falling back to the first ${maxPages} page(s).`);
      return { selectedPages: pageNumbers.slice(0, maxPages), warnings };
    }
    warnings.push(
      `Document-wide OCR triage sampled ${sampledPages.length} of ${pageNumbers.length} image-only page(s) and selected ${selectedPages.length} likely question/neighbor page(s) for full OCR.`
    );
    warnings.push("This is a bounded triage pass; unprocessed pages still require later OCR batches before the document can be considered fully extracted.");
    return { selectedPages, warnings };
  } catch (error) {
    warnings.push(`Document-wide OCR triage failed; falling back to the first ${maxPages} page(s). ${workerFailureMessage(error, "OCR triage failed.")}`);
    return { selectedPages: pageNumbers.slice(0, maxPages), warnings };
  }
}

function visualAssetTypeForDraft(draft: DraftQuestionWithoutStorage): "diagram" | "table" | "unknown" {
  const text = [draft.question_text, ...draft.choices.map((choice) => choice.text), draft.scoring_notes, draft.explanation].join(" ");
  const hasTable = /table/i.test(text);
  const hasDiagram = /diagram|graph|figure|image|plot|chart/i.test(text);
  if (hasTable && hasDiagram) return "unknown";
  if (hasTable) return "table";
  if (hasDiagram || /shown|below/i.test(text)) return "diagram";
  return "unknown";
}

function visualReferenceDirection(draft: DraftQuestionWithoutStorage) {
  const text = [draft.question_text, ...draft.choices.map((choice) => choice.text)].join(" ");
  if (/\b(?:shown|provided|pictured|illustrated|table|graph|diagram|figure|image|chart|plot)?\s*below\b/i.test(text)) return "below";
  if (/\b(?:shown|provided|pictured|illustrated|table|graph|diagram|figure|image|chart|plot)?\s*above\b/i.test(text)) return "above";
  return "nearby";
}

function textBlocksForPage(page: PageWithoutStorage) {
  return (page.raw_blocks || [])
    .filter((block) => block.kind === "text")
    .map((block) => ({ block, bbox: rawBlockBbox(block) }))
    .filter((item): item is { block: JsonRecord; bbox: [number, number, number, number] } => Boolean(item.bbox))
    .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
}

function draftQuestionNumberPattern(draft: DraftQuestionWithoutStorage) {
  return draft.question_number === null
    ? null
    : new RegExp(`(?:^|\\n)\\s*(?:Question\\s+)?${draft.question_number}[\\).]\\s+`, "i");
}

function draftPromptAnchor(draft: DraftQuestionWithoutStorage, page: PageWithoutStorage) {
  const textBlocks = textBlocksForPage(page);
  if (textBlocks.length === 0) return null;
  const questionNumberPattern = draftQuestionNumberPattern(draft);
  const promptPrefix = cleanText(draft.question_text).slice(0, 48).toLowerCase();
  return textBlocks.find(({ block }) => questionNumberPattern?.test(String(block.text || ""))) ||
    textBlocks.find(({ block }) => promptPrefix.length >= 16 && String(block.text || "").toLowerCase().includes(promptPrefix)) ||
    null;
}

function meaningfulWords(text: string) {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "which", "what", "when", "where", "shown", "below", "above"]);
  return new Set(
    cleanText(text)
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !stopWords.has(word)) || []
  );
}

function sharedWordCount(left: string, rightWords: Set<string>) {
  let count = 0;
  for (const word of meaningfulWords(left)) {
    if (rightWords.has(word)) count += 1;
  }
  return count;
}

function draftVisualCueAnchor(
  draft: DraftQuestionWithoutStorage,
  page: PageWithoutStorage,
  promptAnchor: { block: JsonRecord; bbox: [number, number, number, number] } | null
) {
  const cuePattern = /\b(?:figure|diagram|graph|table|shown|below|above|image|plot|chart|sketch)\b/i;
  const draftWords = meaningfulWords([draft.question_text, ...draft.choices.map((choice) => choice.text)].join(" "));
  const questionNumberPattern = draftQuestionNumberPattern(draft);
  const promptY = promptAnchor ? (promptAnchor.bbox[1] + promptAnchor.bbox[3]) / 2 : null;
  const candidates = textBlocksForPage(page)
    .filter(({ block }) => {
      const text = String(block.text || "");
      if (!cuePattern.test(text)) return false;
      return questionNumberPattern?.test(text) || sharedWordCount(text, draftWords) >= 1 || draftWords.size === 0;
    })
    .map((item) => {
      const center = (item.bbox[1] + item.bbox[3]) / 2;
      const promptDistance = promptY === null ? 0 : Math.abs(center - promptY);
      const sharedWords = sharedWordCount(String(item.block.text || ""), draftWords);
      return { ...item, rank: promptDistance - sharedWords * 12 };
    })
    .sort((a, b) => a.rank - b.rank || a.bbox[1] - b.bbox[1]);
  return candidates[0] || null;
}

function pageDimension(page: PageWithoutStorage, key: "page_width" | "page_height", fallback: number) {
  for (const block of page.raw_blocks || []) {
    const value = recordNumber(block, key);
    if (value) return value;
  }
  return fallback;
}

function draftIncludesPage(draft: DraftQuestionWithoutStorage, pageNumber: number) {
  return pageNumber >= draft.source_page_start && pageNumber <= draft.source_page_end;
}

function verticalOverlapRatio(subjectY0: number, subjectY1: number, windowY0: number, windowY1: number) {
  const overlap = Math.max(0, Math.min(subjectY1, windowY1) - Math.max(subjectY0, windowY0));
  return overlap / Math.max(1, subjectY1 - subjectY0);
}

function draftQuestionWindow(
  draft: DraftQuestionWithoutStorage,
  allDrafts: DraftQuestionWithoutStorage[],
  page: PageWithoutStorage,
  pageNumber: number
) {
  const pageHeight = pageDimension(page, "page_height", 792);
  const promptAnchor = draftPromptAnchor(draft, page);
  const anchors = allDrafts
    .filter((candidate) => candidate !== draft && draftIncludesPage(candidate, pageNumber))
    .map((candidate) => ({ draft: candidate, anchor: draftPromptAnchor(candidate, page) }))
    .filter((item): item is { draft: DraftQuestionWithoutStorage; anchor: { block: JsonRecord; bbox: [number, number, number, number] } } => Boolean(item.anchor))
    .sort((a, b) => a.anchor.bbox[1] - b.anchor.bbox[1]);
  let y0 = 0;
  let y1 = pageHeight;
  const reasons: string[] = [];

  if (promptAnchor) {
    y0 = Math.max(0, promptAnchor.bbox[1] - 10);
    const nextAnchor = anchors.find((item) => item.anchor.bbox[1] > promptAnchor.bbox[1] + 8);
    if (nextAnchor) {
      y1 = Math.max(y0 + 36, nextAnchor.anchor.bbox[1] - 8);
      reasons.push("bounded before next question anchor");
    } else if (pageNumber === draft.source_page_end) {
      y1 = pageHeight;
    }
    reasons.push("bounded from matched draft question anchor");
  } else if (pageNumber > draft.source_page_start && pageNumber < draft.source_page_end) {
    reasons.push("full continuation page for multi-page draft");
  } else {
    const nextAnchor = anchors.find((item) => item.draft.source_page_start >= pageNumber);
    if (nextAnchor) {
      y1 = Math.max(36, nextAnchor.anchor.bbox[1] - 8);
      reasons.push("bounded before nearby next question anchor");
    } else {
      reasons.push("source-page fallback window");
    }
  }

  return {
    y0,
    y1,
    promptAnchor,
    cueAnchor: draftVisualCueAnchor(draft, page, promptAnchor),
    reason: reasons.join("; ")
  };
}

function visualBlockAssetType(
  draftAssetType: "diagram" | "table" | "unknown",
  blockKind: "image" | "table" | "vector"
): "diagram" | "table" | "unknown" {
  if (blockKind === "table") return "table";
  if (blockKind === "image" || blockKind === "vector") return draftAssetType === "table" ? "unknown" : "diagram";
  return draftAssetType;
}

function visualBlockAssociationScore(
  draft: DraftQuestionWithoutStorage,
  allDrafts: DraftQuestionWithoutStorage[],
  page: PageWithoutStorage,
  pageNumber: number,
  block: NonNullable<ReturnType<typeof usableVisualBlock>>
) {
  const draftAssetType = visualAssetTypeForDraft(draft);
  const direction = visualReferenceDirection(draft);
  const questionWindow = draftQuestionWindow(draft, allDrafts, page, pageNumber);
  const anchor = questionWindow.cueAnchor || questionWindow.promptAnchor;
  const pageDistance = Math.min(
    Math.abs(pageNumber - draft.source_page_start),
    Math.abs(pageNumber - draft.source_page_end)
  );
  let score = pageDistance * 10;
  const reasons = [`${block.kind} block on source page ${pageNumber}`];
  if (draftAssetType === "table") {
    score += block.kind === "table" ? -3 : 2;
  } else if (draftAssetType === "diagram") {
    score += block.kind === "vector" || block.kind === "image" ? -2 : 1;
  }
  const windowOverlap = verticalOverlapRatio(block.y0, block.y1, questionWindow.y0, questionWindow.y1);
  if (windowOverlap >= 0.65) {
    score -= 2.25;
    reasons.push(`overlaps draft question window by ${Math.round(windowOverlap * 100)}%`);
  } else if (windowOverlap >= 0.25) {
    score -= 0.5;
    reasons.push(`partially overlaps draft question window by ${Math.round(windowOverlap * 100)}%`);
  } else {
    score += 4.5;
    reasons.push("outside the draft question window");
  }
  if (questionWindow.reason) reasons.push(questionWindow.reason);
  if (!anchor) return { score, reason: `${reasons.join(", ")}; ranked by source-page proximity`, windowOverlap };

  const [anchorX0, anchorY0, anchorX1, anchorY1] = anchor.bbox;
  const anchorXCenter = (anchorX0 + anchorX1) / 2;
  const anchorCenter = (anchorY0 + anchorY1) / 2;
  const blockXCenter = (block.bbox[0] + block.bbox[2]) / 2;
  const blockCenter = (block.y0 + block.y1) / 2;
  const normalizedDistance = Math.abs(blockCenter - anchorCenter) / Math.max(1, block.pageHeight || 792);
  const normalizedHorizontalDistance = Math.abs(blockXCenter - anchorXCenter) / Math.max(1, block.pageWidth || 612);
  score += normalizedDistance + normalizedHorizontalDistance * 1.5;
  reasons.push("ranked by horizontal and vertical proximity to question text");
  if (questionWindow.cueAnchor) {
    score -= 0.75;
    reasons.push("anchored to explicit visual-reference text");
  }
  if (direction === "below") {
    if (blockCenter >= anchorCenter) {
      score -= 0.75;
      reasons.push("matches below-reference cue");
    } else {
      score += 1.5;
    }
  } else if (direction === "above") {
    if (blockCenter <= anchorCenter) {
      score -= 0.75;
      reasons.push("matches above-reference cue");
    } else {
      score += 1.5;
    }
  } else {
    reasons.push("nearest to question text");
  }
  return { score, reason: reasons.join(", "), windowOverlap };
}

function visualPairingConfidence(
  association: ReturnType<typeof visualBlockAssociationScore>,
  nextBestScore: number | null,
  likelyVisualChoices: boolean
): "high" | "medium" | "low" {
  const margin = nextBestScore === null ? 99 : nextBestScore - association.score;
  if (association.windowOverlap >= 0.65 && margin >= (likelyVisualChoices ? 0.75 : 1.2)) return "high";
  if (association.windowOverlap >= 0.35 && margin >= 0.35) return "medium";
  return "low";
}

function buildVisualCropCandidates(drafts: DraftQuestionWithoutStorage[], pages: PageWithoutStorage[]) {
  const candidates: VisualCropCandidate[] = [];
  const pagesByNumber = new Map(pages.map((page) => [page.page_number, page]));

  for (const [draftIndex, draft] of drafts.entries()) {
    if (!draftNeedsVisualEvidence(draft)) continue;
    const assetType = visualAssetTypeForDraft(draft);
    const likelyVisualChoices = draft.type === "mcq" && (
      draft.choices.length < 4 ||
      draft.choices.some((choice) => cleanText(choice.text).length < 8 || /^Choice\s+[A-E]$/i.test(cleanText(choice.text)))
    );
    const blocks = Array.from(
      { length: Math.max(0, draft.source_page_end - draft.source_page_start + 1) },
      (_, offset) => draft.source_page_start + offset
    )
      .flatMap((pageNumber) => {
        const page = pagesByNumber.get(pageNumber);
        return (page?.raw_blocks || [])
          .map((block) => ({ pageNumber, block: usableVisualBlock(block), raw: block }))
          .filter((item): item is { pageNumber: number; block: NonNullable<ReturnType<typeof usableVisualBlock>>; raw: JsonRecord } => Boolean(item.block));
      })
      .map((item) => {
        const page = pagesByNumber.get(item.pageNumber)!;
        return { ...item, association: visualBlockAssociationScore(draft, drafts, page, item.pageNumber, item.block) };
      })
      .sort((a, b) => a.association.score - b.association.score || a.pageNumber - b.pageNumber || a.block.y0 - b.block.y0 || a.block.x0 - b.block.x0)
      .filter((item, index, sorted) => index === 0 || item.association.score <= sorted[0].association.score + (likelyVisualChoices ? 4 : 1.25))
      .slice(0, likelyVisualChoices ? 6 : 3);

    for (const [blockIndex, item] of blocks.entries()) {
      const nextBestScore = blocks[blockIndex + 1]?.association.score ?? null;
      candidates.push({
        candidateId: `draft-${draftIndex}-page-${item.pageNumber}-${item.block.kind}-${blockIndex}`,
        draftIndex,
        pageNumber: item.pageNumber,
        assetType: visualBlockAssetType(assetType, item.block.kind),
        bbox: item.block.bbox,
        blockNumber: item.block.blockNumber,
        source: typeof item.raw.source === "string" ? item.raw.source : "pymupdf",
        association: item.association.reason,
        associationScore: Number(item.association.score.toFixed(3)),
        associationConfidence: visualPairingConfidence(item.association, nextBestScore, likelyVisualChoices),
        questionWindowOverlap: Number(item.association.windowOverlap.toFixed(3))
      });
    }
  }

  return candidates;
}

function filterOutOfSequenceFrqDrafts(drafts: DraftQuestionWithoutStorage[]) {
  const kept: DraftQuestionWithoutStorage[] = [];
  let highestFrqQuestion: number | null = null;
  let removedCount = 0;
  for (const draft of drafts) {
    if (draft.type !== "frq" || draft.question_number === null) {
      kept.push(draft);
      continue;
    }
    if (highestFrqQuestion !== null && draft.question_number !== highestFrqQuestion + 1) {
      if (draft.question_number <= highestFrqQuestion || draft.question_number > highestFrqQuestion + 1) {
        removedCount += 1;
        continue;
      }
    }
    highestFrqQuestion = draft.question_number;
    kept.push(draft);
  }
  return { drafts: kept, removedCount };
}

function filterDuplicateMcqDrafts(drafts: DraftQuestionWithoutStorage[]) {
  const narrowestPageSpanByQuestion = new Map<number, number>();
  let removedCount = 0;
  for (const draft of drafts) {
    if (draft.type !== "mcq" || draft.question_number === null) continue;
    const draftPageSpan = draft.source_page_end - draft.source_page_start;
    const current = narrowestPageSpanByQuestion.get(draft.question_number);
    if (current === undefined || draftPageSpan < current) narrowestPageSpanByQuestion.set(draft.question_number, draftPageSpan);
  }
  const kept = drafts.filter((draft) => {
    if (draft.type !== "mcq" || draft.question_number === null) return true;
    const keep = draft.source_page_end - draft.source_page_start <= (narrowestPageSpanByQuestion.get(draft.question_number) ?? 0);
    if (!keep) removedCount += 1;
    return keep;
  });
  return { drafts: kept, removedCount };
}

export async function analyzePdfUpload(pdf: PdfUpload, options?: { ocrPageNumbers?: number[] }): Promise<PdfImportAnalysisInput> {
  const bytes = await loadPdfBytes(pdf);
  if (!isPdfBytes(bytes)) {
    return {
      pdfUploadId: pdf.id,
      status: "failed",
      parserVersion: PARSER_VERSION,
      ocrProvider: "none",
      pageCount: 0,
      warnings: ["The uploaded file does not look like a valid PDF. It does not contain a PDF header."],
      errorMessage: "Invalid PDF file.",
      pages: [],
      draftQuestions: [],
      draftAssets: []
    };
  }
  const pdfText = bytes.toString("binary");
  const structuredText = await runLocalStructuredTextExtraction(pdf);
  const pageCount = structuredText.pageCount || countPdfPages(pdfText);
  const structuredPageTexts = Array.from({ length: pageCount }, (_, index) =>
    cleanText(structuredText.results.get(index + 1)?.text || "")
  );
  const streamTexts = structuredPageTexts.some((text) => text.trim()) ? [] : extractStreamTexts(pdfText);
  const pageTexts = structuredPageTexts.some((text) => text.trim())
    ? structuredPageTexts
    : distributeStreamTextToPages(streamTexts, pageCount);
  const warnings: string[] = [];
  warnings.push(...structuredText.warnings);

  if (!pageTexts.some((text) => text.trim())) {
    warnings.push("No embedded PDF text was found. This is likely a scanned/image PDF and needs OCR.");
  }

  const pageQualities = pageTexts.map((text) => {
    const cleaned = cleanText(text || "");
    return { text: cleaned, quality: textQuality(cleaned) };
  });
  const pagesNeedingOcr = pageQualities
    .map((item, index) => (item.quality.usable ? null : index + 1))
    .filter((pageNumber): pageNumber is number => pageNumber !== null)
    .filter((pageNumber) => !options?.ocrPageNumbers || options.ocrPageNumbers.includes(pageNumber));
  const localOcr = pagesNeedingOcr.length > 0
    ? await runLocalTesseractOcr(pdf, pagesNeedingOcr)
    : { provider: "embedded-text", results: new Map<number, LocalOcrPageResult>(), warnings: [], skippedPageNumbers: new Set<number>() };
  warnings.push(...localOcr.warnings);

  const pages: PageWithoutStorage[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const { text, quality } = pageQualities[index] || { text: "", quality: textQuality("") };
    const structuredPage = structuredText.results.get(pageNumber);
    const rawBlocks = structuredPage?.raw_blocks || [];
    const answerKeyWarning = text && isAnswerKeyLikeText(text) ? ["This page looks like answer-key/explanation material and was excluded from question segmentation."] : [];
    if (quality.usable) {
      pages.push({
        page_number: pageNumber,
        extraction_method: "text",
        ocr_status: "not_needed",
        text_extracted: text,
        ocr_text: "",
        page_image_url: null,
        confidence: 0.7,
        warnings: [...answerKeyWarning, ...(structuredPage?.warnings || [])],
        raw_blocks: rawBlocks
      });
    } else {
      const ocr = localOcr.results.get(pageNumber);
      const ocrRawBlocks = ocr?.raw_blocks || [];
      const auditRawBlocks = ocr?.raw_text
        ? [...rawBlocks, ...ocrRawBlocks, { kind: "ocr_raw_text", source: "tesseract-local-raw", text: ocr.raw_text }]
        : [...rawBlocks, ...ocrRawBlocks];
      if (ocr && ocr.status === "completed") {
        const ocrText = cleanText(ocr.text);
        const ocrQuality = textQuality(ocrText);
        if (!ocrQuality.usable) {
          pages.push({
            page_number: pageNumber,
            extraction_method: "none",
            ocr_status: "completed",
            text_extracted: "",
            ocr_text: ocrText,
            page_image_url: ocr.image_url,
            confidence: normalizeConfidence(ocr.confidence),
            warnings: [
              ...(text ? [`Embedded text ignored: ${quality.reason}.`] : []),
              `OCR text ignored: ${ocrQuality.reason}.`,
              ...(structuredPage?.warnings || []),
              ...ocr.warnings
            ],
            raw_blocks: auditRawBlocks
          });
          continue;
        }
        pages.push({
          page_number: pageNumber,
          extraction_method: "ocr",
          ocr_status: "completed",
          text_extracted: "",
          ocr_text: ocrText,
          page_image_url: ocr.image_url,
          confidence: normalizeConfidence(ocr.confidence),
          warnings: [
            ...(text ? [`Embedded text ignored: ${quality.reason}.`] : []),
            ...(isAnswerKeyLikeText(ocrText) ? ["This OCR page looks like answer-key/explanation material and was excluded from question segmentation."] : []),
            ...(structuredPage?.warnings || []),
            ...ocr.warnings
          ],
          raw_blocks: auditRawBlocks
        });
        continue;
      }
      if (localOcr.skippedPageNumbers.has(pageNumber)) {
        pages.push({
          page_number: pageNumber,
          extraction_method: "none",
          ocr_status: "pending",
          text_extracted: "",
          ocr_text: "",
          page_image_url: null,
          confidence: null,
          warnings: [
            ...(text ? [`Embedded text ignored: ${quality.reason}.`] : []),
            ...(structuredPage?.warnings || []),
            "OCR was skipped for this page because PDF_OCR_MAX_PAGES limited this import run."
          ],
          raw_blocks: rawBlocks
        });
        continue;
      }
      if (options?.ocrPageNumbers && !options.ocrPageNumbers.includes(pageNumber)) {
        pages.push({
          page_number: pageNumber,
          extraction_method: "none",
          ocr_status: "pending",
          text_extracted: "",
          ocr_text: "",
          page_image_url: null,
          confidence: null,
          warnings: [...(structuredPage?.warnings || []), "OCR is pending in a later remote-worker page batch."],
          raw_blocks: rawBlocks
        });
        continue;
      }
      const unavailable = await unavailableOcrProvider.analyzePage(pageNumber);
      pages.push({
        page_number: pageNumber,
        extraction_method: "none",
        ocr_status: ocr?.status || unavailable.status,
        text_extracted: "",
        ocr_text: cleanText(ocr?.text || ""),
        page_image_url: ocr?.image_url || null,
        confidence: normalizeConfidence(ocr?.confidence),
        warnings: text
          ? [`Embedded text ignored: ${quality.reason}.`, ...(structuredPage?.warnings || []), ...(ocr?.warnings.length ? ocr.warnings : unavailable.warnings)]
          : [...(structuredPage?.warnings || []), ...(ocr?.warnings.length ? ocr.warnings : unavailable.warnings)],
        raw_blocks: auditRawBlocks
      });
    }
  }

  return finalizePdfPages(pdf, pages, warnings, localOcr.provider, pageCount);
}

export async function finalizePdfPages(
  pdf: PdfUpload,
  pages: PageWithoutStorage[],
  initialWarnings: string[] = [],
  ocrProvider = "tesseract-remote-worker",
  pageCount = pages.length
): Promise<PdfImportAnalysisInput> {
  const warnings = [...initialWarnings];
  const scoringContent = classifyScoringGuideContent(pages);
  warnings.push(...scoringContent.warnings);
  const segmentationSections = buildSegmentationSections(pages);
  for (const page of pages) {
    const extraWarnings = [
      ...(scoringContent.warningsByPage.get(page.page_number) || []),
      ...(segmentationSections.warningsByPage.get(page.page_number) || [])
    ];
    if (extraWarnings.length > 0) page.warnings = Array.from(new Set([...page.warnings, ...extraWarnings]));
  }

  let questionBlocks = splitQuestionBlocks(pages, segmentationSections.sectionByPage);
  if (questionBlocks.length === 0) {
    const answerDelimitedBlocks = splitAnswerDelimitedMcqBlocks(pages, segmentationSections.sectionByPage);
    if (answerDelimitedBlocks.length > 0) {
      warnings.push(
        `Used answer-delimited MCQ fallback segmentation for ${answerDelimitedBlocks.length} draft question(s). Admin must verify every question before saving.`
      );
      questionBlocks = answerDelimitedBlocks;
    }
  }

  let draftQuestions = questionBlocks
    .filter((block) => isSegmentedBlockWorthReview(block, pdf))
    .map((block) => draftFromBlock(block, pages, pdf));
  const duplicateMcqFilter = filterDuplicateMcqDrafts(draftQuestions);
  draftQuestions = duplicateMcqFilter.drafts;
  if (duplicateMcqFilter.removedCount > 0) {
    warnings.push(`Filtered ${duplicateMcqFilter.removedCount} duplicate MCQ candidate(s) with broader source-page spans.`);
  }
  const frqSequenceFilter = filterOutOfSequenceFrqDrafts(draftQuestions);
  draftQuestions = frqSequenceFilter.drafts;
  if (frqSequenceFilter.removedCount > 0) {
    warnings.push(`Filtered ${frqSequenceFilter.removedCount} out-of-sequence FRQ-like starts that looked like formula/subpart noise.`);
  }
  const answerKeyEntries = pages.flatMap((page) => extractAnswerKeyEntries(acceptedPageText(page), page.page_number));
  const answerKeyAssociation = applyExplicitAnswerKeyEntries(draftQuestions, answerKeyEntries);
  warnings.push(...answerKeyAssociation.warnings);
  if (answerKeyAssociation.appliedCount > 0) {
    warnings.push(`Matched explicit answer-key entries to ${answerKeyAssociation.appliedCount} MCQ draft(s). Verify every answer before saving.`);
  }
  const explanationEntries = pages.flatMap((page) => extractExplanationEntries(acceptedPageText(page), page.page_number));
  const explanationAssociation = applyExplicitExplanationEntries(draftQuestions, explanationEntries);
  warnings.push(...explanationAssociation.warnings);
  if (explanationAssociation.appliedCount > 0) {
    warnings.push(`Matched explicit explanation/rationale entries to ${explanationAssociation.appliedCount} draft(s). Verify every explanation before saving.`);
  }
  if (isScoringGuidePdf(pdf) || scoringContent.shouldSuppressDrafts) {
    if (draftQuestions.length > 0) {
      warnings.push("This file looks like a scoring guide or sample-response document. Draft generation was suppressed to avoid importing rubric/scoring text as questions.");
    }
    draftQuestions = [];
  }
  const visualPageNumbers = draftQuestions
    .filter(draftNeedsVisualEvidence)
    .flatMap((draft) =>
      Array.from(
        { length: Math.max(0, draft.source_page_end - draft.source_page_start + 1) },
        (_, offset) => draft.source_page_start + offset
      )
    )
    .filter((pageNumber) => {
      const page = pages.find((item) => item.page_number === pageNumber);
      return page && !page.page_image_url;
    });
  if (visualPageNumbers.length > 0) {
    const renderedPages = await runLocalPageRender(pdf, visualPageNumbers);
    warnings.push(...renderedPages.warnings);
    for (const page of pages) {
      const rendered = renderedPages.results.get(page.page_number);
      if (rendered?.image_url) {
        page.page_image_url = rendered.image_url;
        page.warnings = Array.from(
          new Set([
            ...page.warnings,
            "Rendered source-page preview for visual-reference review. Crop/verify before using as a question image.",
            ...(rendered.warnings || [])
          ])
        );
      } else if (renderedPages.skippedPageNumbers.has(page.page_number)) {
        page.warnings = Array.from(new Set([...page.warnings, "Source-page preview rendering was skipped by PDF_RENDER_MAX_PAGES."]));
      }
    }
  }
  const visualCropCandidates = buildVisualCropCandidates(draftQuestions, pages);
  const visualCropResults = visualCropCandidates.length > 0
    ? await runLocalVisualCropRender(pdf, visualCropCandidates)
    : { results: new Map<string, { candidate_id: string; page_number: number; image_url: string | null; bbox: [number, number, number, number] | null; warnings: string[] }>(), warnings: [] };
  warnings.push(...visualCropResults.warnings);
  const cropCandidateCountsByDraft = new Map<number, number>();
  const renderedCropCountsByDraft = new Map<number, number>();
  const draftAssets = visualCropCandidates.flatMap((candidate) => {
    cropCandidateCountsByDraft.set(candidate.draftIndex, (cropCandidateCountsByDraft.get(candidate.draftIndex) || 0) + 1);
    const rendered = visualCropResults.results.get(candidate.candidateId);
    const renderedWarnings = rendered?.warnings || [];
    if (rendered?.image_url) renderedCropCountsByDraft.set(candidate.draftIndex, (renderedCropCountsByDraft.get(candidate.draftIndex) || 0) + 1);
    const bbox = rendered?.bbox || candidate.bbox;
    return [{
      draft_question_index: candidate.draftIndex,
      page_number: candidate.pageNumber,
      asset_type: candidate.assetType,
      image_url: rendered?.image_url || null,
      bbox: {
        page_number: candidate.pageNumber,
        bbox,
        source: candidate.source,
        block_number: candidate.blockNumber,
        candidate_id: candidate.candidateId,
        association: candidate.association,
        association_score: candidate.associationScore,
        association_confidence: candidate.associationConfidence,
        question_window_overlap: candidate.questionWindowOverlap
      },
      keep_for_question: false,
      status: "candidate" as const,
      notes: [
        "Candidate source page for a visual reference. This is a cropped source candidate, not saved automatically.",
        `Auto-associated for review (${candidate.associationConfidence} confidence, score ${candidate.associationScore}): ${candidate.association}.`,
        rendered?.image_url ? "Admin must verify the crop before using it as a question image." : "Crop rendering did not produce an image; use the source page preview to crop manually.",
        ...renderedWarnings
      ].filter(Boolean).join(" ")
    }];
  });
  for (const [draftIndex, draft] of draftQuestions.entries()) {
    if (!draftNeedsVisualEvidence(draft)) continue;
    const candidateCount = cropCandidateCountsByDraft.get(draftIndex) || 0;
    const renderedCount = renderedCropCountsByDraft.get(draftIndex) || 0;
    if (renderedCount > 0) {
      draft.warnings = Array.from(new Set([
        ...draft.warnings,
        `Generated ${renderedCount} cropped visual evidence candidate(s) from bounded PDF source blocks. Admin must verify the association and crop before saving.`
      ]));
    } else if (candidateCount > 0) {
      draft.warnings = Array.from(new Set([
        ...draft.warnings,
        "Found possible visual source blocks, but automatic crop rendering failed. Use the source page preview to crop manually before saving."
      ]));
    } else {
      draft.warnings = Array.from(new Set([
        ...draft.warnings,
        "No usable crop candidate was found for the referenced visual/table/diagram. Treat this draft as incomplete until source visual evidence is supplied."
      ]));
    }
  }

  if (draftQuestions.length === 0) {
    warnings.push("No draft questions were segmented. Admin review needs OCR text or a text-based PDF.");
  }

  return {
    pdfUploadId: pdf.id,
    status: draftQuestions.length > 0 ? "needs_review" : "failed",
    parserVersion: PARSER_VERSION,
    ocrProvider,
    pageCount,
    warnings,
    errorMessage: draftQuestions.length > 0 ? null : "No draft questions could be created from the available text.",
    pages,
    draftQuestions,
    draftAssets
  };
}

export async function parsePdfToQuestions(pdfUploadId: string) {
  void pdfUploadId;
  return [];
}
