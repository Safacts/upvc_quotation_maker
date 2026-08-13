"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle, Zap } from "lucide-react";
import "../upvc-web.css";
import "../pricing/pricing-web.css";

function slugify(s: string) {
  return (s || "")
    .toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const features = [
  { label: "Industry focus", vitharn: "Built exclusively for UPVC fabricators", vyapar: "Generic billing for all businesses", mybillbook: "Generic billing for all businesses" },
  { label: "UPVC mm \u2192 sqft auto-calc", vitharn: true, vyapar: false, mybillbook: false },
  { label: "Branded PDF quotations", vitharn: "Instant, logo-branded", vyapar: "Basic templates", mybillbook: "Basic templates" },
  { label: "WhatsApp quote sharing", vitharn: true, vyapar: "Paid add-on", mybillbook: "Paid add-on" },
  { label: "Customer portal with login", vitharn: true, vyapar: false, mybillbook: false },
  { label: "Business website included", vitharn: true, vyapar: false, mybillbook: false },
  { label: "Customer review system", vitharn: true, vyapar: false, mybillbook: false },
  { label: "SEO-optimized webpage", vitharn: true, vyapar: false, mybillbook: false },
  { label: "GST-compliant invoicing", vitharn: true, vyapar: true, mybillbook: true },
  { label: "Mobile app (Android)", vitharn: true, vyapar: true, mybillbook: true },
  { label: "Data export (Tally XML / Excel)", vitharn: true, vyapar: "Partial", mybillbook: "Partial" },
  { label: "Monthly fees (first 25 clients)", vitharn: "\u20B90 / month", vyapar: "\u20B9200\u2013500 / month", mybillbook: "\u20B9291\u2013570 / month" },
  { label: "Setup time", vitharn: "24 hours (we do it for you)", vyapar: "Self-setup (days)", mybillbook: "Self-setup (days)" },
  { label: "Support", vitharn: "Direct WhatsApp \u2014 personal", vyapar: "Ticket queue", mybillbook: "Ticket queue" },
  { label: "3-Year TCO (estimated)", vitharn: "\u20B925,000 one-time", vyapar: "\u20B972,000\u20131,80,000", mybillbook: "\u20B91,05,000\u20132,05,000" },
];

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) return <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 13 }}>✓ Included</span>;
  if (value === false) return <span style={{ color: "#94a3b8", fontSize: 13 }}>✗</span>;
  return <span style={{ color: "#d97706", fontSize: 13 }}>{String(value)}</span>;
}

