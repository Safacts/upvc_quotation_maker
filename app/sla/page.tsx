export const metadata = {
  title: "Service Level Agreement — Vitharn ERP Services",
  description: "SLA for Vitharn UPVC. 99.9% uptime commitment, support response times, data backup policy, and downtime credits.",
};

export default function SlaPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#FFFBF6", padding: "48px 20px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", background: "#fff", borderRadius: 16, boxShadow: "0 10px 40px rgba(15,23,42,0.08)", overflow: "hidden" }}>
        <header style={{ padding: "36px 48px 24px", borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 32, color: "#1A0A00" }}>Service Level Agreement</h1>
          <p style={{ margin: 0, color: "#7A5030", fontSize: 14 }}>Last updated: 11 August 2026</p>
        </header>
        <section style={{ padding: "28px 48px 40px", color: "#3D1F08", fontSize: 15, lineHeight: 1.75 }}>
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>99.9% Uptime Commitment</h2>
          <p>Vitharn UPVC is committed to maintaining 99.9% platform uptime, measured on a monthly basis. This excludes scheduled maintenance windows, which are announced at least 24 hours in advance via email and the platform dashboard.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Support Response Times</h2>
          <p>We provide the following support response times based on issue severity:</p>
          <ul style={{ paddingLeft: 22, color: "#3D1F08" }}>
            <li><strong>General inquiries:</strong> Response within 24 business hours via email.</li>
            <li><strong>Priority issues (service down / data loss):</strong> Response within 4 business hours via email.</li>
            <li><strong>Feature requests:</strong> Acknowledged within 24 business hours; evaluated on a rolling basis.</li>
          </ul>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Data Backup Policy</h2>
          <p>We perform daily automated backups of all customer data, including quotations, product catalogues, and account settings. Backups are retained for 30 days and stored in geographically redundant storage. In the event of data loss, we will restore from the most recent backup within 24 hours.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Downtime Credits</h2>
          <p>If we fail to meet our 99.9% uptime commitment in any calendar month, affected customers may request a service credit as follows:</p>
          <ul style={{ paddingLeft: 22, color: "#3D1F08" }}>
            <li><strong>99.0% – 99.9% uptime:</strong> 5% credit on that month&apos;s subscription fee.</li>
            <li><strong>95.0% – 98.9% uptime:</strong> 15% credit on that month&apos;s subscription fee.</li>
            <li><strong>Below 95.0% uptime:</strong> 30% credit on that month&apos;s subscription fee.</li>
          </ul>
          <p>Credits must be requested within 15 days of the end of the affected month and will be applied to the next billing cycle.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Exclusions</h2>
          <p>Uptime credits do not apply to downtime caused by: (a) scheduled maintenance with prior notice; (b) force majeure events; (c) customer-side internet or hardware failures; or (d) customer misuse of the platform.</p>
          
          <h2 style={{ color: "#1A0A00", fontSize: 19 }}>Contact</h2>
          <p>For SLA claims or support requests: <a href="mailto:vitarn.dev@gmail.com" style={{ color: "#C44A10" }}>vitarn.dev@gmail.com</a></p>
        </section>
      </div>
    </main>
  );
}
