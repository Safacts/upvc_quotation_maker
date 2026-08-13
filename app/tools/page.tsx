import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, Layers, IndianRupee, ArrowLeftRight, QrCode, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Free Tools Hub — uPVC, Glass, GST & More | Vitharn ERP",
  description:
    "Free online tools for UPVC fabricators and Indian businesses: uPVC window price calculator, glass weight calculator, GST calculator, RF-SF converter, and UPI QR generator.",
};

const tools = [
  {
    href: "/tools/upvc-calculator",
    icon: "🪟",
    title: "uPVC Window Calculator",
    description:
      "Enter window dimensions (mm) and get instant price estimates per SFT. Perfect for fabrication quotes.",
    color: "from-indigo-500/10 to-purple-500/10",
  },
  {
    href: "/tools/glass-weight",
    icon: "🔲",
    title: "Glass Weight Calculator",
    description:
      "Calculate glass weight by dimensions and thickness. Supports mm and inches. Essential for shipping estimates.",
    color: "from-blue-500/10 to-cyan-500/10",
  },
  {
    href: "/tools/gst-calculator",
    icon: "🧾",
    title: "GST Calculator",
    description:
      "Add or remove GST from any amount. Supports 5%, 12%, 18%, and 28% rates. Auto CGST/SGST split.",
    color: "from-emerald-500/10 to-teal-500/10",
  },
  {
    href: "/tools/rf-sf-converter",
    icon: "📐",
    title: "RF-SF Converter",
    description:
      "Convert Running Feet (RF) to Square Feet (SF) for uPVC profiles, aluminum sections, and linear materials.",
    color: "from-orange-500/10 to-amber-500/10",
  },
  {
    href: "/tools/upi-qr",
    icon: "📱",
    title: "UPI QR Generator",
    description:
      "Generate a UPI payment QR code instantly. Enter VPA, amount, and description. Print or share with customers.",
    color: "from-pink-500/10 to-rose-500/10",
  },
];

export default function ToolsHub() {
  return (
    <>
      {/* Ad placement: top leaderboard */}
      <div className="ad-banner ad-top" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
        {/* AdSense code goes here: <ins className="adsbygoogle" ... /> */}
      </div>

      <section className="tools-hero">
        <div className="tools-hero-inner">
          <div className="container">
            <h1>Free Tools for Indian Businesses</h1>
            <p>
              Instant calculators for UPVC fabricators, glass dealers, and every
              Indian business. No signup, no ads, no limits — just results.
            </p>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingTop: 0 }}>
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="tool-card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="tool-icon" role="img" aria-label={tool.title}>
                {tool.icon}
              </div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <span className="tool-link">
                Open Tool <ArrowLeftRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Ad placement: inline */}
      <div className="ad-banner ad-inline" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
      </div>

      {/* Value proposition */}
      <section className="container" style={{ padding: "20px 24px 0" }}>
        <div
          style={{
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(20px, 3vw, 26px)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            Why These Tools?
          </h2>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-muted)",
              maxWidth: 560,
              margin: "0 auto 20px",
              lineHeight: 1.7,
            }}
          >
            We built these because every UPVC fabricator we work with needed them
            daily. Instead of locking them behind a paywall, we&apos;re giving them
            away free — as a taste of what smart business software feels like.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>100%</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Free Forever</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>0</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Signups Needed</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>Client-Side</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Data Stays Yours</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA to Vitharn ERP */}
      <section className="container" style={{ padding: "0 24px" }}>
        <div className="pricing-cta">
          <h3>Need More Than Calculators?</h3>
          <p>
            Vitharn ERP gives you cloud-synced quotations, PDF invoicing, a
            branded website, customer portal, and payment tracking — all in one
            platform built for UPVC businesses.
          </p>
          <a href="/#pricing" className="btn-white">
            <IndianRupee size={18} /> View Pricing Plans
          </a>
          <p className="price-note">
            Starting at ₹10,000 one-time · No monthly fees
          </p>
        </div>
      </section>

      {/* Ad placement: bottom */}
      <div className="ad-banner ad-inline" aria-label="Advertisement" style={{ marginBottom: 40 }}>
        <span className="ad-label">Advertisement</span>
      </div>
    </>
  );
}
