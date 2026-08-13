import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { z } from "zod";
import { formatZodError } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIGURABLE_TYPES = ["sliding", "casement", "tilt_turn", "fixed"] as const;
const PROFILE_CODE = "3925-60x45";
const MIN_PANEL_WIDTH = 600;
const MAX_PANEL_WIDTH = 1000;

const configuratorSchema = z.object({
  width_mm: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v): number | null => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((n): n is number => n !== null && n > 0, {
      message: "width_mm must be a positive number",
    }),
  height_mm: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v): number | null => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((n): n is number => n !== null && n > 0, {
      message: "height_mm must be a positive number",
    }),
  type: z.enum(CONFIGURABLE_TYPES).default("fixed"),
  profile_type: z.enum(["uPVC", "aluminum"]).default("uPVC"),
  name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    })
    .optional(),
});

function computePanelCount(width: number, configType: string): number {
  if (configType === "sliding") {
    const count = Math.ceil(width / MAX_PANEL_WIDTH);
    return Math.min(4, Math.max(2, count));
  }
  if (configType === "casement") {
    if (width <= MAX_PANEL_WIDTH) return 1;
    if (width <= 2200) return 2;
    return 3;
  }
  return 1;
}

function generatePanels(width: number, height: number, configType: string): any[] {
  const panelCount = computePanelCount(width, configType);
  const panels: any[] = [];
  let consumed = 0;

  for (let i = 0; i < panelCount; i++) {
    const remaining = width - consumed;
    const isLast = i === panelCount - 1;
    let pw = isLast ? remaining : Math.floor(width / panelCount);

    let ptype: string;
    if (configType === "sliding") {
      ptype = i === 0 ? "opening" : "fixed";
    } else if (configType === "fixed") {
      ptype = "fixed";
    } else {
      ptype = "opening";
    }

    panels.push({
      width: pw,
      height: height,
      type: ptype,
      material: "glass",
    });
    consumed += pw;
  }
  return panels;
}

function generateFrames(width: number, height: number, configType: string, panels: any[]): any[] {
  const perimeter = 2 * (width + height);
  const frames: any[] = [];

  const mullions: any[] = [];
  if (panels.length > 1) {
    for (let i = 1; i < panels.length; i++) {
      mullions.push({
        profile: PROFILE_CODE,
        length_mm: height,
        position_mm: panels.slice(0, i).reduce((sum, p) => sum + p.width, 0),
      });
    }
  }

  const transoms: any[] = [];
  if (height > 1500 && configType === "fixed") {
    transoms.push({
      profile: PROFILE_CODE,
      length_mm: width,
      position_mm: height / 2,
    });
  }

  frames.push({
    profile: PROFILE_CODE,
    length_mm: perimeter,
    mullions,
    transoms,
  });

  return frames;
}

function buildDesignName(width: number, height: number, configType: string): string {
  const label = configType === "tilt_turn" ? "Tilt Turn" : configType.charAt(0).toUpperCase() + configType.slice(1);
  return `${label} Window ${width}x${height}`;
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleError("Invalid JSON", 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = configuratorSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const width = data.width_mm;
    const height = data.height_mm;
    const configType = data.type;

    const panels = generatePanels(width, height, configType);
    const frames = generateFrames(width, height, configType, panels);

    const design = {
      frames,
      panels,
    };

    const name = data.name || buildDesignName(width, height, configType);

    const result = {
      name,
      profile_type: data.profile_type,
      dimensions: {
        width_mm: width,
        height_mm: height,
        configuration: configType,
      },
      design,
      client_id: clientId,
    };

    return consoleJson({ design: result }, 200);
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
