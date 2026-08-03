import { NextRequest, NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/mail";

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
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};
    const recipient = payload.email;
    const otpCode = payload.otp;

    if (!recipient || !otpCode) {
      return json({ error: "Missing parameters" }, 400);
    }

    await sendOtpEmail(recipient, otpCode);
    return json({ success: true }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
