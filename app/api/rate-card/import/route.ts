import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPost, supaPatch, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const ITEM_TYPES = ["any", "fixed", "sliding", "casement", "french", "tilt_turn", "villa_grill", "arch", "custom"];
const MESH_TYPES = ["none", "plain", "pleated", "magnetic"];
const HARDWARE_TIERS = ["basic", "standard", "premium"];
const MAX_ROWS = 1000;
const PREVIEW_LIMIT = 10;

type ParsedRow = {
  item_type: string;
  glass_spec: string | null;
  mesh_type: string | null;
  hardware_tier: string | null;
  price_per_sqft: number;
  min_width_mm: number | null;
  max_width_mm: number | null;
  min_height_mm: number | null;
  max_height_mm: number | null;
  validity_start: string | null;
  validity_end: string | null;
  is_active: boolean;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status, headers: CORS_HEADERS });
}

function businessKey(itemType: string, glassSpec: string | null, meshType: string | null, tier: string | null): string {
  return [itemType, glassSpec ?? "", meshType ?? "", tier ?? ""].join("|");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

function optInt(v: string | undefined): { value?: number; error?: string } {
  const s = (v ?? "").trim();
  if (!s) return {};
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return { error: `"${s}" is not a valid mm dimension` };
  return { value: n };
}

function optDate(v: string | undefined): { value?: string; error?: string } {
  const s = (v ?? "").trim();
  if (!s) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) {
    return { error: `"${s}" is not a YYYY-MM-DD date` };
  }
  return { value: s };
}

