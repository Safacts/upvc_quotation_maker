"use client";

import {
  ArrowRight,
  LayoutDashboard,
  Calculator,
  Zap,
  Globe,
  Wrench,
  Sparkles,
} from "lucide-react";
import "./erp.css";

const SERVICES = [
  {
    tag: "Live",
    icon: <LayoutDashboard size={20} />,
    title: "Vitharn UPVC",
    desc: "End-to-end quotation, catalog, and client management built for UPVC window and door manufacturers. Includes Android app and a fully branded web portal.",
    cta: "Open Application",
    href: "/upvc",
    disabled: false,
  },
  {
    tag: "Coming Soon",
    icon: <Calculator size={20} />,
    title: "Vitharn Glass",
    desc: "Specialized dimension, weight, and pricing calculations for commercial and residential glass processing units.",
    cta: "On the Way",
    href: "#",
    disabled: true,
  },
  {
    tag: "Coming Soon",
    icon: <Globe size={20} />,
    title: "Vitharn Retail",
    desc: "Inventory, billing, and customer engagement platform purpose-built for local retail and trading businesses.",
    cta: "On the Way",
    href: "#",
    disabled: true,
  },
  {
    tag: "Coming Soon",
    icon: <Wrench size={20} />,
    title: "Vitharn Workshop",
    desc: "Job-card tracking, spare parts inventory, and customer communication layer for automotive service workshops.",
    cta: "On the Way",
    href: "#",
    disabled: true,
  },
  {
    tag: "Coming Soon",
    icon: <Sparkles size={20} />,
    title: "Vitharn Commerce",
    desc: "White-label e-commerce storefronts with built-in SEO, order management, and payment gateway integration for SMEs.",
    cta: "On the Way",
    href: "#",
    disabled: true,
  },
  {
    tag: "Coming Soon",
    icon: <Zap size={20} />,
    title: "Vitharn Analytics",
    desc: "Cross-product business intelligence dashboards — unify data from all your Vitharn products into one control room.",
    cta: "On the Way",
    href: "#",
    disabled: true,
  },
];

export default function ERPHome() {
  return (
    <div className="vitharn-grid" style={{ background: "#fff", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <nav className="v-nav">
        <div className="v-nav-inner">
          <a href="/" className="v-logo">
            <img src="/logo.png" alt="Vitharn" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            Vitharn ERP
          </a>
          <ul className="v-nav-links">
            <li><a href="#services">Services</a></li>
            <li><a href="#manifesto">About</a></li>
            <li><a href="/upvc/pricing">Pricing</a></li>
            <li><a href="/signup" className="v-nav-cta">Get Started →</a></li>
          </ul>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="v-hero">
        <div className="v-hero-vignette" />

        {/* Ecosystem pills */}
        <div className="v-pills anim-0">
          <span className="v-pill"><LayoutDashboard size={12} /> UPVC</span>
          <span className="v-pill"><Calculator size={12} /> Glass</span>
          <span className="v-pill"><Globe size={12} /> Retail</span>
          <span className="v-pill"><Wrench size={12} /> Workshop</span>
          <span className="v-pill"><Zap size={12} /> Analytics</span>
        </div>

        <h1 className="v-headline anim-1">
          Industry software.<br />
          <span className="muted">Built to last.</span>
        </h1>

        <p className="v-subtext anim-2">
          Vitharn builds vertical-specific ERP tools that transform small shops into modern, digital-first enterprises — fast, focused, and zero fluff.
        </p>

        <div className="v-ctas anim-3">
          <a href="/upvc" className="btn-primary">
            Explore UPVC <ArrowRight size={16} />
          </a>
          <a href="/signup" className="btn-secondary">
            Get Early Access
          </a>
        </div>

        {/* Stats strip */}
        <div className="v-stats anim-4">
          <div className="v-stat">
            <div className="v-stat-num">5+</div>
            <div className="v-stat-label">Industries</div>
          </div>
          <div className="v-stat">
            <div className="v-stat-num">0</div>
            <div className="v-stat-label">Ads</div>
          </div>
          <div className="v-stat">
            <div className="v-stat-num">100%</div>
            <div className="v-stat-label">Custom</div>
          </div>
          <div className="v-stat">
            <div className="v-stat-num">∞</div>
            <div className="v-stat-label">Scale</div>
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM GRID ── */}
      <section style={{ padding: "80px 5%", maxWidth: 1280, margin: "0 auto" }} id="services">
        <h2 className="v-section-title">The Vitharn Ecosystem</h2>
        <p className="v-section-sub">
          One operating system for every industry vertical. Each product is purpose-built, not adapted.
        </p>
        <div className="v-ecosystem-grid">
          {SERVICES.map((s) => (
            <a
              key={s.title}
              href={s.href}
              className={`v-eco-card${s.disabled ? " disabled" : ""}`}
            >
              <div className="v-eco-icon">{s.icon}</div>
              <span className="v-eco-tag">{s.tag}</span>
              <h3 className="v-eco-title">{s.title}</h3>
              <p className="v-eco-desc">{s.desc}</p>
              <div className="v-eco-cta">
                {s.cta}
                <ArrowRight size={12} className="v-eco-arrow" />
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── MANIFESTO STRIP ── */}
      <section className="v-manifesto" id="manifesto">
        <div className="v-manifesto-inner">
          <div className="v-manifesto-badge">
            <Zap size={11} /> The Manifesto
          </div>
          <h2>
            The internet became a billboard.<br />
            <span className="muted">We&apos;re rebuilding it as a utility.</span>
          </h2>
          <div className="v-manifesto-btns">
            <a href="/upvc" className="btn-light">
              Explore UPVC →
            </a>
            <a href="mailto:vitarn.dev@gmail.com" className="btn-outline-light">
              Get in Touch
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="v-footer">
        <span>© 2026 Vitharn ERP Services. All rights reserved.</span>
        <div className="v-footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/upvc">UPVC</a>
          <a href="mailto:vitarn.dev@gmail.com">Contact</a>
        </div>
      </footer>

    </div>
  );
}
