import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSession } from "@/lib/session";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

async function getSearchConsole() {
  if (!SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set");
  }

  const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });

  return google.searchconsole({ version: "v1", auth });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const searchconsole = await getSearchConsole();

    const siteUrl = "https://app.vitharn.com/";

    const response = await searchconsole.urlInspection.index.inspect({
      inspectionUrl: url,
      siteUrl: siteUrl,
    } as any);

    console.log(`[SEO] URL submitted for indexing: ${url}`, response.data);

    return NextResponse.json({
      success: true,
      message: "URL submitted for indexing",
      url: url,
      result: (response as any).data,
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
    message: "SEO Submit API - Use POST to submit URLs",
    example: {
      url: "https://app.vitharn.com/kprupvc/",
    },
  });
}
