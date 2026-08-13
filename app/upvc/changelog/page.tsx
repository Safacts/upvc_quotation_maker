"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  Download,
  Factory,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import "../upvc-web.css";
import "../pricing/pricing-web.css";

function slugify(s: string) {
  return (s || "")
    .toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const quarters = [
  {
    tag: "2026 · Q3",
    label: "Latest release",
    latest: true,
    note: "Shipped in the latest release — live on your system today.",
    items: [
      {
        icon: ShieldCheck,
        title: "GST compliance guarantee",
        desc: "Every tax invoice now guarantees CGST + SGST = IGST to the last paisa. Auto-detects same-state vs inter-state, applies the correct IGST/CGST/SGST split, and prints your bank and UPI details right on the invoice.",
      },
      {
        icon: Factory,
        title: "Production & factory tools",
        desc: "Orders, production, barcode, shopfloor, and cutting optimization — least-wastage cutting plans. Plus materials & hardware stock, dispatch, and installation tracking. From quote to installed window, all in one system.",
      },
      {
        icon: Users,
        title: "Client portal approval",
        desc: "Clients can review and approve quotations online. No more chasing approvals over the phone — they come back to you in writing.",
      },
      {
        icon: TrendingUp,
        title: "Win/loss analytics",
        desc: "See which quotations win and which ones lose — and why. Know what to price sharper and where your business is actually growing.",
      },
    ],
  },
  {
    tag: "2026 · Q1–Q2",
    label: "Earlier this year",
    latest: false,
    note: "The foundation every new release stands on.",
    items: [
      {
        icon: MessageCircle,
        title: "WhatsApp + PDF + mobile-first",
        desc: "Send quotations on WhatsApp with a tap. Professional PDFs your clients can read anywhere. Works on any phone — no training needed.",
      },
      {
        icon: Download,
        title: "One-click data export",
        desc: "Your data, your ownership. Export all quotations, clients, and reports anytime — CSV, PDF, and Tally-ready XML. Full Data Portability Guarantee (see contract §2.14).",
      },
      {
        icon: Camera,
        title: "Photo capture on quotations",
        desc: "Add site or fabrication photos directly to quotations from your phone. Show the client exactly what they're approving.",
      },
    ],
  },
];

export default function ChangelogPage() {
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
          <a href="/upvc/compare">Compare</a>
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
        <a href="/upvc/compare" onClick={closeMobileMenu}>Compare</a>
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
            <Zap size={11} /> What&apos;s New — Release Notes
          </div>
          <h1 className="hero-title">
            Always improving.<br />
            <em>Every release ships to you automatically.</em>
          </h1>
          <p className="hero-subtitle">
            Every feature below is <strong>live right now</strong> — no roadmap promises, only what&apos;s
            already working in your system.
          </p>
        </div>
      </section>

      {/* INTRO LINE */}
      <div style={{ textAlign: "center", padding: "0 24px", marginTop: 36 }}>
        <p style={{ fontSize: 14, color: "#7A5030", margin: 0 }}>
          New here?{" "}
          <a href="/upvc/compare" style={{ color: "#EA580C", fontWeight: 700, textDecoration: "none" }}>
            See how we compare
          </a>{" "}
          and{" "}
          <a href="/upvc/pricing" style={{ color: "#EA580C", fontWeight: 700, textDecoration: "none" }}>
            our pricing
          </a>
          .
        </p>
      </div>

      {/* TIMELINE */}
      <section style={{ padding: "56px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        {quarters.map((quarter, qi) => (
          <div key={qi} style={{ marginBottom: qi === quarters.length - 1 ? 0 : 80 }}>
            {/* Quarter heading */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 30, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                padding: "8px 14px",
                borderRadius: 50,
                background: quarter.latest
                  ? "linear-gradient(135deg, #EA580C, #d9480f)"
                  : "#FFF3E6",
                color: quarter.latest ? "white" : "#EA580C",
                border: quarter.latest ? "none" : "1px solid rgba(224, 106, 30, 0.25)",
                whiteSpace: "nowrap",
              }}>
                {quarter.tag}
              </span>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#1A0A00", margin: 0, letterSpacing: "-0.03em" }}>
                {quarter.label}
              </h2>
              {quarter.latest && (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#16a34a",
                  padding: "6px 12px",
                  background: "#f0fdf4",
                  borderRadius: 50,
                  border: "1px solid rgba(22, 163, 74, 0.25)",
                  whiteSpace: "nowrap",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                  Just shipped
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: "#7A5030", margin: "-16px 0 28px" }}>{quarter.note}</p>

            {/* Milestone cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {quarter.items.map((item, i) => (
                <div key={i} style={{
                  background: "white",
                  padding: "28px 24px",
                  borderRadius: 16,
                  border: "1px solid rgba(42, 19, 5, 0.10)",
                  boxShadow: "0 2px 20px rgba(26, 10, 0, 0.07)",
                  display: "flex",
                  flexDirection: "column",
                }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    background: "rgba(224, 106, 30, 0.09)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    flexShrink: 0,
                  }}>
                    <item.icon size={20} color="#EA580C" />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A0A00", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: 13.5, color: "#7A5030", lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* LIVING PRODUCT */}
      <section style={{ padding: "0 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{
          background: "linear-gradient(160deg, #FFF3E6 0%, #FFFBF6 100%)",
          border: "1px solid rgba(224, 106, 30, 0.18)",
          borderRadius: 20,
          padding: "36px 32px",
          display: "flex",
          alignItems: "flex-start",
          gap: 20,
        }}>
          <div style={{
            width: 48,
            height: 48,
            background: "rgba(224, 106, 30, 0.10)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Sparkles size={24} color="#EA580C" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1A0A00", marginBottom: 8, letterSpacing: "-0.02em" }}>
              A living product — not a one-time disk.
            </div>
            <p style={{ fontSize: 14, color: "#7A5030", lineHeight: 1.65, margin: 0 }}>
              Buy once, and every release lands on your system automatically. Subscribed clients get every
              release as it ships — the software you get today keeps getting better, at no extra setup and
              no re-training. That&apos;s what owning your business system should feel like.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-banner">
        <div className="cta-content">
          <div className="cta-badge">
            <Zap size={11} /> Ready to grow?
          </div>
          <h2 className="cta-title">
            Every release ships to you.<br />
            <span className="muted">Start with any plan.</span>
          </h2>
          <p className="cta-sub">
            Try it free for 7 days. If your shop likes it, pay once — and own it forever.
          </p>
          <div className="btn-group btn-group-center">
            <a href="/upvc/login" className="btn-download" id="changelogTrialBtn">
              <ArrowRight size={18} /> Start 7-Day Free Trial
            </a>
            <a href="/upvc/pricing" className="btn-webapp btn-webapp--light" id="changelogPricingBtn">
              View Pricing
            </a>
            <a href="tel:+919705146471" className="btn-webapp btn-webapp--light" id="changelogCallBtn">
              Call Us
            </a>
          </div>
          <ul className="cta-checks">
            <li><CheckCircle size={15} /> One-time payment</li>
            <li><CheckCircle size={15} /> No monthly fees</li>
            <li><CheckCircle size={15} /> Every release included</li>
          </ul>
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
          <a href="/upvc/pricing" className="footer-link">Pricing</a>{" "}
          ·{" "}
          <a href="/upvc/compare" className="footer-link">Compare</a>{" "}
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
