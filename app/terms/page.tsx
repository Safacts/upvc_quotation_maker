import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={styles.wrap}>
      {/* Header nav bar */}
      <nav style={styles.nav}>
        <Link href="/upvc" style={styles.brand}>
          <img src="/logo.png" alt="Vitharn UPVC" style={styles.brandLogo} />
          <span style={styles.brandText}>
            Vitharn <span style={styles.brandAccent}>UPVC</span>
          </span>
        </Link>
        <Link href="/upvc" style={styles.backLink}>← Back to Home</Link>
      </nav>

      <div style={styles.card}>
        {/* Page header */}
        <div style={styles.pageHeader}>
          <div style={styles.pagePill}>Legal</div>
          <h1 style={styles.title}>Terms of Service</h1>
          <p style={styles.subtitle}>Last updated: 3 August 2026</p>
        </div>

        <section style={styles.body}>
          <p>
            These Terms of Service (<q>Terms</q>) govern your access to and use of the Vitharn UPVC
            Quotation Maker platform (the <q>Service</q>), operated by Vitharn ERP Services. By
            creating an account or using the Service, you agree to these Terms.
          </p>

          <h2 style={styles.h2}>1. Eligibility</h2>
          <p>
            You must be at least 18 years old and capable of entering into a binding agreement to
            use the Service.
          </p>

          <h2 style={styles.h2}>2. Accounts</h2>
          <p>
            You are responsible for safeguarding your login credentials and for all activity that
            occurs under your account. Notify us immediately of any unauthorised use.
          </p>

          <h2 style={styles.h2}>3. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul style={styles.ul}>
            <li>Use the Service for any unlawful purpose;</li>
            <li>Attempt to access another user&apos;s account or data;</li>
            <li>Disrupt, overload, or attempt to gain unauthorised access to the Service;</li>
            <li>Reverse engineer, decompile, or copy the Service&apos;s underlying software;</li>
            <li>Upload malicious code or content that infringes others&apos; rights.</li>
          </ul>

          <h2 style={styles.h2}>4. Business Portals</h2>
          <p>
            Businesses are responsible for the accuracy of the information, products, and pricing
            they publish on their branded portal and for quotations generated through their account.
          </p>

          <h2 style={styles.h2}>5. Intellectual Property</h2>
          <p>
            The Service, its code, design, and branding belong to Vitharn ERP Services. Your
            business content remains yours. Nothing in these Terms grants you rights to our
            trademarks or software beyond the limited right to use the Service.
          </p>

          <h2 style={styles.h2}>6. No Warranty</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot;, without
            warranties of any kind, express or implied. We do not guarantee that the Service will
            be uninterrupted or error-free.
          </p>

          <h2 style={styles.h2}>7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Vitharn ERP Services shall not be liable for
            any indirect, incidental, special, or consequential damages, or for any loss of data or
            profits, arising from your use of the Service.
          </p>

          <h2 style={styles.h2}>8. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without
            notice, for violating these Terms or for any other reason. You may stop using the
            Service at any time.
          </p>

          <h2 style={styles.h2}>9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes
            are posted constitutes acceptance of the updated Terms.
          </p>

          <h2 style={styles.h2}>10. No Payment Processing or Financial Liability</h2>
          <p>
            Vitharn ERP Services purely provides software tools (including quotation generation and UPI QR code display). We are not a payment processor, payment gateway, or financial intermediary. We do not handle, collect, or process any funds on behalf of businesses or their customers. Any financial transactions occur directly between the business and their end customer. We accept no liability for payment disputes, failure of delivery, fraud, or tax compliance arising from transactions facilitated by quotations generated on our platform.
          </p>

          <h2 style={styles.h2}>11. Governing Law</h2>
          <p>
            These Terms are governed by the laws of India. Any disputes shall be subject to the
            exclusive jurisdiction of the courts of Hyderabad, Telangana.
          </p>

          <h2 style={styles.h2}>12. Contact Us</h2>
          <p>
            Questions about these Terms may be sent to{" "}
            <a href="mailto:vitarn.dev@gmail.com" style={styles.link}>vitarn.dev@gmail.com</a>.
          </p>
        </section>

        <footer style={styles.footer}>
          <span>© 2026 Vitharn ERP Services — Sole Proprietorship, Hyderabad.</span>
          <span>
            <Link href="/privacy" style={styles.footerLink}>Privacy</Link>
            {" · "}
            <Link href="/terms" style={styles.footerLink}>Terms</Link>
            {" · "}
            <Link href="/upvc" style={styles.footerLink}>Back to Home</Link>
          </span>
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    background: "#FFFBF6",
    backgroundImage:
      "linear-gradient(to right, rgba(196,74,16,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(196,74,16,0.04) 1px, transparent 1px)",
    backgroundSize: "32px 32px",
    padding: "0 20px 60px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    WebkitFontSmoothing: "antialiased",
  },
  nav: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "24px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#1A0A00",
  },
  brandLogo: {
    width: 36,
    height: 36,
    objectFit: "contain" as const,
    borderRadius: 9,
    background: "white",
    padding: 3,
    boxShadow: "0 2px 8px rgba(26,10,0,0.10)",
  },
  brandText: {
    fontSize: 16,
    fontWeight: 800,
    color: "#1A0A00",
    letterSpacing: "-0.4px",
  },
  brandAccent: {
    color: "#C44A10",
  },
  backLink: {
    fontSize: 13,
    fontWeight: 600,
    color: "#7A5030",
    textDecoration: "none",
  },
  card: {
    maxWidth: 860,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 4px 32px rgba(26,10,0,0.07)",
    overflow: "hidden",
    border: "1px solid rgba(42,19,5,0.08)",
  },
  pageHeader: {
    padding: "40px 52px 32px",
    borderBottom: "1px solid rgba(42,19,5,0.08)",
    background: "linear-gradient(150deg, #FFF8F3 0%, #FFFFFF 100%)",
  },
  pagePill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#C44A10",
    background: "rgba(196,74,16,0.08)",
    borderRadius: 999,
    border: "1px solid rgba(196,74,16,0.18)",
    marginBottom: 16,
  },
  title: {
    margin: "0 0 8px",
    fontSize: 32,
    fontWeight: 900,
    color: "#1A0A00",
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },
  subtitle: {
    margin: 0,
    color: "#7A5030",
    fontSize: 14,
  },
  body: {
    padding: "32px 52px 48px",
    color: "#3D1F08",
    fontSize: 15,
    lineHeight: 1.75,
  },
  h2: {
    margin: "32px 0 10px",
    fontSize: 18,
    fontWeight: 800,
    color: "#1A0A00",
    letterSpacing: "-0.02em",
    paddingTop: 8,
    borderTop: "1px solid rgba(42,19,5,0.06)",
  },
  ul: {
    margin: "10px 0 16px",
    paddingLeft: 22,
    color: "#3D1F08",
  },
  link: {
    color: "#C44A10",
    textDecoration: "none",
    fontWeight: 500,
  },
  footer: {
    padding: "18px 52px",
    borderTop: "1px solid rgba(42,19,5,0.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap" as const,
    fontSize: 13,
    color: "#7A5030",
    background: "#FFF3E6",
  },
  footerLink: {
    color: "#C44A10",
    textDecoration: "none",
    fontWeight: 500,
  },
};
