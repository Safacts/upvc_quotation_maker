import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const host = (process.env.SMTP_HOST || "smtp-relay.brevo.com").trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = (process.env.SMTP_FROM || "").trim();

  if (!user || !pass) {
    return NextResponse.json(
      { ok: false, error: "SMTP credentials not configured" },
      { status: 503 },
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: user, pass: pass },
      timeout: 30000,
      connectionTimeout: 30000,
    } as any);

    // Verify connection and credentials
    await transporter.verify();

    // Send a test email
    const info = await transporter.sendMail({
      from: `Vitharn ERP Services <${from}>`,
      to: "kongaaadisheshu@gmail.com",
      subject: "Vitharn SMTP Test — Brevo Relay OK",
      html: `<p>If you can read this, the Brevo relay is correctly configured.</p><p>Sent at ${new Date().toISOString()}</p>`,
      replyTo: from,
    });

    return NextResponse.json({
      ok: true,
      message: "SMTP credentials valid — test email sent",
      messageId: info.messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
