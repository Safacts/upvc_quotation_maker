import { escapeHtml } from "./mail";

// Vitharn transactional email design system — inspired by the /upvc/login page.
//
// Design tokens mirror app/login/login.css:
//   rust #C44A10 | rust-dark #9B3A0C | orange #E06A1E | ink #1A0A00
//   paper #FFFBF6 | paper-warm #FFF3E6 | body #3D1F08 | muted #7A5030
// Dark brand header panel with logo + wordmark (like .login-brand), pill CTA
// buttons (like the Login button), ✓ chips (like .login-brand-features).
//
// EMAIL-CLIENT RULES (do not violate):
// - Gmail strips <style> blocks → every style is a literal inline attribute.
// - Outlook (Word engine) ignores background-image gradients → every colored
//   block ALSO carries bgcolor/background fallback hex.
// - Layout uses nested <table role="presentation"> so it survives Word.
// - Logo is an absolute URL to the live site; no CID embedding.

export const EMAIL_TOKENS = {
  rust: "#C44A10",
  rustDark: "#9B3A0C",
  orange: "#E06A1E",
  ink: "#1A0A00",
  inkPanel2: "#2D1100",
  paper: "#FFFBF6",
  paperWarm: "#FFF3E6",
  textBody: "#3D1F08",
  textMuted: "#7A5030",
  lineSoft: "#EADFD3",
  lineMid: "#E2D3C4",
  onDarkSoft: "#9A8B7E",
  onDarkText: "#D1CAC5",
  font: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
  logoUrl: "https://app.vitharn.com/logo.png",
  site: "https://app.vitharn.com",
} as const;

export type EmailFactRow = [string, string];

function footer(): string {
  const t = EMAIL_TOKENS;
  return `
    <tr>
      <td style="padding:22px 36px 26px 36px;background:${t.paperWarm};border-top:1px solid ${t.lineSoft};font-family:${t.font};text-align:center;">
        <div style="color:${t.textBody};font-size:12.5px;font-weight:700;letter-spacing:0.02em;">
          Vitharn ERP Services &nbsp;|&nbsp;
          <a href="mailto:vitarn.dev@gmail.com" style="color:${t.rust};text-decoration:none;">vitarn.dev@gmail.com</a>
          &nbsp;|&nbsp;
          <a href="${t.site}" style="color:${t.rust};text-decoration:none;">app.vitharn.com</a>
        </div>
        <div style="color:${t.textMuted};font-size:11px;line-height:1.6;margin-top:8px;">
          You are receiving this email because you are a registered client of Vitharn ERP Services.<br/>
          <a href="${process.env.VITHARN_UNSUBSCRIBE_URL || `${t.site}/unsubscribe`}" style="color:${t.textMuted};text-decoration:underline;">Unsubscribe</a> from non-transactional emails at any time.
        </div>
      </td>
    </tr>`;
}

/**
 * Full branded shell. Dark brand panel (logo + wordmark + eyebrow) up top,
 * white content card in the middle, warm footer at the bottom.
 */
