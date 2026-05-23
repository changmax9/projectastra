import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
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

export const PARSER_VERSION = "pdf-import-mvp-2026-05-23";
const CHOICE_MARKER_RE = /(?:^|\s)(?:\(([A-E])\)|([A-E])[\).])\s+/g;
const FRQ_PART_RE = /(?:^|\s)\(((?:[a-g])|(?:i{1,3}|iv|v))\)\s+/gi;
const DEFAULT_OCR_MAX_PAGES = 12;
const DEFAULT_OCR_TIMEOUT_MS = 30_000;
const DEFAULT_TEXT_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

type DraftQuestionWithoutStorage = PdfImportAnalysisInput["draftQuestions"][number];
type PageWithoutStorage = PdfImportAnalysisInput["pages"][number];

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
  return candidate === "python" || candidate === "tesseract" || existsSync(candidate);
}

function findPythonCommand() {
  if (process.env.PDF_OCR_PYTHON) {
    return commandExists(process.env.PDF_OCR_PYTHON) ? process.env.PDF_OCR_PYTHON : null;
  }
  return ["D:\\Anaconda\\python.exe", "python"].find(commandExists) || null;
}

function findTesseractCommand() {
  if (process.env.TESSERACT_CMD) {
    return commandExists(process.env.TESSERACT_CMD) ? process.env.TESSERACT_CMD : null;
  }
  return ["C:\\Program Files\\Tesseract-OCR\\tesseract.exe", "tesseract"].find(commandExists) || null;
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

function parseOcrTimeoutMs() {
  const raw = process.env.PDF_OCR_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return { value: DEFAULT_OCR_TIMEOUT_MS, warning: null as string | null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: DEFAULT_OCR_TIMEOUT_MS,
      warning: `Invalid PDF_OCR_TIMEOUT_MS value "${raw}". Using the default timeout of ${DEFAULT_OCR_TIMEOUT_MS} ms.`
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
    const errorMessage = error instanceof Error ? error.message : "Structured PDF text extraction failed.";
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(errorMessage)
        ? `Structured PDF text worker timed out after ${timeoutMs} ms.`
        : errorMessage;
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
  const { value: timeoutMs, warning: timeoutWarning } = parseOcrTimeoutMs();
  const selectedPages = maxPages > 0 ? pageNumbers.slice(0, maxPages) : pageNumbers;
  const skippedPageNumbers = new Set(pageNumbers.filter((pageNumber) => !selectedPages.includes(pageNumber)));
  const warnings =
    maxPages > 0 && pageNumbers.length > selectedPages.length
      ? [`OCR limited to first ${selectedPages.length} of ${pageNumbers.length} requested pages. Set PDF_OCR_MAX_PAGES=0 to process all pages.`]
      : [];
  if (maxPagesWarning) warnings.unshift(maxPagesWarning);
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
        tesseractCmd
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
    const errorMessage = error instanceof Error ? error.message : "Local OCR worker failed.";
    const maybeChildError = error as { killed?: boolean; signal?: string } | null;
    const workerWarning =
      maybeChildError?.killed || maybeChildError?.signal === "SIGTERM" || /timed out/i.test(errorMessage)
        ? `Local OCR worker timed out after ${timeoutMs} ms.`
        : errorMessage;
    return {
      provider: unavailableOcrProvider.name,
      results: new Map<number, LocalOcrPageResult>(),
      warnings: [...warnings, workerWarning],
      skippedPageNumbers
    } satisfies LocalOcrRunResult;
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
    /(?:^|\s)(Answer\s+Key|Answer|Correct\s+Answer|Key|Explanations?|Explanation|Rationale|Scoring\s+Notes?|Rubric|Scoring\s+Guideline)\s*[:\-]?\s+/i
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

function extractFrqParts(text: string): PdfFrqPartDraft[] {
  const matches = [...text.matchAll(FRQ_PART_RE)];
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      label: match[1].toLowerCase(),
      prompt: cleanText(text.slice(start, end))
    };
  });
}

function splitQuestionBlocks(pages: PageWithoutStorage[]) {
  const joined = pages
    .map((page) => {
      const usableText = acceptedPageText(page);
      if (!usableText || isAnswerKeyLikeText(usableText)) return "";
      return `\n\n[[PAGE ${page.page_number}]]\n${usableText}`;
    })
    .filter(Boolean)
    .join("\n");
  const questionStartRe = /(?:^|\n)(?:\[\[PAGE\s+(\d+)\]\]\s*)?(?:Question\s+)?(\d{1,3})[\).]\s+/gi;
  const starts = [...joined.matchAll(questionStartRe)];
  if (starts.length === 0) {
    return [];
  }

  return starts.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = starts[index + 1]?.index ?? joined.length;
    const chunk = joined.slice(start, end);
    const pageMarkers = [...chunk.matchAll(/\[\[PAGE\s+(\d+)\]\]/g)].map((item) => Number(item[1]));
    const pageFromPrefix = match[1] ? Number(match[1]) : null;
    const fallbackPage = pageFromPrefix || pageMarkers[0] || 1;
    return {
      questionNumber: Number(match[2]),
      pageStart: Math.min(fallbackPage, ...pageMarkers.filter(Number.isFinite)),
      pageEnd: Math.max(fallbackPage, ...pageMarkers.filter(Number.isFinite)),
      text: cleanText(chunk.replace(/\[\[PAGE\s+\d+\]\]/g, "")),
      pageNumbers: Array.from(new Set([fallbackPage, ...pageMarkers].filter(Number.isFinite))).sort((a, b) => a - b)
    };
  });
}

