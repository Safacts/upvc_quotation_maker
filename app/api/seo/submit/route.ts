import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const SITE_URL = "https://app.vitharn.com/";
const SITE_ORIGIN = "https://app.vitharn.com";
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestLog = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function takeRateLimit(request: NextRequest): boolean {
  const key = clientAddress(request);
  const now = Date.now();
  const current = requestLog.get(key);
  if (!current || current.resetAt <= now) {
    requestLog.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function validateInspectionUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== SITE_ORIGIN || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  if (!SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set");
  }

  const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
  const { client_email, private_key } = credentials;

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      exp: expiry,
      iat: now,
    })
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(`${header}.${payload}`);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, data);
  const jwt = `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function requestIndexing(url: string, accessToken: string): Promise<void> {
  const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Indexing API error: ${JSON.stringify(data)}`);
  }
  console.log(`[SEO] Indexing publish: ${url}`, data);
}

function pingSitemap(): void {
  fetch("https://www.google.com/ping?sitemap=https://app.vitharn.com/sitemap.xml", { method: "GET" }).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }
    if (!takeRateLimit(request)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const body = await request.json();
    const url = validateInspectionUrl(body?.url);

    if (!url) {
      return NextResponse.json({ error: "A valid app.vitharn.com HTTPS URL is required" }, { status: 400 });
    }

    const accessToken = await getAccessToken();

    const response = await fetch(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionUrl: url,
          siteUrl: SITE_URL,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[SEO] Google API error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Google API error", details: data },
        { status: response.status }
      );
    }

    const verdict = data.inspectionResult?.indexStatusResult?.verdict;
    console.log(`[SEO] URL inspected: ${url} — verdict: ${verdict}`);

    try {
      await requestIndexing(url, accessToken);
    } catch (e: any) {
      console.warn(`[SEO] Indexing publish failed for ${url}:`, e?.message || e);
    }

    pingSitemap();

    return NextResponse.json({
      success: true,
      url,
      verdict,
      result: data,
    });
  } catch (error: any) {
    console.error("[SEO] Error submitting URL:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to submit URL" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "SEO Submit API — POST { url } to request indexing",
  });
}
