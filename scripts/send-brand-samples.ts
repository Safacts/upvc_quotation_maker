import { config } from "dotenv";
config({ path: ".env" });

import { emailShell, ep, epHtml, efactBox, ebutton, echecklist, ecallout } from "../src/lib/email-template";
import { sendMail } from "../src/lib/mail";

const TO = "kongaaadisheshu@gmail.com";

const samples: Array<{ file: string; subject: string; html: string }> = [
  {
    file: "sample-1-welcome.html",
    subject: "Welcome to Vitharn ERP — Your portal is ready",
    html: emailShell({
      eyebrow: "Welcome aboard",
      heading: "Your UPVC Quotation Portal is live",
      preheader: "Login details inside — start creating professional quotations today.",
      body:
        ep("Hi Aadi,") +
        epHtml(
          `Your <strong>Vitharn ERP</strong> account for <strong>Venkateshwara UPVC</strong> is now live. You can start creating pixel-perfect, GST-ready quotations and send them to customers as branded PDFs in seconds.`,
        ) +
        efactBox([
          ["Login Email", "jvenkateshupvc@gmail.com"],
          ["Temporary Password", "Demo@1234"],
          ["Free Trial Ends", "29-08-2026"],
        ]) +
        ebutton("Open Your Portal", "https://app.vitharn.com/login") +
        epHtml(`<span style="color:#7A5030;font-size:13px;">For your security, please change this temporary password after your first login. You can also sign in with Google using the same email address.</span>`) +
        `<p style="color:#3D1F08;font-size:14px;font-weight:700;margin:22px 0 8px 0;">Getting started in 3 steps:</p>` +
        echecklist([
          "Log in and add your company logo & details",
          "Set your product rates — our engine handles GST math",
          "Create your first quotation and send it as a branded PDF",
        ]) +
        epHtml(`Stuck anywhere? Just reply to this email — we usually respond the same day.<br/><br/>— Team Vitharn ERP Services`),
    }),
  },
  {
    file: "sample-2-otp.html",
    subject: "Your Password Reset Code — Vitharn ERP",
    html: emailShell({
      eyebrow: "Security code",
      heading: "Your password reset code",
      preheader: "This code expires in 15 minutes.",
      body:
        ep("Hi Aadi,") +
        ep("We received a request to reset the password for your Vitharn UPVC Quotation Maker account. Enter this code in the portal to continue:") +
        `<div style="background:#FFFBF6;border:1px solid #E2D3C4;border-radius:12px;padding:22px 20px;margin:24px 0;text-align:center;">
          <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:34px;font-weight:800;letter-spacing:10px;color:#1A0A00;">482913</div>
          <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11.5px;font-weight:700;color:#7A5030;text-transform:uppercase;letter-spacing:0.08em;margin-top:10px;">Expires in 15 minutes</div>
        </div>` +
        epHtml(`<span style="color:#7A5030;font-size:13.5px;">Didn't request this? You can safely ignore this email — your password stays unchanged.</span><br/><br/>— Team Vitharn ERP Services`),
    }),
  },
  {
    file: "sample-3-quotation.html",
    subject: "Quotation JVUPVC-22082026-0001 from Venkateshwara UPVC",
    html: emailShell({
      eyebrow: "Quotation",
      heading: "Your quotation is attached",
      preheader: "Quotation for Rs. 1,42,560.00 attached.",
      body:
        ep("Hi Ramesh,") +
        epHtml(
          `Please find attached quotation <strong>JVUPVC-22082026-0001</strong> from <strong>Venkateshwara UPVC Windows &amp; Doors</strong>. The PDF includes full measurements, glass specifications and transparent pricing.`,
        ) +
        efactBox([
          ["Quote No", "JVUPVC-22082026-0001"],
          ["Date", "22-08-2026"],
          ["Items", "6 windows · 142 sq.ft"],
          ["Total (incl. GST)", "Rs. 1,42,560.00"],
        ]) +
        ebutton("View Quotation Online", "https://app.vitharn.com/quote/demo") +
        epHtml(
          `Prefer paper? The PDF is attached. This quotation is valid for 15 days — reply to this email with any questions or to confirm your order.<br/><br/>— Team Vitharn ERP Services`,
        ),
    }),
  },
];

async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const outDir = process.env.TEMP + "\\opencode\\email-previews";
  fs.mkdirSync(outDir, { recursive: true });

  for (const s of samples) {
    fs.writeFileSync(path.join(outDir, s.file), s.html);
    console.log(`preview written: ${outDir}\\${s.file}`);
  }

  for (const s of samples) {
    try {
      await sendMail({
        to: TO,
        subject: "[SAMPLE] " + s.subject,
        html: s.html,
      });
      console.log(`SENT -> ${TO} : ${s.subject}`);
    } catch (e: any) {
      console.error(`FAILED ${s.subject}: ${String(e?.message ?? e)}`);
    }
  }
}

main();
