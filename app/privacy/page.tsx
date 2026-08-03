import Link from "next/link";

export default function PrivacyPage() {
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
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.subtitle}>Last updated: 3 August 2026</p>
        </header>

        <section style={styles.body}>
          <p>
            Vitharn (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates{" "}
            <a href="https://app.vitharn.com/" style={styles.link}>app.vitharn.com</a>{" "}
            (the &quot;Service&quot;). This Privacy Policy explains what
            information we collect, how we use it, and the choices you have.
          </p>

          <h2 style={styles.h2}>1. Information We Collect</h2>
          <p>
            <strong>Account information:</strong> When you register or log in,
            we collect your name, email address, and password (stored as a
            secure hash). When you sign in with Google, we receive your Google
            account email address and basic profile information from Google.
          </p>
          <p>
            <strong>Business information:</strong> Businesses using the
            platform provide company name, logo, contact details, GST number,
            bank details, product catalogues, and pricing information to
            operate their branded portal.
          </p>
          <p>
            <strong>Quotation data:</strong> Products, measurements, pricing,
            customer details, and generated quotations are stored on our
            servers to provide the quoting service.
          </p>
          <p>
            <strong>Usage data:</strong> We may collect basic technical
            information such as browser type, device type, and pages visited to
            improve the Service.
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
            When you sign in with Google, Google may share your email address
            and profile information with us. Google&apos;s own privacy practices
            are governed by Google&apos;s Privacy Policy. We use this
            information only to identify registered users and grant access to
            the appropriate portal.
          </p>

          <h2 style={styles.h2}>4. Data Sharing</h2>
          <p>
            We do not sell your personal data. We share data only: (a) with
            service providers that help operate the Service (such as hosting and
            email delivery providers), (b) with the business whose portal you
            are using, to the extent needed to deliver quotations, or (c) when
            required by law.
          </p>

          <h2 style={styles.h2}>5. Data Security</h2>
          <p>
            Passwords are stored as one-way hashes. We use HTTPS encryption in
            transit and restrict access to personal data to authorised staff.
            No method of transmission or storage is 100% secure, but we work
            hard to protect your information.
          </p>

          <h2 style={styles.h2}>6. Data Retention</h2>
          <p>
            We retain account and quotation data for as long as your account is
            active, or as needed to provide the Service. You may request
            deletion of your data by contacting us.
          </p>

          <h2 style={styles.h2}>7. Your Rights</h2>
          <p>
            You may access, correct, export, or delete the personal data we hold
            about you. To exercise these rights, contact us at the address
            below.
          </p>

          <h2 style={styles.h2}>8. Children</h2>
          <p>
            The Service is not directed at children under 13, and we do not
            knowingly collect their personal information.
          </p>

          <h2 style={styles.h2}>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post
            any changes on this page and update the &quot;Last updated&quot;
            date above.
          </p>

          <h2 style={styles.h2}>10. Contact Us</h2>
          <p>
            For privacy questions or requests, contact us at{" "}
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
