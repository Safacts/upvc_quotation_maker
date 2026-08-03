import { NextRequest, NextResponse } from "next/server";
import { supaGet, supaPatch, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    const clientId = session.client_id;
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON" }, 400);
    }

    // Fetch existing client
    const rows = await supaGet("clients", {
      id: "eq." + clientId,
      select: "config",
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "Client not found" }, 404);
    }

    const currentConfig = rows[0].config || {};
    
    const allowedFields = [
      "companyName", "companyProprietor", "companyContact", "companyEmail", 
      "companyAddress", "gstNumber", "defaultGstPercentage", "cost_margin_percent",
      "enablePricePresets", "pricePresets", "measuredPresets", "unmeasuredPresets"
    ];

    let hasChanges = false;
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        if (key === "cost_margin_percent" || key === "defaultGstPercentage") {
           currentConfig[key] = parseFloat(body[key]);
        } else {
           currentConfig[key] = body[key];
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return json({ success: true, message: "No changes made" });
    }

    // Update the clients table
    await supaPatch("clients", { id: "eq." + clientId }, { config: currentConfig });

    return json({ success: true, config: currentConfig });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
