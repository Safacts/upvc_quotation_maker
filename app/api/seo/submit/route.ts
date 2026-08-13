import { NextRequest, NextResponse } from "next/server";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const SITE_URL = "https://app.vitharn.com/";

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
      scope: "https://www.googleapis.com/auth/webmasters",
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
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
