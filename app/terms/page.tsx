import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <header style={styles.header}>
          <Link href="/" style={styles.brand}>
            <img
              src="/logo.png"
              onError={(e) => {
                e.currentTarget.src = "https://placehold.co/100";
              }}
              alt="Vitharn UPVC Quotation Maker"
              style={styles.logo}
            />
            <span>Vitharn UPVC</span>
          </Link>
          <h1 style={styles.title}>Terms of Service</h1>
          <p style={styles.subtitle}>Last updated: 3 August 2026</p>
        </header>

        <section style={styles.body}>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and
            use of <a href="https://app.vitharn.com/" style={styles.link}>app.vitharn.com</a>{" "}
            (the &quot;Service&quot;), operated by Vitharn. By creating an
            account or using the Service, you agree to these Terms.
          </p>

          <h2 style={styles.h2}>1. Eligibility</h2>
          <p>
            You must be at least 18 years old and capable of entering into a
            binding agreement to use the Service.
          </p>

          <h2 style={styles.h2}>2. Accounts</h2>
          <p>
            You are responsible for safeguarding your login credentials and for
            all activity that occurs under your account. Notify us immediately
            of any unauthorised use.
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
            Businesses are responsible for the accuracy of the information,
            products, and pricing they publish on their branded portal and for
            quotations generated through their account.
          </p>

          <h2 style={styles.h2}>5. Intellectual Property</h2>
          <p>
            The Service, its code, design, and branding belong to Vitharn. Your
            business content remains yours. Nothing in these Terms grants you
            rights to our trademarks or software beyond the limited right to use
            the Service.
          </p>

          <h2 style={styles.h2}>6. No Warranty</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as
            available&quot;, without warranties of any kind, express or implied.
            We do not guarantee that the Service will be uninterrupted or
            error-free.
          </p>

          <h2 style={styles.h2}>7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Vitharn shall not be liable
            for any indirect, incidental, special, or consequential damages, or
            for any loss of data or profits, arising from your use of the
            Service.
          </p>

          <h2 style={styles.h2}>8. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time,
            with or without notice, for violating these Terms or for any other
            reason. You may stop using the Service at any time.
          </p>

          <h2 style={styles.h2}>9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            Service after changes are posted constitutes acceptance of the
            updated Terms.
          </p>

          <h2 style={styles.h2}>10. Governing Law</h2>
          <p>
            These Terms are governed by the laws of India. Any disputes shall be
            subject to the exclusive jurisdiction of the courts of Hyderabad,
            Telangana.
          </p>

          <h2 style={styles.h2}>11. Contact Us</h2>
          <p>
            Questions about these Terms may be sent to{" "}
            <a href="mailto:vitarn.dev@gmail.com" style={styles.link}>vitarn.dev@gmail.com</a>.
          </p>
        </section>

        <footer style={styles.footer}>
          <span>© 2026 Vitharn UPVC Quotation Maker</span>
          <span>
            <Link href="/privacy" style={styles.footerLink}>Privacy</Link>
            {" · "}
            <Link href="/terms" style={styles.footerLink}>Terms</Link>
          </span>
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 50% 50%, #f8fafc 0%, #e2e8f0 100%)",
    padding: "48px 20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  },
  card: {
    maxWidth: 820,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
  },
  header: {
    padding: "36px 48px 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 18,
  },
  logo: {
    width: 40,
    height: 40,
    objectFit: "contain",
    borderRadius: "50%",
  },
  title: {
    margin: "28px 0 6px",
    fontSize: 32,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
  },
  body: {
    padding: "28px 48px 40px",
    color: "#334155",
    fontSize: 15,
    lineHeight: 1.75,
  },
  h2: {
    margin: "30px 0 10px",
    fontSize: 19,
    color: "#0f172a",
  },
  ul: {
    margin: "8px 0 16px",
    paddingLeft: 22,
  },
  link: {
    color: "#6366f1",
    textDecoration: "none",
  },
  footer: {
    padding: "18px 48px",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#94a3b8",
  },
  footerLink: {
    color: "#6366f1",
    textDecoration: "none",
  },
};
