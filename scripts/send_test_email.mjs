import nodemailer from 'nodemailer';

async function sendTestEmail() {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: 'b4c47f001@smtp-brevo.com',
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.verify();
    console.log('SMTP connection verified ✅');

    const info = await transporter.sendMail({
      from: 'Vitharn ERP Services <vitarn.dev@gmail.com>',
      to: 'kongaaadisheshu@gmail.com',
      subject: 'Vitharn ERP Services — Test Email ✅',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: #EA580C; padding: 20px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Vitharn ERP Services</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e3a5f; margin-top: 0;">Email System Live ✅</h2>
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">
              This confirms that Vitharn ERP Services email system is fully operational.
            </p>
            <p style="color: #334155; font-size: 16px; line-height: 1.6;">
              <strong>From:</strong> vitarn.dev@gmail.com<br>
              <strong>Provider:</strong> Brevo SMTP<br>
              <strong>Date:</strong> 07-Aug-2026
            </p>
            <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <p style="color: #166534; margin: 0; font-size: 14px;">
                ✅ All systems operational. Ready to send invoices and onboarding emails.
              </p>
            </div>
          </div>
          <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 20px;">
            © 2026 Vitharn ERP Services | vitarn.dev@gmail.com
          </p>
        </div>
      `,
    });

    console.log('Email sent ✅');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'EAUTH') {
      console.error('SMTP Authentication failed — check credentials');
    }
  }
}

sendTestEmail();
