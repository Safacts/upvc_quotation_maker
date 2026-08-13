import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const SITE_URL = "https://app.vitharn.com/";

async function getAuth() {
  if (!SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set");
  }
  const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const auth = await getAuth();
    const accessToken = await auth.getAccessToken();

    const response = await fetch(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
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
