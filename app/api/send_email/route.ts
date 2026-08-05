import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_BODY = 4_000_000;
const MAX_ATTACH = 3_500_000;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return json({ error: "Payload too large" }, 413);
    }
    const body = raw ? JSON.parse(raw) : {};

    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "");

    if (!to || !to.includes("@") || to.length > 320) {
      return json({ error: "Invalid recipient" }, 400);
    }
    if (!subject || subject.length > 500) {
      return json({ error: "Invalid subject" }, 400);
    }
    if (!html || html.length > 200000) {
      return json({ error: "Invalid body" }, 400);
    }

    const attachments: Array<{ filename?: string; content: Buffer; cid?: string }> = [];
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachments.length > 3) {
      return json({ error: "Too many attachments" }, 400);
    }
    for (const a of rawAttachments) {
      const b64 = String(a?.content ?? "");
      if (!b64 || b64.length > MAX_ATTACH) {
        return json({ error: "Invalid attachment" }, 400);
      }
      attachments.push({
        filename: a.filename ? String(a.filename).slice(0, 255) : undefined,
        cid: a.cid ? String(a.cid).slice(0, 255) : undefined,
        content: Buffer.from(b64, "base64"),
      });
    }

    await sendMail({ to, subject, html, attachments });
    return json({ success: true }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
