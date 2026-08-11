"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  Globe,
  Smartphone,
  Users,
  CheckCircle,
} from "lucide-react";
import "./upvc-web.css";

const APK_URL =
  "https://gumpmnbjdtzajhysnnaz.supabase.co/storage/v1/object/public/app-releases/KPR_Upvc.apk";

export default function Home() {
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
            alt="Vitharn UPVC"
          />
          <span className="logo-text">Vitharn UPVC</span>
        </div>

        {/* Desktop Nav */}
        <nav>
          <a href="#features">Features</a>
          <a href="#app-purpose">Application Purpose</a>
          <a href="#how-it-works">How It Works</a>
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
        <a href="#features" onClick={closeMobileMenu}>Features</a>
        <a href="#app-purpose" onClick={closeMobileMenu}>Application Purpose</a>
        <a href="#how-it-works" onClick={closeMobileMenu}>How It Works</a>
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

      {/* â”€â”€ HERO â”€â”€ */}
      <section className="hero vitharn-grid">
        <div className="hero-content">
          <div className="hero-pills">
            <span className="pill">Quotations</span>
            <span className="pill">WhatsApp</span>
            <span className="pill">Invoicing</span>
            <span className="pill">Website</span>
          </div>
          <h1 className="hero-title">
            Vitharn UPVC
          </h1>
          <p className="hero-subtitle">
            Create professional quotations in seconds, manage customers, and get your own business website. Built specifically for UPVC window and door shops. One-time payment. No monthly fees. Set up in 24 hours.
          </p>
          <p className="hero-note">
            We use Google Sign-In purely for secure login. When you choose to sign in with Google, the only information we receive is your email address and name. We do not access your emails, Google Drive, YouTube, or any other Google service. We do not share your information with anyone.{" "}
            <a href="/privacy" className="hero-note-link">
              Read our Privacy Policy
            </a>
          </p>
          <div className="btn-group">
            <a href="/login" className="btn-download" id="heroTrialBtn">
              <ArrowRight size={20} /> Start Free Trial →
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
              <div className="stat-num">24</div>
              <div className="stat-lbl">Hour Setup</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">100%</div>
              <div className="stat-lbl">Data Export</div>
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€ APP PURPOSE & OAUTH DISCLOSURE â”€â”€ */}
      <section className="features" id="app-purpose" style={{ paddingBottom: 0 }}>
        <div style={{ background: "white", padding: 36, borderRadius: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.04)", border: "1px solid #e2e8f0" }}>
          <h2 className="section-title" style={{ textAlign: "left", fontSize: 24, marginBottom: 16, color: "#0f172a" }}>
            What Vitharn UPVC does — and how we keep your account safe
          </h2>
          <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
            Vitharn UPVC is a business management tool built specifically for UPVC window and door fabricators. It helps you generate accurate, branded quotations using your exact dimensions, calculate square footage and GST automatically, share quotes over WhatsApp, and manage your customer records — all from one place. Every business on Vitharn UPVC also gets its own branded marketing website and a customer portal where buyers can view quotes and request work.
          </p>
          <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.6 }}>
            We use Google Sign-In purely for secure login. When you choose to sign in with Google, the only information we receive is your email address and name. We do not access your emails, Google Drive, YouTube, or any other Google service. We do not share your information with anyone. Your business data stays yours.
          </p>
        </div>
      </section>

      {/* â”€â”€ FEATURES â”€â”€ */}
      <section className="features" id="features">
        <h2 className="section-title">Everything your UPVC business needs</h2>
        <p className="section-subtitle">
          One platform. One-time payment. Built for UPVC fabricators, not accountants.
        </p>
        <div className="features-grid features-grid--4">
          <div className="feature-card">
            <FileText className="feature-icon-svg" />
            <h3 className="feature-title">Instant Branded Quotations</h3>
            <p>
              Enter exact millimetre dimensions and Vitharn UPVC auto-calculates square footage, transport charges, and GST. Generate a clean, logo-branded PDF quotation in seconds â€” ready to print, email, or WhatsApp to your customer. No more handwritten quotes. No more calculator mistakes.
            </p>
          </div>
          <div className="feature-card">
            <Globe className="feature-icon-svg" />
            <h3 className="feature-title">Your Own Business Website</h3>
            <p>
              Every business on Vitharn UPVC gets a dedicated, SEO-friendly marketing website showcasing your services, project gallery, and contact details. Look established online. Get found on Google.
            </p>
          </div>
          <div className="feature-card">
            <Users className="feature-icon-svg" />
            <h3 className="feature-title">Dedicated Customer Portal</h3>
            <p>
              Your customers get their own login to a branded portal where they can view quotations, check order status, and request new work. It builds trust and makes your shop look professional.
            </p>
          </div>
          <div className="feature-card">
            <Smartphone className="feature-icon-svg" />
            <h3 className="feature-title">Web &amp; Android, Anywhere</h3>
            <p>
              Manage your business from your desk using the web dashboard, or from your phone with the Android app. Create quotes on-site, check customer records between jobs. Everything syncs to the cloud in real time.
            </p>
          </div>
        </div>
      </section>

      {/* â”€â”€ HOW IT WORKS â”€â”€ */}
      <section className="docs" id="how-it-works">
        <div className="docs-content">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle" style={{ textAlign: "center", marginBottom: 48 }}>
            Getting your business on the platform is simple. We handle the
            setup â€” you just start quoting.
          </p>

          <div className="doc-step">
            <div className="doc-step-number">01</div>
            <div>
              <h3>We Configure Your Account</h3>
              <p>
                Send us your company name, logo, brand colours, GST number, and pricing. We set up your entire account â€” fully branded to your business â€” within 24 hours. No technical skills needed. No software to install.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">02</div>
            <div>
              <h3>Your Platform Goes Live</h3>
              <p>
                The moment your account is ready, your marketing website and customer portal go live on the internet. Share your link with customers immediately â€” on WhatsApp, business cards, or word of mouth.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">03</div>
            <div>
              <h3>Manage &amp; Quote Anywhere</h3>
              <p>
                Log in to the web dashboard or Android app using your Google account. Start creating professional quotations, managing customer records, and sending branded PDFs â€” all from one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€ CTA BANNER â”€â”€ */}
      <section className="cta-banner">
        <div className="cta-content">
          <h2 className="cta-title">Ready to take your UPVC business online?</h2>
          <p className="cta-sub">
            Join fabricators across India using Vitharn UPVC to look professional, quote faster, and manage customers â€” all from one platform.
          </p>
          <div className="btn-group" style={{ justifyContent: "center" }}>
            <a href="/login" className="btn-download" id="ctaLoginBtn">
              <ArrowRight size={20} /> Start Your Free Trial →
            </a>
            <a href="/upvc/pricing" className="btn-webapp btn-webapp--light" id="ctaPricingBtn">
              View Pricing
            </a>
          </div>
          <ul className="cta-checks">
            <li><CheckCircle size={16} /> 7-day free trial</li>
            <li><CheckCircle size={16} /> No credit card needed</li>
            <li><CheckCircle size={16} /> One-time payment</li>
            <li><CheckCircle size={16} /> No monthly fees</li>
            <li><CheckCircle size={16} /> Setup in 24 hours</li>
            <li><CheckCircle size={16} /> We do it for you</li>
          </ul>
        </div>
      </section>

      <footer>
        <p>Â© 2026 Vitharn ERP Services. Built by Aadi in Hyderabad.</p>
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href="/privacy" className="footer-link">
            Privacy Policy
          </a>{" "}
          Â·{" "}
          <a href="/terms" className="footer-link">
            Terms of Service
          </a>{" "}
          Â·{" "}
          <a href="/upvc/pricing" className="footer-link">
            Pricing
          </a>{" "}
          Â·{" "}
          <a href="mailto:vitarn.dev@gmail.com" className="footer-link">
            Contact
          </a>
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
          Vitharn is an independent sole proprietorship. Not affiliated with Tally Solutions, Google, or any other company mentioned.
        </p>
      </footer>
    </>
  );
}
