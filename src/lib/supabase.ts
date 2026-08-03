const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://effxrwrbsjduvhmorvrq.supabase.co";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

const AUTH_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

type QsValue = string | number | boolean;

function qv(v: QsValue): string {
  const s = String(v);
  if (s.includes(".")) {
    const i = s.indexOf(".");
    return s.slice(0, i) + "." + encodeURIComponent(s.slice(i + 1));
  }
  return s;
}

function buildUrl(path: string, qs: Record<string, QsValue>): string {
  const parts = Object.entries(qs).map(([k, v]) => `${k}=${qv(v)}`);
  return `${SUPABASE_URL}/rest/v1/${path}${parts.length ? "?" + parts.join("&") : ""}`;
}

async function parseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Supabase invalid JSON: ${e.message} body[:200]=${text.slice(0, 200)}`);
  }
}

export async function supaGet(
  path: string,
  qs: Record<string, QsValue> = {},
): Promise<any> {
  const res = await fetch(buildUrl(path, qs), { headers: AUTH_HEADERS });
  return parseResponse(res);
}

export async function supaPatch(
  path: string,
  qs: Record<string, QsValue>,
  body: Record<string, any>,
): Promise<any> {
  const res = await fetch(buildUrl(path, qs), {
    method: "PATCH",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function supaPost(
  path: string,
  body: Record<string, any>,
): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function uploadToStorage(
  filename: string,
  binary: Uint8Array,
  mime: string,
): Promise<string> {
  const buf = Buffer.from(binary);
  const url = `${SUPABASE_URL}/storage/v1/object/assets/${filename}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { ...AUTH_HEADERS, "Content-Type": mime },
    body: buf,
  });
  if (res.status === 409) {
    res = await fetch(url, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": mime },
      body: buf,
    });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage upload ${res.status}: ${body.slice(0, 300)}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/assets/${filename}`;
}

export function uploadLogoFile(
  clientId: string,
  logoFile: { mime?: string; data: string },
  sub = "",
): Promise<string> {
  const mime = logoFile.mime || "image/png";
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const ext = extMap[mime] || "png";
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const binary = Uint8Array.from(atob(logoFile.data), (c) => c.charCodeAt(0));
  const filename = sub
    ? `logos/${safe}-${sub}.${ext}`
    : `logos/${safe}.${ext}`;
  return uploadToStorage(filename, binary, mime);
}

export function isServiceKeyConfigured(): boolean {
  return !!SERVICE_ROLE_KEY;
}