function draftFromBlock(
  block: { questionNumber: number | null; pageStart: number; pageEnd: number; text: string; pageNumbers?: number[] },
  pages: PageWithoutStorage[],
  pdf: PdfUpload
): DraftQuestionWithoutStorage {
  const { stem, choices } = splitChoices(block.text);
  const frqParts = extractFrqParts(block.text);
  const type = !isFrqPacket(pdf) && choices.length >= 2 ? "mcq" : "frq";
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
    warnings.push("The text appears to reference a visual. Diagram/table cropping is not automatic in this local OCR MVP.");
  }
  if (type === "frq" && /(?:^|\s)[A-E][\).]?\s+\S/i.test(block.text)) {
    warnings.push("Possible answer choices were detected, but labels were too noisy to create a reliable MCQ draft.");
  }
  const blockPages = pages.filter((page) => (block.pageNumbers || []).includes(page.page_number));
  const normalizedConfidences = blockPages
    .map((page) => page.confidence)
    .filter((value): value is number => typeof value === "number")
    .map((value) => (value > 1 ? value / 100 : value));
  const minPageConfidence = normalizedConfidences.length > 0 ? Math.min(...normalizedConfidences) : null;
  let confidence = choices.length >= 2 || frqParts.length > 0 ? 0.65 : 0.35;
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
    frq_parts: type === "frq" ? frqParts : [],
    question_images: [],
    confidence,
    warnings
  };
}

export async function analyzePdfUpload(pdf: PdfUpload): Promise<PdfImportAnalysisInput> {
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
    .filter((pageNumber): pageNumber is number => pageNumber !== null);
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
            confidence: ocr.confidence,
            warnings: [
              ...(text ? [`Embedded text ignored: ${quality.reason}.`] : []),
              `OCR text ignored: ${ocrQuality.reason}.`,
              ...(structuredPage?.warnings || []),
              ...ocr.warnings
            ],
            raw_blocks: rawBlocks
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
          confidence: ocr.confidence,
          warnings: [
            ...(text ? [`Embedded text ignored: ${quality.reason}.`] : []),
            ...(isAnswerKeyLikeText(ocrText) ? ["This OCR page looks like answer-key/explanation material and was excluded from question segmentation."] : []),
            ...(structuredPage?.warnings || []),
            ...ocr.warnings
          ],
          raw_blocks: rawBlocks
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
      const unavailable = await unavailableOcrProvider.analyzePage(pageNumber);
      pages.push({
        page_number: pageNumber,
        extraction_method: "none",
        ocr_status: ocr?.status || unavailable.status,
        text_extracted: "",
        ocr_text: cleanText(ocr?.text || ""),
        page_image_url: ocr?.image_url || null,
        confidence: ocr?.confidence || null,
        warnings: text
          ? [`Embedded text ignored: ${quality.reason}.`, ...(structuredPage?.warnings || []), ...(ocr?.warnings.length ? ocr.warnings : unavailable.warnings)]
          : [...(structuredPage?.warnings || []), ...(ocr?.warnings.length ? ocr.warnings : unavailable.warnings)],
        raw_blocks: rawBlocks
      });
    }
  }

  let draftQuestions = splitQuestionBlocks(pages)
    .filter((block) => block.text.length >= 20)
    .map((block) => draftFromBlock(block, pages, pdf));
  if (isScoringGuidePdf(pdf)) {
    if (draftQuestions.length > 0) {
      warnings.push("This file looks like a scoring guide or sample-response document. Draft generation was suppressed to avoid importing rubric/scoring text as questions.");
    }
    draftQuestions = [];
  }
  const draftAssets = draftQuestions.flatMap((draft, draftIndex) => {
    if (!draft.warnings.some((warning) => /visual|diagram|table|graph/i.test(warning))) return [];
    const sourcePage = pages.find(
      (page) => page.page_number >= draft.source_page_start && page.page_number <= draft.source_page_end && page.page_image_url
    );
    if (!sourcePage?.page_image_url) return [];
    const assetType = /table/i.test(draft.question_text) ? "table" : /diagram|graph|figure|shown|below/i.test(draft.question_text) ? "diagram" : "unknown";
    return [{
      draft_question_index: draftIndex,
      page_number: sourcePage.page_number,
      asset_type: assetType as "diagram" | "table" | "unknown",
      image_url: sourcePage.page_image_url,
      bbox: null,
      keep_for_question: false,
      status: "candidate" as const,
      notes: "Candidate source page for a visual reference. Admin must crop/verify before using as a question image."
    }];
  });

  if (draftQuestions.length === 0) {
    warnings.push("No draft questions were segmented. Admin review needs OCR text or a text-based PDF.");
  }

  return {
    pdfUploadId: pdf.id,
    status: draftQuestions.length > 0 ? "needs_review" : "failed",
    parserVersion: PARSER_VERSION,
    ocrProvider: localOcr.provider,
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
