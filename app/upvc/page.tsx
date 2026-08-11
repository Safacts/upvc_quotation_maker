"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  Globe,
  Smartphone,
  Users,
  CheckCircle,
  Zap,
} from "lucide-react";
import "./upvc-web.css";

export default function Home() {
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerHref, setCustomerHref] = useState("/upvc/login");
  const [dashboardHref, setDashboardHref] = useState("/upvc/login");
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

    if (session === "active") setLoggedIn(true);

    if (session === "active" && role === "customer") {
      const clientId = localStorage.getItem("portal_client_id");
      if (!clientId) localStorage.clear();
    }

    const clientId = localStorage.getItem("portal_client_id");
    const customer = session === "active" && role === "customer" && !!clientId;
    setIsCustomer(customer);

    if (customer) {
      const target = "/upvc/" + clientId!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="/upvc/pricing">Pricing</a>
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

        {/* Hamburger Button */}
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
        <a href="#features" onClick={closeMobileMenu}>Features</a>
        <a href="#how-it-works" onClick={closeMobileMenu}>How It Works</a>
        <a href="/upvc/pricing" onClick={closeMobileMenu}>Pricing</a>
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

      {/* ── HERO ── */}
      <section className="hero vitharn-grid">
        <div className="hero-content">
          <div className="hero-pills">
            <span className="pill">Quotations</span>
            <span className="pill">WhatsApp</span>
            <span className="pill">Invoicing</span>
            <span className="pill">Business Website</span>
          </div>

          <h1 className="hero-title">
            Run your UPVC business.<br />
            <em>Professionally.</em>
          </h1>

          <p className="hero-subtitle">
            Create branded quotations in seconds, manage customers, and get your own business website.
            Built specifically for UPVC window & door fabricators.{" "}
            <strong>One-time payment. No monthly fees.</strong>
          </p>

          <p className="hero-note">
            We use Google Sign-In purely for secure login. We only receive your email and name —
            nothing else. We do not access your Gmail, Drive, or any Google service.{" "}
            <a href="/privacy" className="hero-note-link">Read our Privacy Policy</a>
          </p>

          <div className="btn-group">
            <a href="/upvc/login" className="btn-download" id="heroTrialBtn">
              <ArrowRight size={18} /> Start Free Trial
            </a>
            <a href="/upvc/pricing" className="btn-webapp" id="heroPricingBtn">
              See Pricing
            </a>
          </div>

          <div className="stats-strip">
            <div className="stat-item">
              <div className="stat-num">₹0</div>
              <div className="stat-lbl">Monthly Fees</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">7</div>
              <div className="stat-lbl">Day Free Trial</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">24h</div>
              <div className="stat-lbl">Setup Time</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">100%</div>
              <div className="stat-lbl">Data Export</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── APP PURPOSE & OAUTH DISCLOSURE ── */}
      <section className="app-purpose-section" id="app-purpose">
        <div className="app-purpose-card">
          <h2>What Vitharn UPVC does — and how we keep your account safe</h2>
          <p>
            Vitharn UPVC is a business management tool built specifically for UPVC window and door fabricators.
            It helps you generate accurate, branded quotations using your exact dimensions, calculate square footage
            and GST automatically, share quotes over WhatsApp, and manage your customer records — all from one place.
            Every business on Vitharn UPVC also gets its own branded marketing website and a customer portal
            where buyers can view quotes and request work.
          </p>
          <p>
            We use Google Sign-In purely for secure login. When you choose to sign in with Google, the only
            information we receive is your email address and name. We do not access your emails, Google Drive,
            YouTube, or any other Google service. We do not share your information with anyone. Your business data stays yours.
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" id="features">
        <h2 className="section-title">Everything your UPVC business needs</h2>
        <p className="section-subtitle">
          One platform. One-time payment. Built for fabricators, not accountants.
        </p>
        <div className="features-grid features-grid--4">
          <div className="feature-card">
            <div className="feature-icon-box">
              <FileText className="feature-icon-svg" />
            </div>
            <span className="feature-tag">Core</span>
            <h3 className="feature-title">Instant Branded Quotations</h3>
            <p>
              Enter millimetre dimensions and Vitharn UPVC auto-calculates square footage, transport charges,
              and GST. Generate a logo-branded PDF in seconds — ready to print, email, or WhatsApp.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-box">
              <Globe className="feature-icon-svg" />
            </div>
            <span className="feature-tag">Web Presence</span>
            <h3 className="feature-title">Your Own Business Website</h3>
            <p>
              Every business gets a dedicated SEO-friendly marketing website showcasing your services,
              project gallery, and contact details. Look established online. Get found on Google.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-box">
              <Users className="feature-icon-svg" />
            </div>
            <span className="feature-tag">Customers</span>
            <h3 className="feature-title">Dedicated Customer Portal</h3>
            <p>
              Your customers get their own login to a branded portal where they can view quotations,
              check order status, and request new work. Builds trust and looks professional.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-box">
              <Smartphone className="feature-icon-svg" />
            </div>
            <span className="feature-tag">Cross-Platform</span>
            <h3 className="feature-title">Web & Android, Anywhere</h3>
            <p>
              Manage from your desk using the web dashboard, or from your phone with the Android app.
              Create quotes on-site, check customer records between jobs. Real-time cloud sync.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="docs" id="how-it-works">
        <div className="docs-content">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle" style={{ textAlign: "center", marginBottom: 48 }}>
            Getting your business on the platform is simple. We handle the setup — you just start quoting.
          </p>

          <div className="doc-step">
            <div className="doc-step-number">01</div>
            <div>
              <h3>We Configure Your Account</h3>
              <p>
                Send us your company name, logo, brand colours, GST number, and pricing. We set up your entire
                account — fully branded to your business — within 24 hours. No technical skills needed.
                No software to install.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">02</div>
            <div>
              <h3>Your Platform Goes Live</h3>
              <p>
                The moment your account is ready, your marketing website and customer portal go live on the internet.
                Share your link with customers immediately — on WhatsApp, business cards, or word of mouth.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">03</div>
            <div>
              <h3>Manage & Quote Anywhere</h3>
              <p>
                Log in to the web dashboard or Android app using your Google account. Start creating professional
                quotations, managing customer records, and sending branded PDFs — all from one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-banner">
        <div className="cta-content">
          <div className="cta-badge">
            <Zap size={11} /> Ready to get started
          </div>
          <h2 className="cta-title">
            Take your UPVC business online.<br />
            <span className="muted">Look professional. Quote faster.</span>
          </h2>
          <p className="cta-sub">
            Join fabricators across India using Vitharn UPVC to look professional,
            quote faster, and manage customers — all from one platform.
          </p>
          <div className="btn-group" style={{ justifyContent: "center" }}>
            <a href="/upvc/login" className="btn-download" id="ctaLoginBtn">
              <ArrowRight size={18} /> Start Your Free Trial
            </a>
            <a href="/upvc/pricing" className="btn-webapp btn-webapp--light" id="ctaPricingBtn">
              View Pricing
            </a>
          </div>
          <ul className="cta-checks">
            <li><CheckCircle size={15} /> 7-day free trial</li>
            <li><CheckCircle size={15} /> No credit card needed</li>
            <li><CheckCircle size={15} /> One-time payment</li>
            <li><CheckCircle size={15} /> No monthly fees</li>
            <li><CheckCircle size={15} /> Setup in 24 hours</li>
            <li><CheckCircle size={15} /> We do it for you</li>
          </ul>
        </div>
      </section>

      <footer>
        <p>© 2026 Vitharn ERP Services. Built by Aadi in Hyderabad.</p>
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href="/privacy" className="footer-link">Privacy Policy</a>{" "}
          ·{" "}
          <a href="/terms" className="footer-link">Terms of Service</a>{" "}
          ·{" "}
          <a href="/upvc/pricing" className="footer-link">Pricing</a>{" "}
          ·{" "}
          <a href="mailto:vitarn.dev@gmail.com" className="footer-link">Contact</a>
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Google, or any other company mentioned.
        </p>
      </footer>
    </>
  );
}
