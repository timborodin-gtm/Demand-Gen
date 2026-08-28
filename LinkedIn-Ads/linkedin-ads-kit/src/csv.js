/**
 * CSV ingestion utilities.
 *
 * Safety guarantees:
 * - `loadCsv` rejects files larger than `MAX_CSV_BYTES` (default 100 MB) before
 *   reading them into memory. The error message includes the file path,
 *   observed byte size, and the configured limit.
 * - `parseCsv` rejects datasets with more than `MAX_CSV_ROWS` (default 100,000)
 *   data rows and emits a stderr warning above `WARN_CSV_ROWS` (default 10,000)
 *   so operators see runaway exports before they break downstream summarizers.
 * - When two source headers normalize to the same key (e.g. `Work Email` and
 *   `work-email` both collapse to `work_email`) the parser keeps both columns
 *   by suffixing later collisions (`work_email`, `work_email__2`, ...) and
 *   emits a stderr warning that lists the original headers, the normalized
 *   key, and the file path. This avoids the previous silent overwrite where
 *   a malicious CSV could mask one `email`-equivalent column with another.
 *
 * Formula-injection defusal lives at the rendering boundary. See
 * `sanitizeCellForMarkdown`. Do not invoke it inside the parser; raw values
 * stay raw so downstream consumers can choose the right escape.
 */
import { readFile, stat } from "node:fs/promises";

export const MAX_CSV_BYTES = 100 * 1024 * 1024;
export const MAX_CSV_ROWS = 100_000;
export const WARN_CSV_ROWS = 10_000;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export async function loadCsv(filePath, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_CSV_BYTES;
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;
  const warnRows = options.warnRows ?? WARN_CSV_ROWS;
  const stderr = options.stderr ?? process.stderr;

  const stats = await stat(filePath);
  if (stats.size > maxBytes) {
    throw new Error(
      `CSV refused: ${filePath} is ${stats.size} bytes which exceeds the ${maxBytes} byte limit. Trim the export or raise MAX_CSV_BYTES.`
    );
  }

  const content = decodeCsvBuffer(await readFile(filePath));
  return parseCsv(content, { maxRows, warnRows, stderr, sourcePath: filePath });
}

export function parseCsv(content, options = {}) {
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;
  const warnRows = options.warnRows ?? WARN_CSV_ROWS;
  const stderr = options.stderr ?? process.stderr;
  const sourcePath = options.sourcePath || "<inline>";

  const delimiter = detectDelimiter(content);
  const rows = parseCsvRows(content, delimiter);
  if (rows.length === 0) return [];

  const headerIndex = findHeaderRowIndex(rows);
  const headers = buildUniqueHeaders(rows[headerIndex], { stderr, sourcePath });
  const dataRows = rows.slice(headerIndex + 1)
    .filter((row) => row.some((value) => String(value || "").trim() !== ""));

  if (dataRows.length > maxRows) {
    throw new Error(
      `CSV refused: ${sourcePath} contains ${dataRows.length} rows which exceeds the ${maxRows} row limit. Split the export or raise MAX_CSV_ROWS.`
    );
  }

  if (dataRows.length > warnRows) {
    stderr.write(
      `WARN: ${sourcePath} has ${dataRows.length} rows (warn threshold ${warnRows}). Summaries may be slow or noisy.\n`
    );
  }

  return dataRows.map((row) => {
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = String(row[index] ?? "").trim();
    }
    return record;
  });
}

function buildUniqueHeaders(headerRow, { stderr, sourcePath }) {
  const seen = new Map();
  const headers = [];

  for (let index = 0; index < headerRow.length; index += 1) {
    const original = String(headerRow[index] ?? "");
    const base = normalizeHeader(original) || `column_${index + 1}`;
    const previous = seen.get(base);

    if (!previous) {
      seen.set(base, { count: 1, original });
      headers.push(base);
      continue;
    }

    previous.count += 1;
    const suffixed = `${base}__${previous.count}`;
    stderr.write(
      `WARN: duplicate CSV header in ${sourcePath}. "${previous.original}" and "${original}" both normalize to "${base}"; keeping the second column as "${suffixed}".\n`
    );
    headers.push(suffixed);
  }

  return headers;
}

export function decodeCsvBuffer(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return swapUtf16Bytes(buffer.subarray(2)).toString("utf16le");
  }

  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function parseCsvRows(content, delimiter = ",") {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function detectDelimiter(content) {
  const candidates = [",", "\t", ";"];
  const lines = content.split(/\r?\n/).slice(0, 50);
  let best = ",";
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = lines.reduce((memo, line) => memo + countOccurrences(line, candidate), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function findHeaderRowIndex(rows) {
  const signals = new Set([
    "campaign_id",
    "campaign_name",
    "campaign_status",
    "ad_id",
    "ad_name",
    "impressions",
    "clicks",
    "total_spent",
    "spend",
    "leads",
    "lead_id",
    "first_name",
    "last_name",
    "email_address",
    "work_email",
    "company_name",
    "job_title",
    "test_lead",
    "submitted_at",
    "form_name"
  ]);
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const normalized = rows[index].map(normalizeHeader);
    const signalScore = normalized.filter((header) => signals.has(header)).length;
    const widthScore = rows[index].length >= 5 ? 1 : 0;
    const score = signalScore * 5 + widthScore;

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return bestScore > 1 ? bestIndex : 0;
}

function countOccurrences(value, search) {
  return String(value).split(search).length - 1;
}

function swapUtf16Bytes(buffer) {
  const swapped = Buffer.from(buffer);
  for (let index = 0; index < swapped.length - 1; index += 2) {
    const current = swapped[index];
    swapped[index] = swapped[index + 1];
    swapped[index + 1] = current;
  }
  return swapped;
}

export function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[%$]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function pick(row, names, fallback = "") {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return fallback;
}

export function numberValue(row, names, fallback = 0) {
  const raw = pick(row, names, "");
  if (raw === "") return fallback;
  const value = Number(String(raw).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Defuse spreadsheet formula-injection vectors at the markdown rendering
 * boundary. If the cell starts with `=`, `+`, `-`, `@`, TAB, or CR, prefix
 * with a single quote (Excel/Sheets standard neutralizer) so the cell is
 * treated as text when the brief is pasted into a spreadsheet.
 *
 * Apply this to user-controlled values (CSV cells, lead-form responses, ad
 * names, campaign names) just before they land in markdown. Do NOT apply it
 * inside the parser — raw cells stay raw so downstream consumers (CSV
 * round-trips, JSON exports) get the original values.
 *
 * @param {*} cell value to render
 * @returns {string} cell with leading quote when needed, otherwise unchanged
 */
export function sanitizeCellForMarkdown(cell) {
  if (cell === null || cell === undefined) return "";
  const text = String(cell);
  if (text.length === 0) return text;
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}
