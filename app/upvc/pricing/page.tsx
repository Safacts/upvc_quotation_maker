"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle, Download } from "lucide-react";
import "../upvc-web.css";
import "./pricing-web.css";

const APK_URL = "https://gumpmnbjdtzajhysnnaz.supabase.co/storage/v1/object/public/app-releases/KPR_Upvc.apk";

export default function WebPricingPage() {
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerHref, setCustomerHref] = useState("/login");
  const [dashboardHref, setDashboardHref] = useState("/login");
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  function slugify(s: string) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  useEffect(() => {
    const session = localStorage.getItem("portal_session");
    const role = localStorage.getItem("portal_role");

    if (session === "active") {
      setLoggedIn(true);
    }

    if (session === "active" && role === "customer") {
      const clientId = localStorage.getItem("portal_client_id");
      if (!clientId) {
        localStorage.clear();
      }
    }

    const clientId = localStorage.getItem("portal_client_id");
    const customer = session === "active" && role === "customer" && !!clientId;
    setIsCustomer(customer);

    if (customer) {
      const target =
        "/upvc/" +
        clientId!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      setCustomerHref(target);
      setDashboardHref("/" + slugify(clientId!) + "/home");
    } else if (role === "admin") {
      setDashboardHref("/admin");
    } else if (role === "signup") {
      setDashboardHref("/signup");
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        if (window.scrollY > 10) {
          headerRef.current.classList.add("scrolled");
        } else {
          headerRef.current.classList.remove("scrolled");
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("header") && !target.closest(".mobile-nav")) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header ref={headerRef}>
        <div className="logo-container">
          <img
            src="/logo.png"
            onError={(e) => {
              e.currentTarget.src = "https://placehold.co/100";
            }}
            alt="vitharn upvc"
          />
          <span className="logo-text">Vitharn UPVC</span>
        </div>

        {/* Desktop Nav */}
        <nav>
          <a href="/">Home</a>
          <a href="/#features">Features</a>
          <a href="#faq">FAQ</a>
          <a href="/upvc/pricing/show" target="_blank" rel="noopener noreferrer">View PDF Flyer</a>
          {loggedIn && (
            <a href={dashboardHref} className="btn-nav-dashboard" id="navDashboardBtn">
              Dashboard
            </a>
          )}
          <a
            href={loggedIn ? "/logout" : "/login"}
            className="btn-nav-login"
            id="navPortalLogin"
          >
            {loggedIn ? "Logout" : "Portal Login"}
          </a>
        </nav>

        {/* Hamburger Button */}
        <button
          className={`hamburger${mobileMenuOpen ? " open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* Mobile Nav Drawer */}
      <div className={`mobile-nav${mobileMenuOpen ? " open" : ""}`}>
        <a href="/" onClick={closeMobileMenu}>Home</a>
        <a href="/#features" onClick={closeMobileMenu}>Features</a>
        <a href="#faq" onClick={closeMobileMenu}>FAQ</a>
        <a href="/upvc/pricing/show" onClick={closeMobileMenu} target="_blank" rel="noopener noreferrer">View PDF Flyer</a>
        {loggedIn && (
          <a
            href={dashboardHref}
            className="btn-nav-dashboard"
            id="mobileDashboardBtn"
            onClick={closeMobileMenu}
          >
            Dashboard
          </a>
        )}
        <a
          href={loggedIn ? "/logout" : "/login"}
          className="btn-nav-login"
          id="mobilePortalLogin"
          onClick={closeMobileMenu}
        >
          {loggedIn ? "Logout" : "Portal Login"}
        </a>
      </div>

      <section className="pricing-hero">
        <div className="hero-badge">Pricing Plans — 2026</div>
        <h1 className="hero-title">Simple pricing. <br/> No monthly fees.</h1>
        <p className="hero-subtitle" style={{ margin: "0 auto 20px" }}>
          Built strictly for UPVC fabricators. Pay once and own it forever.
        </p>
      </section>

      <section className="pricing-grid">
        <div className="pricing-card pricing-card--featured">
          <div className="pricing-badge">Sweet Spot</div>
          <div className="pricing-label">Base</div>
          <div className="pricing-price">₹25,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">Small shops (1–5 people) who want digital quotations with cloud backup.</div>
          <ul className="pricing-features">
            <li><CheckCircle /> Cloud sync &amp; web dashboard</li>
            <li><CheckCircle /> GST-compliant invoicing</li>
            <li><CheckCircle /> Customer &amp; product database</li>
            <li><CheckCircle /> Daily cloud backup</li>
            <li><CheckCircle /> Basic analytics</li>
          </ul>
        </div>

        <div className="pricing-card">
          <div className="pricing-label">Next</div>
          <div className="pricing-price">₹35,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">Growing businesses wanting online visibility and customer reviews.</div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Base</li>
            <li><CheckCircle /> SEO-optimized business webpage</li>
            <li><CheckCircle /> Customer star-rating system</li>
            <li><CheckCircle /> Auto review-request emails</li>
            <li><CheckCircle /> Advanced analytics &amp; conversion rates</li>
          </ul>
        </div>

        <div className="pricing-card">
          <div className="pricing-label">Next+</div>
          <div className="pricing-price">₹45,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">Businesses wanting direct customer engagement via WhatsApp.</div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Next</li>
            <li><CheckCircle /> Direct WhatsApp sharing of quotes</li>
            <li><CheckCircle /> Review link sharing via WhatsApp</li>
            <li><CheckCircle /> Product performance analytics</li>
            <li><CheckCircle /> Customer retention metrics</li>
            <li><CheckCircle /> Priority email support</li>
          </ul>
        </div>

        <div className="pricing-card">
          <div className="pricing-label">Final</div>
          <div className="pricing-price">₹55,000<sub>&nbsp;one-time</sub></div>
          <div className="pricing-desc">Full-service businesses who want complete automation and financial control.</div>
          <ul className="pricing-features">
            <li><CheckCircle /> Everything in Next+</li>
            <li><CheckCircle /> Desktop web console (split-view editor)</li>
            <li><CheckCircle /> Keyboard shortcuts — Tally-style speed</li>
            <li><CheckCircle /> Payment tracking: who paid, who owes</li>
            <li><CheckCircle /> GST reports, sales register, customer ledger</li>
            <li><CheckCircle /> WhatsApp + email priority support</li>
          </ul>
        </div>
      </section>

      <section className="pricing-faq" id="faq">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <p className="section-subtitle">Got questions? We&apos;ve got answers.</p>
        <div className="faq-grid-modern">
          <div className="faq-item-modern">
            <h4>Is this a subscription or one-time?</h4>
            <p>Strictly one-time. No monthly fees, ever. Your software works as long as you need it.</p>
          </div>
          <div className="faq-item-modern">
            <h4>How is this better than Tally or Excel?</h4>
            <p>Tally is for accountants. Vitharn is built for UPVC fabricators — with WhatsApp sharing, a customer webpage, and review tools Tally doesn&apos;t have.</p>
          </div>
          <div className="faq-item-modern">
            <h4>What about software updates?</h4>
            <p>All updates are free for 1 year. After that, optional ₹5,000/year for continued updates.</p>
          </div>
          <div className="faq-item-modern">
            <h4>Can I try before buying?</h4>
            <p>Yes — 7-day free trial with full features. No card required. Setup takes under 24 hours.</p>
          </div>
          <div className="faq-item-modern">
            <h4>Do you support GST invoicing?</h4>
            <p>Fully. Vitharn handles GST invoicing on all plans. We currently don&apos;t charge GST on our software.</p>
          </div>
          <div className="faq-item-modern">
            <h4>Do I need internet to use it?</h4>
            <p>Yes. All plans require internet for cloud sync and dashboard access.</p>
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <div className="cta-content">
          <h2 className="cta-title">Start with any plan. Upgrade anytime.</h2>
          <p className="cta-sub">
            Move from Base to Final as your business grows — only the price difference is charged. Your data always transfers seamlessly.
          </p>
          <div className="btn-group" style={{ justifyContent: "center" }}>
            <a href="mailto:vitarn.dev@gmail.com" className="btn-download" id="ctaContactBtn">
              <ArrowRight size={20} /> Contact Sales →
            </a>
          </div>
        </div>
      </section>

      <footer>
        <p>© 2026 Vitharn ERP Services. Built by Aadi in Hyderabad.</p>
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href="/privacy" style={{ color: "#6366f1" }}>
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/terms" style={{ color: "#6366f1" }}>
            Terms of Service
          </a>{" "}
          ·{" "}
          <a href="mailto:vitarn.dev@gmail.com" style={{ color: "#6366f1" }}>
            Contact
          </a>
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "#8a7a6a" }}>
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Google, or any other company mentioned.
        </p>
      </footer>
    </>
  );
}
