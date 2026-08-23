import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const HEADER = [
  "item_type",
  "glass_spec",
  "mesh_type",
  "hardware_tier",
  "price_per_sqft",
  "min_width_mm",
  "max_width_mm",
  "min_height_mm",
  "max_height_mm",
  "validity_start",
  "validity_end",
  "is_active",
].join(",");

const SAMPLE_ROWS: string[][] = [
  ["sliding", "5mm clear", "", "basic", "420", "600", "1500", "900", "1800", "", "", "true"],
  ["sliding", "5mm clear", "", "standard", "450", "600", "1500", "900", "1800", "", "", "true"],
  ["sliding", "", "plain", "standard", "520", "1000", "2100", "1200", "2400", "", "", "true"],
  ["sliding", "", "magnetic", "premium", "620", "", "", "", "", "", "", "true"],
  ["casement", "5mm clear", "", "basic", "480", "600", "1200", "900", "2100", "", "", "true"],
  ["casement", "5mm clear", "", "standard", "520", "", "", "", "", "", "", "true"],
  ["french", "12mm toughened", "", "standard", "850", "", "", "", "", "", "", "true"],
  ["tilt_turn", "5mm clear", "none", "premium", "780", "", "", "", "", "", "", "true"],
  ["villa_grill", "", "plain", "basic", "380", "", "", "", "", "", "", "true"],
  ["arch", "5mm clear", "none", "standard", "700", "", "", "", "", "", "", "true"],
  ["fixed", "5mm clear", "none", "basic", "320", "", "", "", "", "", "", "true"],
  ["any", "", "", "", "500", "", "", "", "", "", "", "true"],
];

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "customer" && session.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const lines = [HEADER, ...SAMPLE_ROWS.map((r) => r.map(csvEscape).join(","))];
    const body = lines.join("\r\n") + "\r\n";

    return new NextResponse(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rate_card_template.csv"',
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: String((e as Error)?.message ?? e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
