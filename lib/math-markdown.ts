const GFM_TABLE_SEPARATOR_RE = /\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|/g;

function normalizeEscapedLineBreaks(content: string) {
  return content
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\\n(?=\s*\|)/g, "\n")
    .replace(/\|\\n/g, "|\n");
}

function findHeaderStart(content: string, separatorStart: number, columnCount: number) {
  let cursor = separatorStart - 1;
  const pipePositions: number[] = [];

  while (cursor >= 0 && pipePositions.length < columnCount + 1) {
    const pipe = content.lastIndexOf("|", cursor);
    if (pipe < 0) return -1;
    pipePositions.push(pipe);
    cursor = pipe - 1;
  }

  return pipePositions[columnCount] ?? -1;
}

function readTableRow(content: string, start: number, columnCount: number) {
  let rowStart = start;
  while (rowStart < content.length && /\s/.test(content[rowStart])) rowStart += 1;
  if (content[rowStart] !== "|") return null;

  let cursor = rowStart + 1;
  let pipeCount = 1;
  while (pipeCount < columnCount + 1) {
    const pipe = content.indexOf("|", cursor);
    if (pipe < 0) return null;
    const lineBreak = content.indexOf("\n", cursor);
    if (lineBreak >= 0 && lineBreak < pipe) return null;
    pipeCount += 1;
    cursor = pipe + 1;
  }

  return { start: rowStart, end: cursor };
}

function normalizeGfmTables(content: string) {
  let result = content;
  let searchFrom = 0;

  while (searchFrom < result.length) {
    GFM_TABLE_SEPARATOR_RE.lastIndex = searchFrom;
    const separator = GFM_TABLE_SEPARATOR_RE.exec(result);
    if (!separator || separator.index === undefined) break;

    const columnCount = separator[0].split("|").length - 2;
    const headerStart = findHeaderStart(result, separator.index, columnCount);
    if (headerStart < 0) {
      searchFrom = separator.index + separator[0].length;
      continue;
    }

    const rows: string[] = [];
    let rowCursor = separator.index + separator[0].length;
    while (true) {
      const row = readTableRow(result, rowCursor, columnCount);
      if (!row) break;
      rows.push(result.slice(row.start, row.end).trim());
      rowCursor = row.end;
    }

    const header = result.slice(headerStart, separator.index).trim();
    const table = [header, separator[0].trim(), ...rows].join("\n");
    const before = result.slice(0, headerStart).replace(/[ \t]+$/, "");
    const after = result.slice(rowCursor).replace(/^[ \t]+/, "");
    const replacement = `${before.endsWith("\n\n") || before.length === 0 ? "" : "\n\n"}${table}${after.startsWith("\n\n") || after.length === 0 ? "" : "\n\n"}`;

    result = before + replacement + after;
    searchFrom = before.length + replacement.length;
  }

  return result;
}

function normalizeFrqParts(content: string) {
  const partMarkerRe = /(^|\s+)\(([a-f])\)\s+/gim;
  const partMarkers = [...content.matchAll(partMarkerRe)].filter((match) => {
    const prefix = content.slice(0, match.index).trimEnd();
    return !/\bparts?$/i.test(prefix);
  });
  if (partMarkers.length < 2) return content;
  return content.replace(partMarkerRe, (match, _spacing: string, part: string, offset: number) => {
    const prefix = content.slice(0, offset).trimEnd();
    if (/\bparts?$/i.test(prefix)) return match;
    return `${offset === 0 ? "" : "\n\n"}(${part.toLowerCase()}) `;
  });
}

export function normalizeMarkdownStructure(content: string) {
  const withLineBreaks = normalizeEscapedLineBreaks(String(content || "").replace(/\r\n?/g, "\n"));
  return normalizeFrqParts(normalizeGfmTables(withLineBreaks))
    .replace(/([A-Za-z])\\prime\s+s\b/g, "$1's")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeMathDelimiters(content: string) {
  return content
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`);
}

export function normalizeMathMarkdown(content: string) {
  return normalizeMathDelimiters(normalizeMarkdownStructure(content));
}
