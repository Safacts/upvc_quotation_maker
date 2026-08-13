import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaCount } from "@/lib/supabase";
import { MAX_PAGE_SIZE } from "@/lib/console-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RENDER_SELECT =
  "id,design_id,render_type,url,width,height,render_time_ms,status,error_message,created_at";

const DESIGN_SELECT = "id,name,profile_type,thumbnail_url";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "").trim();
    const designId = (url.searchParams.get("design_id") || "").trim();
    const page = Math.max(
      1,
      Math.floor(Number(url.searchParams.get("page")) || 1),
    );
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string> = {
      client_id: "eq." + clientId,
    };
    if (status) filters.status = "eq." + status;
    if (designId) filters.design_id = "eq." + designId;

    const totalCount = await supaCount("renders", { ...filters });
    const rows = await supaGet("renders", {
      ...filters,
      select: RENDER_SELECT,
      order: "created_at.desc,id.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const renders = Array.isArray(rows) ? rows : [];

    const designIds = [
      ...new Set(renders.map((r: any) => r.design_id).filter(Boolean)),
    ];
    let designMap: Record<string, any> = {};
    if (designIds.length) {
      const designs = await supaGet("window_designs", {
        id: "in.(" + designIds.join(",") + ")",
        client_id: "eq." + clientId,
        select: DESIGN_SELECT,
      });
      if (Array.isArray(designs)) {
        designMap = Object.fromEntries(designs.map((d: any) => [d.id, d]));
      }
    }

    const list = renders.map((r: any) => ({
      ...r,
      design: designMap[r.design_id] || null,
    }));

    return consoleJson({
      rows: list,
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : list.length,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
    });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
