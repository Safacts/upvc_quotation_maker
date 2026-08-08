/**
 * spreadsheet.ts — CSV and XLSX generation for the console export endpoints.
 *
 * CSV reuses the RFC-4180 escaping in src/lib/console-format.ts. XLSX is emitted
 * as SpreadsheetML (the "Excel 2003 XML" format Excel opens natively) — no
 * external dependency, which keeps the bundle lean and avoids a per-seat licence.
 */

import { csvCell, downloadFile } from "@/lib/console-format";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Build a CSV document with a UTF-8 BOM so Excel renders Indian names correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // CRLF per RFC 4180; the BOM stops Excel guessing the encoding as ANSI.
  return "\ufeff" + lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// XLSX (SpreadsheetML 2003)
// ---------------------------------------------------------------------------

/** XML-escape a value for use in a SpreadsheetML text node. */
function xmlEscape(s: string): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string),
  );
}

const SS_NS =
  'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
  'xmlns="urn:schemas-microsoft-com:office:spreadsheet"';

const HEADER_STYLE =
  '<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style>';
const NUMERIC_STYLE = '<Style ss:ID="numeric"><NumberFormat ss:Format="#,##0.00"/></Style>';
const TEXT_STYLE = '<Style ss:ID="text"><NumberFormat ss:Format="@"/></Style>';

/** Coerce a value for a cell: numbers stay numeric, everything else is text. */
function cell(value: unknown, forceText = false): string {
  if (forceText) {
    return `<Cell ss:StyleID="text"><Data ss:Type="String">${xmlEscape(String(value ?? ""))}</Data></Cell>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell ss:StyleID="numeric"><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  const n = Number(value);
  if (value !== null && value !== undefined && value !== "" && Number.isFinite(n)) {
    return `<Cell ss:StyleID="numeric"><Data ss:Type="Number">${n}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="text"><Data ss:Type="String">${xmlEscape(String(value ?? ""))}</Data></Cell>`;
}

/** SpreadsheetML is verbose; the indenter keeps the output debuggable. */
function ws(name: string, headers: string[], rows: unknown[][]): string {
  const headerCells = headers.map((h) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join("");
  const dataRows = rows
    .map((r) => {
      const cells = r.map((c) => cell(c)).join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return (
    `<Worksheet ss:Name="${xmlEscape(name)}">\n` +
    `  <Table>\n` +
    `    <Row>${headerCells}</Row>\n` +
    `${dataRows}\n` +
    `  </Table>\n` +
    `</Worksheet>`
  );
}

/**
 * Build a SpreadsheetML (Excel XML) document with one worksheet per {name, headers, rows}.
 */
export function toXlsx(sheets: Array<{ name: string; headers: string[]; rows: unknown[][] }>): string {
  const body = sheets.map((s) => ws(s.name.slice(0, 31), s.headers, s.rows)).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook ${SS_NS}>\n` +
    `  <Styles>\n` +
    `    ${HEADER_STYLE}\n` +
    `    ${NUMERIC_STYLE}\n` +
    `    ${TEXT_STYLE}\n` +
    `  </Styles>\n` +
    `${body}\n` +
    `</Workbook>\n`
  );
}

/** Trigger a client-side file download. Re-exported for a single import site. */
export { downloadFile };
