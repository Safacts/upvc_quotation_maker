export const metadata = {
  title: "Refund Policy — Vitharn ERP Services",
  description: "Refund and cancellation policy for Vitharn UPVC. 7-day money-back guarantee.",
};

export default function RefundPolicyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#FFFBF6", padding: "48px 20px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", background: "#fff", borderRadius: 16, boxShadow: "0 10px 40px rgba(15,23,42,0.08)", overflow: "hidden" }}>
        <header style={{ padding: "36px 48px 24px", borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 32, color: "#1A0A00" }}>Refund Policy</h1>
          <p style={{ margin: 0, color: "#7A5030", fontSize: 14 }}>Last updated: 11 August 2026</p>
        </header>
        <section style={{ padding: "28px 48px 40px", color: "#3D1F08", fontSize: 15, lineHeight: 1.75 }}>
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>7-Day Money-Back Guarantee</h2>
          <p>We offer a 7-day cooling-off period from the date of purchase. If you are not satisfied with Vitharn UPVC for any reason, contact us within 7 days for a full refund.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>How to Request a Refund</h2>
          <p>Email us at <a href="mailto:vitarn.dev@gmail.com" style={{ color: "#C44A10" }}>vitarn.dev@gmail.com</a> with your business name and purchase date. We process refunds within 5 business days to the original payment method.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Upgrade Refunds</h2>
          <p>If you upgrade from a lower tier to a higher tier, only the price difference is charged. The original payment is non-refundable after 7 days.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Non-Refundable Items</h2>
          <p>Custom setup services, data migration, and branding work already completed are non-refundable.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Contact</h2>
          <p>For refund requests: <a href="mailto:vitarn.dev@gmail.com" style={{ color: "#C44A10" }}>vitarn.dev@gmail.com</a></p>
        </section>
        <footer style={{ padding: "18px 48px", borderTop: "1px solid #e2e8f0", textAlign: "center", fontSize: 13, color: "#7A5030" }}>
          © 2026 Vitharn ERP Services — Sole Proprietorship, Hyderabad.
        </footer>
      </div>
    </main>
  );
}
