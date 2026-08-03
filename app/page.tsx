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
import "./landing.css";

const APK_URL =
  "https://effxrwrbsjduvhmorvrq.supabase.co/storage/v1/object/public/app-releases/Venkateshwara_UPVC.apk";

export default function Home() {
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerHref, setCustomerHref] = useState("/login");
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
          <span className="logo-text">vitharn upvc</span>
        </div>

        {/* Desktop Nav */}
        <nav>
          <a href="#features">Features</a>
          <a href="#app-purpose">Application Purpose</a>
          <a href="#how-it-works">How It Works</a>
          {isCustomer && (
            <a
              href={customerHref}
              className="btn-nav-webapp"
              id="navWebAppBtn"
              style={{ display: "inline-flex" }}
            >
              Open Web App
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
        {isCustomer && (
          <a
            href={customerHref}
            className="btn-nav-webapp"
            id="mobileWebAppBtn"
            onClick={closeMobileMenu}
          >
            Open Web App
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

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            vitharn upvc
          </h1>
          <p className="hero-subtitle">
            <strong>vitharn upvc</strong> is an end-to-end quotation, catalog, and business management application designed for UPVC window and door manufacturers, dealers, and customers to generate accurate estimations, manage orders, and access personalized client portals.
          </p>
          <p className="hero-note">
            Sign in with Google is used strictly to verify your identity and grant access to your account and saved quotations. We never access unneeded data, sell, or share your information.{" "}
            <a href="/privacy" style={{ color: "#6366f1" }}>
              Read our Privacy Policy
            </a>
            .
          </p>
          <div className="btn-group">
            {isCustomer ? (
              <a href={customerHref} className="btn-download" id="heroWebAppBtn">
                <Globe size={20} /> Open Web App
              </a>
            ) : (
              <a href="/login" className="btn-download" id="heroLoginBtn">
                <ArrowRight size={20} /> Go to Portal
              </a>
            )}
            <a href={loggedIn ? APK_URL : "/login"} className="btn-webapp" id="downloadBtn">
              <Download size={20} /> Android App
            </a>
          </div>
        </div>
      </section>

      {/* ── APP PURPOSE & OAUTH DISCLOSURE ── */}
      <section className="features" id="app-purpose" style={{ paddingBottom: 0 }}>
        <div style={{ background: "white", padding: 36, borderRadius: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.04)", border: "1px solid #e2e8f0" }}>
          <h2 className="section-title" style={{ textAlign: "left", fontSize: 24, marginBottom: 16, color: "#0f172a" }}>
            Application Purpose &amp; Google Sign-In Details
          </h2>
          <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
            <strong>What vitharn upvc does:</strong> The <strong>vitharn upvc</strong> application provides UPVC window and door manufacturers and vendors with instant dimension-based quotation generators, automated SFT &amp; GST tax calculations, branded marketing websites, and secure web and mobile portals.
          </p>
          <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.6 }}>
            <strong>Why we use Google OAuth:</strong> <strong>vitharn upvc</strong> integrates Google Sign-In solely for secure account authentication. When users choose to log in with Google, we request basic profile information (email address and name) to authenticate their access to their registered business profile and saved quotations.
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" id="features">
        <h2 className="section-title">Everything Your Business Needs</h2>
        <p className="section-subtitle">
          One platform, built end-to-end for UPVC shop owners.
        </p>
        <div className="features-grid features-grid--4">
          <div className="feature-card">
            <FileText className="feature-icon-svg" />
            <h3 className="feature-title">Instant Branded Quotations</h3>
            <p>
              Input exact mm dimensions to auto-calculate SFT, transport, and
              18% IGST. Generate clean, logo-branded PDF quotes ready to print
              or email — in seconds.
            </p>
          </div>
          <div className="feature-card">
            <Globe className="feature-icon-svg" />
            <h3 className="feature-title">Your Own Business Website</h3>
            <p>
              Every business on the platform gets a dedicated, SEO-friendly
              marketing website showcasing their services, gallery, and contact
              details — at a clean URL like{" "}
              <span className="feature-inline-code">vitharn.com/akshaya</span>.
            </p>
          </div>
          <div className="feature-card">
            <Users className="feature-icon-svg" />
            <h3 className="feature-title">Dedicated Customer Portal</h3>
            <p>
              Your buyers get their own login to a branded portal where they can
              interact with your business, view their quotes, and request work
              — giving them a professional, trust-building experience.
            </p>
          </div>
          <div className="feature-card">
            <Smartphone className="feature-icon-svg" />
            <h3 className="feature-title">Web &amp; Android, Anywhere</h3>
            <p>
              Manage your business from your desk on the web admin panel or on
              the go with the Android app. Everything syncs to the cloud in
              real time across all your devices.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="docs" id="how-it-works">
        <div className="docs-content">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle" style={{ textAlign: "center", marginBottom: 48 }}>
            Getting your business on the platform is simple. We handle the
            setup — you just start quoting.
          </p>

          <div className="doc-step">
            <div className="doc-step-number">01</div>
            <div>
              <h3>We Configure Your Account</h3>
              <p>
                Our team sets up your business profile with your company name,
                logo, brand colors, GST number, bank details, and admin email.
                Your platform is fully branded to your business from day one.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">02</div>
            <div>
              <h3>Your Platform Goes Live</h3>
              <p>
                The moment your account is ready, your branded marketing website
                and customer portal are live on the internet. Share your link
                with clients immediately — no waiting, no technical setup on
                your end.
              </p>
            </div>
          </div>

          <div className="doc-step">
            <div className="doc-step-number">03</div>
            <div>
              <h3>Manage &amp; Quote Anywhere</h3>
              <p>
                Log in to the web admin or Android app using your registered
                credentials. Start creating professional quotations, managing
                client records, and sending branded PDFs — all from one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-banner">
        <div className="cta-content">
          <h2 className="cta-title">Ready to take your UPVC business online?</h2>
          <p className="cta-sub">
            Get your own branded website, customer portal, and quoting system.
            Reach out to get your business set up on the platform.
          </p>
          <div className="btn-group" style={{ justifyContent: "center" }}>
            <a href="/login" className="btn-download" id="ctaLoginBtn">
              <ArrowRight size={20} /> Go to Portal
            </a>
            <a href={loggedIn ? APK_URL : "/login"} className="btn-webapp btn-webapp--light" id="ctaDownloadBtn">
              <Download size={20} /> Android App
            </a>
          </div>
          <ul className="cta-checks">
            <li><CheckCircle size={16} /> Fully branded to your business</li>
            <li><CheckCircle size={16} /> Your own marketing website</li>
            <li><CheckCircle size={16} /> Web &amp; Android access</li>
            <li><CheckCircle size={16} /> Professional PDF quotations</li>
          </ul>
        </div>
      </section>

      <footer>
        <p>© 2026 Vitharn UPVC Quotation Maker. Crafted by Aadi.</p>
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href="/privacy" style={{ color: "#6366f1" }}>
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/terms" style={{ color: "#6366f1" }}>
            Terms of Service
          </a>
        </p>
      </footer>
    </>
  );
}
