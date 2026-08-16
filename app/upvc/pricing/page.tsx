"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle, Shield, Zap } from "lucide-react";
import "../upvc-web.css";
import "./pricing-web.css";

function slugify(s: string) {
  return (s || "")
    .toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function WebPricingPage() {
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
      {/* ── HEADER ── */}
      <header ref={headerRef}>
        <a href="/upvc" className="logo-container">
          <img
            src="/logo.png"
            onError={(e) => { e.currentTarget.src = "https://placehold.co/100"; }}
            alt="Vitharn UPVC"
          />
          <span className="logo-text">Vitharn <span>UPVC</span></span>
        </a>

        {/* Desktop Nav */}
        <nav>
          <a href="/upvc">Home</a>
          <a href="/upvc#features">Features</a>
          <a href="#faq">FAQ</a>
          <a href="/upvc/pricing/show" target="_blank" rel="noopener noreferrer">PDF Flyer</a>
          {loggedIn && (
            <a href={dashboardHref} className="btn-nav-dashboard" id="navDashboardBtn">
              Dashboard
            </a>
          )}
          <a
            href={loggedIn ? "/logout" : "/upvc/login"}
            className="btn-nav-login"
            id="navPortalLogin"
          >
            {loggedIn ? "Logout" : "Portal Login"}
          </a>
        </nav>

        {/* Hamburger */}
        <button
          className={`hamburger${mobileMenuOpen ? " open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span /><span /><span />
        </button>
      </header>

      {/* Mobile Nav Drawer */}
      <div className={`mobile-nav${mobileMenuOpen ? " open" : ""}`}>
        <a href="/upvc" onClick={closeMobileMenu}>Home</a>
        <a href="/upvc#features" onClick={closeMobileMenu}>Features</a>
        <a href="#faq" onClick={closeMobileMenu}>FAQ</a>
        <a href="/upvc/pricing/show" onClick={closeMobileMenu} target="_blank" rel="noopener noreferrer">PDF Flyer</a>
        {loggedIn && (
          <a href={dashboardHref} className="btn-nav-dashboard" id="mobileDashboardBtn" onClick={closeMobileMenu}>
            Dashboard
          </a>
        )}
        <a
          href={loggedIn ? "/logout" : "/upvc/login"}
          className="btn-nav-login"
          id="mobilePortalLogin"
          onClick={closeMobileMenu}
        >
          {loggedIn ? "Logout" : "Portal Login"}
        </a>
      </div>

      {/* ── PRICING HERO ── */}
      <section className="pricing-hero pricing-hero-grid">
        <div className="pricing-hero-inner">
          <div className="hero-badge">
            <Zap size={11} /> Pricing Plans — 2026
          </div>
          <h1 className="hero-title">
            Simple pricing.<br />
            <em>No monthly fees for first 25 clients.</em>
          </h1>
          <p className="hero-subtitle">
            Built strictly for UPVC fabricators. <strong>Pay once, no recurring fees</strong> for the first 25 clients.
            After that, plans switch to monthly subscription. Upgrade anytime — only pay the difference.
          </p>
        </div>
      </section>

      <div className="urgency-banner">
        <span className="urgency-dot" />
        <strong>Limited offer:</strong> First 25 fabricators get one-time lifetime pricing (no monthly fees for the first 25 clients).
        <span className="urgency-count"> 22 spots left.</span>
      </div>

      {/* ── PRICING CARDS ── */}
      <section className="pricing-grid">
        {/* Starter */}
        <div className="pricing-card">
          <div className="pricing-label">Starter</div>
          <div className="pricing-price">₹25,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">
            Small shops (1–5 people) who want digital quotations with cloud backup.
          </div>
          <ul className="pricing-features">
            <li><CheckCircle /> Cloud sync & web dashboard</li>
            <li><CheckCircle /> GST-compliant invoicing</li>
            <li><CheckCircle /> Customer & product database</li>
            <li><CheckCircle /> Daily cloud backup</li>
            <li><CheckCircle /> Business analytics</li>
            <li><CheckCircle /> Email support</li>
          </ul>
          <a href="/upvc/login" className="pricing-cta" id="starterCtaBtn">
            Start 7-Day Free Trial →
          </a>
        </div>

        {/* FEATURED: Growth */}
        <div className="pricing-card pricing-card--featured">
          <div className="pricing-badge">Most Popular</div>
          <div className="pricing-label">Growth</div>
          <div className="pricing-price">₹35,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">
            Growing businesses wanting online visibility and customer reviews.
          </div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Starter</li>
            <li><CheckCircle /> SEO-optimized business webpage</li>
            <li><CheckCircle /> Customer star-rating system</li>
            <li><CheckCircle /> Auto review-request emails</li>
            <li><CheckCircle /> UPI QR on invoices</li>
            <li><CheckCircle /> Site photos (camera capture)</li>
          </ul>
          <a href="/upvc/login" className="pricing-cta" id="growthCtaBtn">
            Start 7-Day Free Trial →
          </a>
        </div>

        {/* Business */}
        <div className="pricing-card">
          <div className="pricing-label">Business</div>
          <div className="pricing-price">₹45,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">
            Businesses wanting direct customer engagement via WhatsApp.
          </div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Growth</li>
            <li><CheckCircle /> Direct WhatsApp sharing of quotes</li>
            <li><CheckCircle /> Review link sharing via WhatsApp</li>
            <li><CheckCircle /> Priority email support</li>
            <li><CheckCircle /> Custom domain support</li>
          </ul>
          <a href="/upvc/login" className="pricing-cta" id="businessCtaBtn">
            Start 7-Day Free Trial →
          </a>
        </div>

        {/* Enterprise */}
        <div className="pricing-card">
          <div className="pricing-label">Enterprise</div>
          <div className="pricing-price">₹55,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">
            Full-service businesses who want complete automation and financial control.
          </div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Business</li>
            <li><CheckCircle /> Desktop web console (split-view editor)</li>
            <li><CheckCircle /> Keyboard shortcuts — Tally-style speed</li>
            <li><CheckCircle /> Payment tracking: who paid, who owes</li>
            <li><CheckCircle /> GST reports, sales register, customer ledger</li>
            <li><CheckCircle /> WhatsApp + email priority support</li>
            <li><CheckCircle /> Multi-user access</li>
            <li><CheckCircle /> Excel export</li>
          </ul>
          <a href="/upvc/login" className="pricing-cta" id="enterpriseCtaBtn">
            Start 7-Day Free Trial →
          </a>
        </div>
      </section>

      {/* ── FEATURE COMPARISON MATRIX ── */}
      <section className="comparison-section">
        <h2 className="section-title">Feature comparison</h2>
        <p className="section-subtitle">See what's included in each plan</p>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Starter</th>
                <th>Growth</th>
                <th>Business</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Cloud sync & web dashboard</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>GST-compliant invoicing</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>Customer & product database</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>Business analytics</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>SEO-optimized webpage</td><td>—</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>Customer reviews system</td><td>—</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>WhatsApp quote sharing</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
              <tr><td>Priority support</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
              <tr><td>Desktop web console</td><td>—</td><td>—</td><td>—</td><td>✓</td></tr>
              <tr><td>Payment tracking & GST reports</td><td>—</td><td>—</td><td>—</td><td>✓</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── COST COMPARISON ── */}
      <section className="cost-comparison">
        <h2 className="section-title">What you're paying now</h2>
        <p className="section-subtitle">See how Vitharn compares to your current costs</p>
        <div className="cost-rows">
          <div className="cost-row">
            <span className="cost-name">Tally Prime (1 year)</span>
            <span className="cost-price">₹18,000</span>
          </div>
          <div className="cost-row">
            <span className="cost-name">Accountant (monthly)</span>
            <span className="cost-price">₹3,000–5,000/mo</span>
          </div>
          <div className="cost-row">
            <span className="cost-name">Excel + your time</span>
            <span className="cost-price">Errors + delays</span>
          </div>
        </div>
        <div className="cost-vs">VS</div>
        <div className="cost-vitharn">
          <span className="cost-name">Vitharn Growth (one-time)</span>
          <span className="cost-price cost-price--highlight">₹35,000</span>
          <span className="cost-note">Pays for itself in under 3 months (if you currently pay ₹3,000+/mo for an accountant)</span>
        </div>
      </section>

      {/* ── WHY ONE-TIME BEATS MONTHLY ── */}
      <section className="comparison-section" style={{ maxWidth: 900 }}>
        <h2 className="section-title">Why One-Time Beats Monthly</h2>
        <p className="section-subtitle">
          The real cost of subscription billing software over 3 years
        </p>
        <div className="comparison-table-wrap" style={{ marginTop: 32 }}>
          <table className="comparison-table cost-compare-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Year 1</th>
                <th>Year 2</th>
                <th>Year 3</th>
                <th>3-Year Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vyapar Silver</td>
                <td>₹4,719</td>
                <td>₹4,719</td>
                <td>₹4,719</td>
                <td>₹14,157</td>
              </tr>
              <tr>
                <td>Vyapar Diamond</td>
                <td>₹10,619</td>
                <td>₹10,619</td>
                <td>₹10,619</td>
                <td>₹31,857</td>
              </tr>
              <tr>
                <td>myBillBook Essential</td>
                <td>₹3,490</td>
                <td>₹3,490</td>
                <td>₹3,490</td>
                <td>₹10,470</td>
              </tr>
              <tr>
                <td>myBillBook Enterprise</td>
                <td>₹8,988</td>
                <td>₹8,988</td>
                <td>₹8,988</td>
                <td>₹26,964</td>
              </tr>
              <tr className="cost-compare-row--vitharn">
                <td><strong>Vitharn Base</strong></td>
                <td><strong>₹25,000</strong></td>
                <td>₹0</td>
                <td>₹0</td>
                <td><strong>₹25,000</strong></td>
              </tr>
              <tr className="cost-compare-row--vitharn">
                <td><strong>Vitharn Final</strong></td>
                <td><strong>₹55,000</strong></td>
                <td>₹0</td>
                <td>₹0</td>
                <td><strong>₹55,000</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="cost-callout">
          <span className="cost-callout-icon">💡</span>
          <p>
            <strong>₹25,000 one-time = ₹694/month over 3 years.</strong>{" "}
            That&apos;s CHEAPER than Vyapar Silver + Tally combined.
          </p>
        </div>
        <p className="cost-compare-disclaimer">
          All prices include GST. Vyapar/myBillBook prices based on 2026 published rates.
        </p>
      </section>

      {/* ── YOUR DATA IS SAFE ── */}
      <section className="comparison-section" style={{ maxWidth: 720 }}>
        <div style={{
          background: "linear-gradient(160deg, #f0fdf4 0%, #fff 60%)",
          border: "2px solid #16a34a",
          borderRadius: 20,
          padding: "48px 40px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Shield icon */}
          <div style={{
            width: 64,
            height: 64,
            background: "rgba(22, 163, 74, 0.1)",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <Shield size={32} color="#16a34a" strokeWidth={2.2} />
          </div>

          <h2 style={{
            fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
            fontWeight: 900,
            color: "#1A0A00",
            letterSpacing: "-0.03em",
            marginBottom: 12,
          }}>
            Your Data, Your Ownership
          </h2>
          <p style={{
            fontSize: 15,
            color: "#7A5030",
            maxWidth: 480,
            margin: "0 auto 36px",
            lineHeight: 1.65,
          }}>
            We built Vitharn on one belief: your business data belongs to you — not us, never us.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 24,
            maxWidth: 600,
            margin: "0 auto 36px",
          }}>
            {/* Point 1 */}
            <div style={{
              background: "white",
              border: "1px solid rgba(22, 163, 74, 0.15)",
              borderRadius: 14,
              padding: "24px 20px",
              textAlign: "left",
            }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A0A00", marginBottom: 6 }}>
                Export Everything
              </div>
              <div style={{ fontSize: 13, color: "#7A5030", lineHeight: 1.6 }}>
                Export ALL your data anytime — CSV, Excel, PDF, Tally XML, ZIP. No restrictions.
              </div>
            </div>

            {/* Point 2 */}
            <div style={{
              background: "white",
              border: "1px solid rgba(22, 163, 74, 0.15)",
              borderRadius: 14,
              padding: "24px 20px",
              textAlign: "left",
            }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🔓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A0A00", marginBottom: 6 }}>
                Zero Lock-In
              </div>
              <div style={{ fontSize: 13, color: "#7A5030", lineHeight: 1.6 }}>
                We never lock you in — cancel anytime, take everything. No exit fees, no delays.
              </div>
            </div>

            {/* Point 3 */}
            <div style={{
              background: "white",
              border: "1px solid rgba(22, 163, 74, 0.15)",
              borderRadius: 14,
              padding: "24px 20px",
              textAlign: "left",
            }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🛡️</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A0A00", marginBottom: 6 }}>
                Source Code Escrow
              </div>
              <div style={{ fontSize: 13, color: "#7A5030", lineHeight: 1.6 }}>
                Even if we shut down, you keep running. Enterprise clients get full source code escrow.
              </div>
            </div>
          </div>

          <a
            href="/upvc/pricing/sample-export.csv"
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 28px",
              fontSize: 14,
              fontWeight: 700,
              color: "white",
              background: "#16a34a",
              borderRadius: 50,
              textDecoration: "none",
              boxShadow: "0 6px 20px rgba(22, 163, 74, 0.35)",
              transition: "background 0.2s, transform 0.2s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            📥 Download Sample Export
          </a>
        </div>
      </section>

            {/* ── HOW WE COMPARE ── */}
      <section className="comparison-section" style={{ maxWidth: 900 }}>
        <h2 className="section-title">How Vitharn Compares</h2>
        <p className="section-subtitle">
          See how we stack up against generic billing software
        </p>
        <div className="comparison-table-wrap" style={{ marginTop: 32 }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th style={{ color: "#EA580C" }}>Vitharn UPVC</th>
                <th>Vyapar</th>
                <th>myBillBook</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>UPVC mm to sqft auto-calc</td><td style={{ color: "#16a34a", fontWeight: 700 }}>✓ Auto</td><td>✗</td><td>✗</td></tr>
              <tr><td>Customer portal with login</td><td style={{ color: "#16a34a", fontWeight: 700 }}>✓</td><td>✗</td><td>✗</td></tr>
              <tr><td>Business website included</td><td style={{ color: "#16a34a", fontWeight: 700 }}>✓</td><td>✗</td><td>✗</td></tr>
              <tr><td>Monthly fees (first 25 clients)</td><td style={{ color: "#16a34a", fontWeight: 700 }}>₹0/month</td><td>₹200–500/mo</td><td>₹150–400/mo</td></tr>
              <tr><td>3-Year total cost</td><td style={{ color: "#16a34a", fontWeight: 700 }}>₹35,000</td><td>₹72,000+</td><td>₹54,000+</td></tr>
              <tr><td>Data export (Tally XML)</td><td style={{ color: "#16a34a", fontWeight: 700 }}>✓ Full</td><td>Partial</td><td>Partial</td></tr>
              <tr><td>Setup</td><td style={{ color: "#16a34a", fontWeight: 700 }}>We do it (24h)</td><td>Self-setup</td><td>Self-setup</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/upvc/compare" style={{ color: "#EA580C", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            See full comparison with Vyapar and myBillBook →
          </a>
        </div>
      </section>

      {/* ── 3-YEAR SAVINGS CALCULATOR ── */}
      <section style={{ padding: "60px 24px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h2 className="section-title">Your 3-Year Savings</h2>
        <p className="section-subtitle">What you pay now vs what you&apos;ll pay with Vitharn</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 32 }}>
          <div style={{ background: "white", border: "1px solid rgba(42,19,5,0.10)", borderRadius: 12, padding: "24px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7A5030", marginBottom: 12 }}>If you pay ₹3,000/mo now</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#d97706", marginBottom: 4 }}>₹1,08,000</div>
            <div style={{ fontSize: 13, color: "#7A5030" }}>3-year cost (current)</div>
          </div>
          <div style={{ background: "white", border: "2px solid #EA580C", borderRadius: 12, padding: "24px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#EA580C", marginBottom: 12 }}>Vitharn Growth</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#16a34a", marginBottom: 4 }}>₹35,000</div>
            <div style={{ fontSize: 13, color: "#7A5030" }}>one-time payment</div>
          </div>
          <div style={{ background: "#FFF3E6", border: "1px solid rgba(238,88,12,0.15)", borderRadius: 12, padding: "24px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#EA580C", marginBottom: 12 }}>You Save</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#16a34a", marginBottom: 4 }}>₹73,000</div>
            <div style={{ fontSize: 13, color: "#7A5030" }}>over 3 years</div>
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ── */}
      <section style={{ padding: "0 24px 60px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
          {[
            { icon: "✓", label: "Data Portability Guarantee", desc: "Export your data anytime in Tally XML or Excel" },
            { icon: "✓", label: "Tally XML Export", desc: "Seamless migration from Tally" },
            { icon: "✓", label: "24/7 WhatsApp Support", desc: "Direct help, not a ticket queue" },
            { icon: "✓", label: "No Lock-in", desc: "Your data, always yours" },
          ].map((badge, i) => (
            <div key={i} style={{
              background: "white",
              border: "1px solid rgba(42,19,5,0.10)",
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 240,
              flex: "1 1 240px",
            }}>
              <div style={{ width: 32, height: 32, background: "rgba(22, 163, 74, 0.1)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {badge.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A0A00" }}>{badge.label}</div>
                <div style={{ fontSize: 12, color: "#7A5030" }}>{badge.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

{/* Upgrade note */}
      <div className="pricing-note">
        <p>
          <strong>Start with any plan. Upgrade anytime.</strong> Move from Starter to Enterprise as your
          business grows — only the price difference is charged. Your data always transfers seamlessly.
        </p>
      </div>
      <p className="upi-line">Payment via UPI: 6304562779@nyes</p>

      {/* ── FAQ ── */}
      <section className="pricing-faq" id="faq">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <p className="section-subtitle">Got questions? We&apos;ve got answers.</p>
        <div className="faq-grid-modern">
          <div className="faq-item-modern">
            <h3>Is this a subscription or one-time?</h3>
            <p>Strictly one-time for the first 25 clients. Pay once, no recurring fees. After the first 25 clients, plans switch to monthly subscription.</p>
          </div>
          <div className="faq-item-modern">
            <h3>How is this better than Tally or Excel?</h3>
            <p>Tally is for accountants. Vitharn is built for UPVC fabricators — with WhatsApp sharing, a customer webpage, and review tools Tally doesn&apos;t have.</p>
          </div>
          <div className="faq-item-modern">
            <h3>What about software updates?</h3>
            <p>All updates are free for 1 year. After that, optional ₹5,000/year for continued updates.</p>
          </div>
          <div className="faq-item-modern">
            <h3>Can I try before buying?</h3>
            <p>Yes — 7-day free trial with full features. No card required. Setup takes under 24 hours.</p>
          </div>
          <div className="faq-item-modern">
            <h3>Do you support GST invoicing?</h3>
            <p>Fully. Vitharn handles GST invoicing on all plans. We are not registered for GST (annual turnover is below the ₹20 lakh threshold under Section 22 of the CGST Act). No GST is included in the price.</p>
          </div>
          <div className="faq-item-modern">
            <h3>Do I need internet?</h3>
            <p>Most plans require internet for cloud sync. But our ₹10,000 offline plan works fully without internet — data syncs when you&apos;re back online.</p>
          </div>
          <div className="faq-item-modern">
            <h3>What if Vitharn shuts down?</h3>
            <p>Your data is yours forever. Export everything anytime in standard formats (CSV, Excel, PDF, Tally XML). We also offer source code escrow for Enterprise clients — if we cease operations, you get the full source code.</p>
          </div>
          <div className="faq-item-modern">
            <h3>Can I get a refund?</h3>
            <p>Yes — 7-day money-back guarantee, no questions asked.</p>
          </div>
          <div className="faq-item-modern">
            <h3>Do you own my data?</h3>
            <p>No. You own 100% of your data. We never sell, share, or monetize it. This is legally guaranteed in our contract.</p>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-banner">
        <div className="cta-content">
          <div className="cta-badge">
            <Zap size={11} /> Ready when you are
          </div>
          <h2 className="cta-title">
            Start with any plan.<br />
            <span className="muted">Upgrade as you grow.</span>
          </h2>
          <p className="cta-sub">
            Move from Starter to Enterprise as your business grows — only the price difference is charged.
            Your data always transfers seamlessly.
          </p>
          <div className="btn-group btn-group-center">
            <a href="mailto:vitarn.dev@gmail.com" className="btn-download" id="ctaContactBtn">
              <ArrowRight size={18} /> Contact Us
            </a>
            <a href="tel:+919705146471" className="btn-webapp btn-webapp--light" id="ctaCallBtn">
              📞 Call Us
            </a>
            <a href="/upvc/login" className="btn-webapp btn-webapp--light" id="ctaTrialBtn">
              Start 7-Day Free Trial
            </a>
          </div>
        </div>
      </section>

      <footer>
        <p>© 2026 Vitharn ERP Services — Sole Proprietorship, Hyderabad. Built by Aadi.</p>
        <p className="footer-links">
          <a href="/privacy" className="footer-link">Privacy Policy</a>{" "}
          ·{" "}
          <a href="/terms" className="footer-link">Terms of Service</a>{" "}
          ·{" "}
          <a href="/refund-policy" className="footer-link">Refund Policy</a>{" "}
          ·{" "}
          <a href="/sla" className="footer-link">SLA</a>{" "}
          ·{" "}
          <a href="/upvc/changelog" className="footer-link">What&apos;s New</a>{" "}
          ·{" "}
          <a href="mailto:vitarn.dev@gmail.com" className="footer-link">Contact</a>
        </p>
        <p className="footer-fine-print">
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Vyapar, myBillBook, Google, or any other company mentioned.
        </p>
        <p className="footer-fine-print">
          Payment via UPI: 6304562779@nyes
        </p>
      </footer>
    </>
  );
}
