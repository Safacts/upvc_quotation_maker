import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaDelete, supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "site-photos";
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

async function ownerFor(id: string) {
  const rows = await supaGet("quotations", {
    id: `eq.${id}`,
    select: "id,client_id",
    limit: 1,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function storageRequest(path: string, init: RequestInit) {
  const base = process.env.SUPABASE_URL || "https://gumpmnbjdtzajhysnnaz.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Storage request failed (${res.status})`);
  return res;
}

function publicUrl(path: string) {
  const base = process.env.SUPABASE_URL || "https://gumpmnbjdtzajhysnnaz.supabase.co";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function authorized(request: NextRequest, id: string) {
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return { error: gate.error } as const;
  const owner = await ownerFor(id);
  if (!owner || (!gate.isAdmin && owner.client_id !== gate.clientId)) {
    return { error: consoleJson({ error: "Not found" }, 404) } as const;
  }
  return { gate, owner } as const;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorized(request, id);
    if ("error" in auth) return auth.error;
    const rows = await supaGet("quotation_photos", {
      quotation_id: `eq.${id}`,
      client_id: `eq.${auth.owner.client_id}`,
      select: "id,quotation_id,storage_path,public_url,caption,width,height,bytes,filename,mime_type,sort_order,created_at",
      order: "sort_order.asc,created_at.desc",
      limit: 100,
    });
    return consoleJson({ photos: Array.isArray(rows) ? rows : [] });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message || e) }, 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorized(request, id);
    if ("error" in auth) return auth.error;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return consoleJson({ error: "Choose an image first" }, 400);
    if (!MIME_TYPES.has(file.type)) return consoleJson({ error: "Only JPG, PNG, WebP, or HEIC images are supported" }, 400);
    if (file.size <= 0 || file.size > MAX_BYTES) return consoleJson({ error: "Images must be smaller than 10 MB" }, 400);

    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const safeClient = String(auth.owner.client_id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${safeClient}/${id}/${crypto.randomUUID()}.${ext}`;
    await storageRequest(path, {
      method: "POST",
      headers: { "Content-Type": file.type, "x-upsert": "false" },
      body: new Uint8Array(await file.arrayBuffer()),
    });

    try {
      const rows = await supaPost("quotation_photos", {
        client_id: auth.owner.client_id,
        quotation_id: id,
        storage_path: path,
        public_url: publicUrl(path),
        caption: String(form.get("caption") || "").slice(0, 200),
        bytes: file.size,
        filename: file.name.slice(0, 255),
        mime_type: file.type,
      });
      return consoleJson({ photo: Array.isArray(rows) ? rows[0] : rows }, 201);
    } catch (e) {
      await storageRequest(path, { method: "DELETE" }).catch(() => undefined);
      throw e;
    }
  } catch (e: any) {
    return consoleJson({ error: String(e?.message || e) }, 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorized(request, id);
    if ("error" in auth) return auth.error;
    const photoId = new URL(request.url).searchParams.get("photoId");
    if (!photoId) return consoleJson({ error: "photoId is required" }, 400);
    const rows = await supaGet("quotation_photos", {
      id: `eq.${photoId}`,
      quotation_id: `eq.${id}`,
      client_id: `eq.${auth.owner.client_id}`,
      select: "id,storage_path",
      limit: 1,
    });
    if (!Array.isArray(rows) || !rows.length) return consoleJson({ error: "Not found" }, 404);
    await storageRequest(rows[0].storage_path, { method: "DELETE" }).catch(() => undefined);
    await supaDelete("quotation_photos", {
      id: `eq.${photoId}`,
      quotation_id: `eq.${id}`,
      client_id: `eq.${auth.owner.client_id}`,
    });
    return consoleJson({ ok: true });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message || e) }, 500);
  }
}
