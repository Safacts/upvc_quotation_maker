import Link from "next/link";

export default function PrivacyPage() {
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
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.subtitle}>Last updated: 3 August 2026</p>
        </div>

        <section style={styles.body}>
          <p>
            Vitharn (<q>we</q>, <q>us</q>, or <q>our</q>) operates the Vitharn UPVC Quotation Maker
            platform (the <q>Service</q>). This Privacy Policy explains what information we collect,
            how we use it, and the choices you have.
          </p>

          <h2 style={styles.h2}>1. Information We Collect</h2>
          <p>
            <strong>Account information:</strong> When you register or log in, we collect your name,
            email address, and password (stored as a secure hash). When you sign in with Google,
            we receive your Google account email address and basic profile information from Google.
          </p>
          <p>
            <strong>Business information:</strong> Businesses using the platform provide company name,
            logo, contact details, GST number, bank details, product catalogues, and pricing
            information to operate their branded portal.
          </p>
          <p>
            <strong>Quotation data:</strong> Products, measurements, pricing, customer details, and
            generated quotations are stored on our servers to provide the quoting service.
          </p>
          <p>
            <strong>Usage data:</strong> We may collect basic technical information such as browser
            type, device type, and pages visited to improve the Service.
          </p>

          <h2 style={styles.h2}>2. How We Use Information</h2>
          <p>We use the information we collect to:</p>
          <ul style={styles.ul}>
            <li>Provide, maintain, and secure the Service;</li>
            <li>Authenticate users and protect accounts;</li>
            <li>Generate and deliver quotations and PDF documents;</li>
            <li>Communicate service updates and respond to support requests;</li>
            <li>Detect and prevent fraud or abuse.</li>
          </ul>

          <h2 style={styles.h2}>3. Google Sign-In</h2>
          <p>
            When you sign in with Google, Google may share your email address and profile information
            with us. We use this information <strong>only</strong> to identify registered users and
            grant access to the appropriate portal. We do not access your Gmail, Google Drive,
            YouTube, or any other Google service. We do not share your Google data with anyone.
          </p>

          <h2 style={styles.h2}>4. Data Sharing</h2>
          <p>
            We do not sell your personal data. We share data only: (a) with service providers that
            help operate the Service (such as hosting and email delivery providers), (b) with the
            business whose portal you are using, to the extent needed to deliver quotations, or
            (c) when required by law.
          </p>

          <h2 style={styles.h2}>5. Data Security</h2>
          <p>
            Passwords are stored as one-way hashes. We use HTTPS encryption in transit and restrict
            access to personal data to authorised staff. No method of transmission or storage is
            100% secure, but we work hard to protect your information.
          </p>

          <h2 style={styles.h2}>6. Data Retention</h2>
          <p>
            We retain account and quotation data for as long as your account is active, or as needed
            to provide the Service. You may request deletion of your data by contacting us.
          </p>

          <h2 style={styles.h2}>7. Your Rights</h2>
          <p>
            You may access, correct, export, or delete the personal data we hold about you. To
            exercise these rights, contact us at the address below.
          </p>

          <h2 style={styles.h2}>8. Children</h2>
          <p>
            The Service is not directed at children under 13, and we do not knowingly collect their
            personal information.
          </p>

          <h2 style={styles.h2}>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post any changes on this
            page and update the &quot;Last updated&quot; date above.
          </p>

          <h2 style={styles.h2}>10. Contact Us</h2>
          <p>
            For privacy questions or requests, contact us at{" "}
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