export function emailShell(opts: {
  /** Small uppercase kicker above the heading, e.g. "SECURITY CODE". */
  eyebrow?: string;
  heading: string;
  body: string;
  preheader?: string;
}): string {
  const t = EMAIL_TOKENS;
  const { eyebrow, heading, body, preheader } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${t.paper};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-family:${t.font};">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.paper}" style="background:${t.paper};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${t.lineSoft};box-shadow:0 24px 60px rgba(26,10,0,0.10);">
          <tr>
            <td bgcolor="${t.ink}" background="linear-gradient(150deg,#1A0A00 0%,#2D1100 50%,#1A0A00 100%)" style="background-color:${t.ink};background-image:radial-gradient(circle,rgba(196,74,16,0.25) 1px,transparent 1px);background-size:20px 20px;padding:26px 36px;font-family:${t.font};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="56" valign="middle" style="width:56px;">
                    <img src="${t.logoUrl}" width="42" height="42" alt="Vitharn" style="display:block;width:42px;height:42px;border-radius:10px;border:1px solid rgba(255,251,246,0.18);"/>
                  </td>
                  <td valign="middle" style="padding-left:14px;">
                    <div style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:-0.4px;line-height:1.2;">
                      Vitharn <span style="color:${t.orange};">ERP</span> Services
                    </div>
                    <div style="font-size:11.5px;color:${t.onDarkSoft};margin-top:3px;letter-spacing:0.03em;">
                      Quotation &amp; ERP software for UPVC fabricators
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 36px 8px 36px;font-family:${t.font};">
              ${eyebrow ? `<div style="font-size:11px;font-weight:700;color:${t.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${escapeHtml(eyebrow)}</div>` : ""}
              <h2 style="color:${t.ink};font-size:23px;font-weight:800;letter-spacing:-0.03em;line-height:1.25;margin:0 0 16px 0;">${heading}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 30px 36px;font-family:${t.font};">
              ${body}
            </td>
          </tr>
          ${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Body paragraph — text is escaped automatically. */
export function ep(text: string): string {
  const t = EMAIL_TOKENS;
  return `<p style="color:${t.textBody};font-size:15px;line-height:1.65;margin:0 0 14px 0;">${escapeHtml(text)}</p>`;
}

/** Body paragraph with inline HTML allowed (for <strong>, links...). */
export function epHtml(html: string): string {
  const t = EMAIL_TOKENS;
  return `<p style="color:${t.textBody};font-size:15px;line-height:1.65;margin:0 0 14px 0;">${html}</p>`;
}

/** Rust pill CTA button — mirrors the Login button on /login. */
export function ebutton(label: string, href: string): string {
  const t = EMAIL_TOKENS;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto;"><tr>
    <td bgcolor="${t.rust}" style="border-radius:999px;box-shadow:0 8px 24px rgba(196,74,16,0.30);">
      <a href="${href}" style="display:inline-block;padding:14px 34px;background:${t.rust};border-radius:999px;color:#ffffff;font-family:${t.font};font-size:15px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

/** Warm fact card — mirrors the login inputs (paper bg, soft border). */
export function efactBox(rows: EmailFactRow[]): string {
  const t = EMAIL_TOKENS;
  const body = rows
    .filter(([, v]) => v !== "" && v != null)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:7px 0;color:${t.textMuted};font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;padding-right:18px;">${escapeHtml(k)}</td>
        <td style="padding:7px 0;color:${t.ink};font-size:13.5px;font-weight:700;text-align:right;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join("");
  if (!body) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.paper};border:1px solid ${t.lineMid};border-radius:12px;padding:14px 20px;margin:20px 0;"><tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${t.font};">${body}</table>
  </td></tr></table>`;
}

/** Left-rust-border callout — mirrors the login error box styling. */
export function ecallout(title: string, text: string): string {
  const t = EMAIL_TOKENS;
  return `<div style="background:${t.paperWarm};border-left:4px solid ${t.rust};border-radius:0 10px 10px 0;padding:14px 18px;margin:20px 0;font-family:${t.font};">
    <div style="color:${t.ink};font-size:13.5px;font-weight:700;">${escapeHtml(title)}</div>
    <div style="color:${t.textBody};font-size:13.5px;margin-top:5px;line-height:1.55;">${escapeHtml(text)}</div>
  </div>`;
}

/** ✓ chip checklist — mirrors .login-brand-features from the login page. */
export function echecklist(items: string[]): string {
  const t = EMAIL_TOKENS;
  const rows = items
    .map(
      (item) => `<tr>
        <td width="28" valign="top" style="width:28px;padding:4px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="20" height="20" bgcolor="${t.rust}" align="center" valign="middle" style="width:20px;height:20px;background:${t.rust};border-radius:6px;color:#ffffff;font-size:11px;font-weight:800;font-family:${t.font};text-align:center;">&#10003;</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:4px 0;color:${t.textBody};font-size:13.5px;font-weight:600;line-height:1.5;font-family:${t.font};">${escapeHtml(item)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">${rows}</table>`;
}