function validateRow(cells: Record<string, string>): { row?: ParsedRow; error?: string } {
  const itemType = (cells.item_type ?? "").trim().toLowerCase();
  if (!itemType) return { error: "item_type is empty" };
  if (!ITEM_TYPES.includes(itemType)) {
    return { error: `item_type "${cells.item_type}" not allowed (use one of: ${ITEM_TYPES.join(", ")})` };
  }

  const priceRaw = (cells.price_per_sqft ?? "").trim();
  if (!priceRaw) return { error: "price_per_sqft is empty" };
  const price = Number(priceRaw);
  if (!isFinite(price) || price <= 0) return { error: `price_per_sqft "${priceRaw}" must be a positive number` };

  const mesh = (cells.mesh_type ?? "").trim().toLowerCase() || null;
  if (mesh && !MESH_TYPES.includes(mesh)) {
    return { error: `mesh_type "${cells.mesh_type}" not allowed (use one of: ${MESH_TYPES.join(", ")})` };
  }

  const tier = (cells.hardware_tier ?? "").trim().toLowerCase() || null;
  if (tier && !HARDWARE_TIERS.includes(tier)) {
    return { error: `hardware_tier "${cells.hardware_tier}" not allowed (use one of: ${HARDWARE_TIERS.join(", ")})` };
  }

  const minW = optInt(cells.min_width_mm);
  if (minW.error) return { error: `min_width_mm ${minW.error}` };
  const maxW = optInt(cells.max_width_mm);
  if (maxW.error) return { error: `max_width_mm ${maxW.error}` };
  const minH = optInt(cells.min_height_mm);
  if (minH.error) return { error: `min_height_mm ${minH.error}` };
  const maxH = optInt(cells.max_height_mm);
  if (maxH.error) return { error: `max_height_mm ${maxH.error}` };
  if (minW.value != null && maxW.value != null && minW.value > maxW.value) {
    return { error: `min_width_mm (${minW.value}) is greater than max_width_mm (${maxW.value})` };
  }
  if (minH.value != null && maxH.value != null && minH.value > maxH.value) {
    return { error: `min_height_mm (${minH.value}) is greater than max_height_mm (${maxH.value})` };
  }

  const vStart = optDate(cells.validity_start);
  if (vStart.error) return { error: `validity_start ${vStart.error}` };
  const vEnd = optDate(cells.validity_end);
  if (vEnd.error) return { error: `validity_end ${vEnd.error}` };
  if (vStart.value && vEnd.value && vStart.value > vEnd.value) {
    return { error: "validity_start is after validity_end" };
  }

  const activeRaw = (cells.is_active ?? "").trim().toLowerCase();
  if (activeRaw && !["true", "false", "yes", "no", "1", "0"].includes(activeRaw)) {
    return { error: `is_active "${cells.is_active}" must be true or false` };
  }

  return {
    row: {
      item_type: itemType,
      glass_spec: (cells.glass_spec ?? "").trim() || null,
      mesh_type: mesh,
      hardware_tier: tier,
      price_per_sqft: price,
      min_width_mm: minW.value ?? null,
      max_width_mm: maxW.value ?? null,
      min_height_mm: minH.value ?? null,
      max_height_mm: maxH.value ?? null,
      validity_start: vStart.value ?? null,
      validity_end: vEnd.value ?? null,
      is_active: !["false", "no", "0"].includes(activeRaw),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "customer" && session.role !== "admin")) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!session.client_id) {
      return json({ error: "Session has no tenant" }, 403);
    }
    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Expected multipart/form-data with a CSV file" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "Missing CSV file field 'file'" }, 400);
    }
    const dryRun = String(form.get("dry_run") ?? "true").toLowerCase() !== "false";
    const clientId = session.client_id;

    let text: string;
    try {
      text = await file.text();
    } catch {
      return json({ error: "Could not read uploaded file as text" }, 400);
    }

    const table = parseCsv(text);
    if (table.length === 0) {
      return json({ error: "CSV file is empty" }, 400);
    }

    const headers = table[0].map(normKey);
    const requiredCols = ["item_type", "price_per_sqft"];
    const missing = requiredCols.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return json({ error: `CSV header missing required column(s): ${missing.join(", ")}` }, 400);
    }

    const errors: { row: number; message: string }[] = [];
    const validRows = new Map<string, { rowNumber: number; data: ParsedRow }>();
    let totalDataRows = 0;

    for (let r = 1; r < Math.min(table.length, MAX_ROWS + 1); r++) {
      const line = table[r];
      totalDataRows = r;
      const cells: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        if (headers[c]) cells[headers[c]] = line[c] ?? "";
      }
      if (Object.values(cells).every((v) => !String(v).trim())) continue;
      try {
        const result = validateRow(cells);
        if (result.error || !result.row) {
          errors.push({ row: r + 1, message: result.error ?? "Unknown validation failure" });
          continue;
        }
        const key = businessKey(result.row.item_type, result.row.glass_spec, result.row.mesh_type, result.row.hardware_tier);
        validRows.set(key, { rowNumber: r + 1, data: result.row });
      } catch (e: unknown) {
        errors.push({ row: r + 1, message: `Unexpected parse failure: ${String((e as Error)?.message ?? e)}` });
      }
    }

    if (table.length > MAX_ROWS + 1) {
      errors.push({
        row: MAX_ROWS + 2,
        message: `File exceeds the ${MAX_ROWS}-row import limit; remaining rows ignored`,
      });
    }

    if (dryRun) {
      return json({
        dry_run: true,
        total_rows: totalDataRows,
        valid_rows: validRows.size,
        duplicate_rows_collapsed: totalDataRows - errors.length - validRows.size,
        error_count: errors.length,
        errors,
        preview: Array.from(validRows.values()).slice(0, PREVIEW_LIMIT).map((v) => ({ csv_row: v.rowNumber, ...v.data })),
      });
    }

    const existing = await supaGet("rate_card_items", {
      client_id: `eq.${clientId}`,
      select: "id,item_type,glass_spec,mesh_type,hardware_tier",
    });

    const existingByKey = new Map<string, string>();
    for (const row of Array.isArray(existing) ? existing : []) {
      existingByKey.set(businessKey(row.item_type, row.glass_spec ?? null, row.mesh_type ?? null, row.hardware_tier ?? null), String(row.id));
    }

    const toInsert: ParsedRow[] = [];
    const toUpdate: ParsedRow[] = [];
    for (const { data } of validRows.values()) {
      const key = businessKey(data.item_type, data.glass_spec, data.mesh_type, data.hardware_tier);
      if (existingByKey.has(key)) {
        toUpdate.push(data);
      } else {
        toInsert.push({ ...data, item_type: data.item_type, client_id: clientId } as ParsedRow & { client_id: string });
      }
    }

    let inserted = 0;
    let updated = 0;
    try {
      if (toUpdate.length > 0) {
        const idByKey = new Map(toUpdate.map((data) => {
          const key = businessKey(data.item_type, data.glass_spec, data.mesh_type, data.hardware_tier);
          return [key, existingByKey.get(key) as string] as const;
        }));
        for (const data of toUpdate) {
          const key = businessKey(data.item_type, data.glass_spec, data.mesh_type, data.hardware_tier);
          await supaPatch("rate_card_items", { id: `eq.${idByKey.get(key)}` }, {
            price_per_sqft: data.price_per_sqft,
            min_width_mm: data.min_width_mm,
            max_width_mm: data.max_width_mm,
            min_height_mm: data.min_height_mm,
            max_height_mm: data.max_height_mm,
            validity_start: data.validity_start,
            validity_end: data.validity_end,
            is_active: data.is_active,
          });
          updated++;
        }
      }
      if (toInsert.length > 0) {
        const insertedRows = await supaPost(
          "rate_card_items",
          toInsert as unknown as Record<string, unknown>,
        );
        inserted = Array.isArray(insertedRows) ? insertedRows.length : toInsert.length;
      }
    } catch (e: unknown) {
      return json({
        dry_run: false,
        error: `Import partially failed: ${String((e as Error)?.message ?? e)}`,
        inserted,
        updated,
        skipped_errors: errors.length,
      }, 500);
    }

    return json({
      dry_run: false,
      inserted,
      updated,
      skipped_errors: errors.length,
      errors,
    });
  } catch (e: unknown) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