export default function ComparePage() {
  const [dashboardHref, setDashboardHref] = useState("/upvc/login");
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const active = localStorage.getItem("portal_session") === "active";
    const role = localStorage.getItem("portal_role");
    const clientId = localStorage.getItem("portal_client_id");
    if (active) setLoggedIn(true);
    if (active && role === "customer") {
      if (!clientId) localStorage.clear();
    }
    const customer = active && role === "customer" && !!clientId;
    if (customer) setDashboardHref("/" + slugify(clientId!) + "/home");
    else if (role === "admin") setDashboardHref("/admin");
    else if (role === "signup") setDashboardHref("/signup");
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        if (window.scrollY > 10) headerRef.current.classList.add("scrolled");
        else headerRef.current.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("header") && !target.closest(".mobile-nav")) setMobileMenuOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      {/* HEADER */}
      <header ref={headerRef}>
        <a href="/upvc" className="logo-container">
          <img
            src="/logo.png"
            onError={(e) => { e.currentTarget.src = "https://placehold.co/100"; }}
            alt="Vitharn UPVC"
          />
          <span className="logo-text">Vitharn <span>UPVC</span></span>
        </a>
        <nav>
          <a href="/upvc">Home</a>
          <a href="/upvc#features">Features</a>
          <a href="/upvc/pricing">Pricing</a>
          <a href="/upvc/pricing/show" target="_blank" rel="noopener noreferrer">PDF Flyer</a>
          {loggedIn && (
            <a href={dashboardHref} className="btn-nav-dashboard">Dashboard</a>
          )}
          <a href={loggedIn ? "/logout" : "/upvc/login"} className="btn-nav-login">
            {loggedIn ? "Logout" : "Portal Login"}
          </a>
        </nav>
        <button
          className={`hamburger${mobileMenuOpen ? " open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span /><span /><span />
        </button>
      </header>

      {/* Mobile Nav */}
      <div className={`mobile-nav${mobileMenuOpen ? " open" : ""}`}>
        <a href="/upvc" onClick={closeMobileMenu}>Home</a>
        <a href="/upvc#features" onClick={closeMobileMenu}>Features</a>
        <a href="/upvc/pricing" onClick={closeMobileMenu}>Pricing</a>
        {loggedIn && (
          <a href={dashboardHref} className="btn-nav-dashboard" onClick={closeMobileMenu}>Dashboard</a>
        )}
        <a href={loggedIn ? "/logout" : "/upvc/login"} className="btn-nav-login" onClick={closeMobileMenu}>
          {loggedIn ? "Logout" : "Portal Login"}
        </a>
      </div>

      {/* HERO */}
      <section className="pricing-hero pricing-hero-grid">
        <div className="pricing-hero-inner">
          <div className="hero-badge">
            <Zap size={11} /> Competitor Comparison \u2014 2026
          </div>
          <h1 className="hero-title">
            Why UPVC Fabricators Choose Vitharn<br />
            <em>Over Generic Billing Software</em>
          </h1>
          <p className="hero-subtitle">
            Vyapar and myBillBook serve 2.5 Cr businesses combined \u2014 but none of them are UPVC fabricators.
            Vitharn is built <strong>only for your business</strong>. Here&apos;s the difference.
          </p>
        </div>
      </section>

      {/* WHY UPVC SPECIFIC WINS */}
      <section style={{ padding: "80px 24px", maxWidth: 900, margin: "0 auto" }}>
        <h2 className="section-title">Built for YOUR business, not every business</h2>
        <p className="section-subtitle">
          Generic billing apps try to serve everyone. We serve one industry \u2014 and do it better.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16, marginTop: 48 }}>
          {[
            { title: "UPVC Dimensions", desc: "Enter millimetre dimensions. We auto-calculate square footage, transport charges, and GST \u2014 no spreadsheets, no errors." },
            { title: "Industry Templates", desc: "Quotation templates designed for UPVC windows and doors. Not generic invoicing layouts forced to fit your workflow." },
            { title: "Customer Portal", desc: "Your customers log in to a branded portal to view quotes and request work. Vyapar and myBillBook have nothing like this." },
            { title: "Business Website", desc: "Get a professional, SEO-optimized website at no extra cost. Generic apps charge \u20B95,000\u201315,000/year for basic web pages." },
          ].map((item, i) => (
            <div key={i} style={{
              background: "white",
              padding: "28px 24px",
              borderRadius: 16,
              border: "1px solid rgba(42, 19, 5, 0.10)",
              boxShadow: "0 2px 20px rgba(26, 10, 0, 0.07)",
            }}>
              <div style={{ width: 40, height: 40, background: "rgba(196, 74, 16, 0.09)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <CheckCircle size={20} color="#EA580C" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A0A00", marginBottom: 8, letterSpacing: "-0.02em" }}>{item.title}</h3>
              <p style={{ fontSize: 14, color: "#7A5030", lineHeight: 1.65 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="comparison-section" style={{ maxWidth: 1100 }}>
        <h2 className="section-title">Feature-by-Feature Comparison</h2>
        <p className="section-subtitle">
          15 dimensions. One clear winner for UPVC fabricators.
        </p>
        <div className="comparison-table-wrap" style={{ marginTop: 48 }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Feature</th>
                <th style={{ width: "24%", color: "#EA580C", background: "rgba(238, 88, 12, 0.06)" }}>Vitharn UPVC</th>
                <th style={{ width: "23%" }}>Vyapar</th>
                <th style={{ width: "23%" }}>myBillBook</th>
              </tr>
            </thead>
            <tbody>
              {features.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: "#1A0A00", fontSize: 13.5 }}>{row.label}</td>
                  <td style={{ background: "rgba(238, 88, 12, 0.04)" }}>
                    <CellValue value={row.vitharn} />
                  </td>
                  <td><CellValue value={row.vyapar} /></td>
                  <td><CellValue value={row.mybillbook} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3-YEAR TCO */}
      <section className="cost-comparison" style={{ maxWidth: 800 }}>
        <h2 className="section-title">3-Year Total Cost of Ownership</h2>
        <p className="section-subtitle">Pay once. Own it forever.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginTop: 40 }}>
          {/* Vitharn */}
          <div style={{
            background: "white",
            border: "2px solid #EA580C",
            borderRadius: 16,
            padding: "32px 24px",
            textAlign: "center",
            boxShadow: "0 8px 40px rgba(238, 88, 12, 0.12)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "#EA580C", marginBottom: 16 }}>Vitharn UPVC</div>
            <div style={{ fontSize: "2.8rem", fontWeight: 900, color: "#16a34a", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 4 }}>\u20B925,000</div>
            <div style={{ fontSize: 13, color: "#7A5030", marginBottom: 8 }}>one-time</div>
            <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Pay once, own forever</div>
          </div>

          {/* Vyapar */}
          <div style={{
            background: "white",
            border: "1px solid rgba(42,19,5,0.10)",
            borderRadius: 16,
            padding: "32px 24px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7A5030", marginBottom: 16 }}>Vyapar</div>
            <div style={{ fontSize: "2.8rem", fontWeight: 900, color: "#d97706", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 4 }}>\u20B972,000+</div>
            <div style={{ fontSize: 13, color: "#7A5030", marginBottom: 8 }}>over 3 years</div>
            <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>\u20B92,000/month forever</div>
          </div>

          {/* myBillBook */}
          <div style={{
            background: "white",
            border: "1px solid rgba(42,19,5,0.10)",
            borderRadius: 16,
            padding: "32px 24px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "#7A5030", marginBottom: 16 }}>myBillBook</div>
            <div style={{ fontSize: "2.8rem", fontWeight: 900, color: "#d97706", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 4 }}>\u20B91,05,000+</div>
            <div style={{ fontSize: 13, color: "#7A5030", marginBottom: 8 }}>over 3 years</div>
            <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>\u20B92,900/month forever</div>
          </div>
        </div>

        <div style={{ marginTop: 32, padding: "20px 24px", background: "#FFF3E6", borderRadius: 12, border: "1px solid rgba(238,88,12,0.15)" }}>
          <p style={{ fontSize: 14, color: "#7A5030", lineHeight: 1.65, textAlign: "center", margin: 0 }}>
            <strong style={{ color: "#EA580C" }}>You save \u20B947,000\u2013\u20B91,80,000</strong> over 3 years. Plus features they don&apos;t have \u2014 customer portal, website, UPVC auto-calc.
          </p>
        </div>
      </section>

      {/* ONE-TIME vs SUBSCRIPTION */}
      <section style={{ padding: "80px 24px", background: "#140800", borderTop: "1px solid rgba(196, 74, 16, 0.15)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 className="section-title" style={{ color: "white" }}>One-time payment vs subscription</h2>
          <p className="section-subtitle" style={{ color: "rgba(255,251,246,0.55)" }}>
            The math is simple. Pay once and own it forever.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginTop: 48, textAlign: "left" }}>
            <div style={{ background: "rgba(255,255,255,0.04)", padding: "28px 24px", borderRadius: 16, border: "1px solid rgba(196, 74, 16, 0.18)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "#EA580C", marginBottom: 16 }}>Vitharn UPVC</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <li style={{ color: "rgba(255,251,246,0.85)", fontSize: 14, lineHeight: 1.6 }}>✓ Pay once, own it forever</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✓ No surprise price hikes</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✓ No per-user or per-invoice fees</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✓ Export data anytime (no lock-in)</li>
              </ul>
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", padding: "28px 24px", borderRadius: 16, border: "1px solid rgba(196, 74, 16, 0.18)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,251,246,0.5)", marginBottom: 16 }}>Generic Software (Vyapar / myBillBook)</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ Pay every month, forever</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ Prices increase on renewal</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ Features locked behind higher tiers</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ Stop paying = lose access</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ Limited export options</li>
                <li style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>✗ No UPVC-specific features</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="trust-strip">
        <div className="trust-item">
          <div className="trust-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16.5c0 0-3-2.5-3-5a3 3 0 1 1 6 0c0 2.5-3 5-3 5z" />
              <circle cx="12" cy="11.5" r="1" />
            </svg>
          </div>
          <div>
            <div className="trust-label">Made in India</div>
            <div className="trust-sub">Built in Hyderabad for Indian UPVC fabricators</div>
          </div>
        </div>
        <div className="trust-divider" />
        <div className="trust-item">
          <div className="trust-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="trust-label">Data portability</div>
            <div className="trust-sub">Export everything. Tally XML, Excel. No lock-in.</div>
          </div>
        </div>
        <div className="trust-divider" />
        <div className="trust-item">
          <div className="trust-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              <path d="M7 11l5 5 5-5" />
              <path d="M12 4v12" />
            </svg>
          </div>
          <div>
            <div className="trust-label">No monthly fees</div>
            <div className="trust-sub">One-time payment. Pay once, own it forever.</div>
          </div>
        </div>
        <div className="trust-divider" />
        <div className="trust-item">
          <div className="trust-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div>
            <div className="trust-label">24/7 WhatsApp support</div>
            <div className="trust-sub">Direct help \u2014 not a ticket queue</div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL — PLACEHOLDER: Replace with real client testimonial after first 5 clients */}
      {/* <section className="testimonial-section">
        <h2 className="section-title">What fabricators say</h2>
        <div className="testimonial-card">
          <p className="testimonial-text">"..."</p>
          <div className="testimonial-author">
            <strong>Client Name</strong>
            <span>Company, City</span>
          </div>
        </div>
      </section> */}

      {/* CTA */}
      <section className="cta-banner">
        <div className="cta-content">
          <div className="cta-badge">
            <Zap size={11} /> Ready to switch?
          </div>
          <h2 className="cta-title">
            Stop paying monthly for generic software.<br />
            <span className="muted">Own your platform. Pay once.</span>
          </h2>
          <p className="cta-sub">
            One-time payment. No monthly fees. Fully branded to your business.
          </p>
          <div className="btn-group btn-group-center">
            <a href="/upvc/login" className="btn-download" id="compareTrialBtn">
              <ArrowRight size={18} /> Get Started
            </a>
            <a href="/upvc/pricing" className="btn-webapp btn-webapp--light" id="comparePricingBtn">
              View Pricing
            </a>
            <a href="tel:+919705146471" className="btn-webapp btn-webapp--light" id="compareCallBtn">
              Call Us
            </a>
          </div>
          <ul className="cta-checks">
            <li><CheckCircle size={15} /> One-time payment</li>
            <li><CheckCircle size={15} /> No monthly fees</li>
            <li><CheckCircle size={15} /> Personal support</li>
          </ul>
        </div>
      </section>

      <footer>
        <p>\u00A9 2026 Vitharn ERP Services \u2014 Sole Proprietorship, Hyderabad.</p>
        <p className="footer-links">
          <a href="/privacy" className="footer-link">Privacy Policy</a>{" "}
          \u00B7{" "}
          <a href="/terms" className="footer-link">Terms of Service</a>{" "}
          \u00B7{" "}
          <a href="/refund-policy" className="footer-link">Refund Policy</a>{" "}
          \u00B7{" "}
          <a href="/upvc/pricing" className="footer-link">Pricing</a>{" "}
          \u00B7{" "}
          <a href="mailto:vitarn.dev@gmail.com" className="footer-link">Contact</a>
        </p>
        <p className="footer-fine-print">
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Vyapar, myBillBook, Google, or any other company mentioned.
        </p>
      </footer>
    </>
  );
}
