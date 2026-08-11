"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle, Zap } from "lucide-react";
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
        <span className="urgency-count"> 23 spots left.</span>
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
            <a href="tel:\+919705146471" className="btn-webapp btn-webapp--light" id="ctaCallBtn">
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
          <a href="mailto:vitarn.dev@gmail.com" className="footer-link">Contact</a>
        </p>
        <p className="footer-fine-print">
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Google, or any other company mentioned.
        </p>
        <p className="footer-fine-print">
          Payment via UPI: 6304562779@nyes
        </p>
      </footer>
    </>
  );
}
