"use client";

import "./venkateshwara.css";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  VolumeX,
  Wind,
  Layers,
  Sparkles,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Calculator,
  Compass,
  Award,
  ChevronRight,
  Lock,
  Building2,
  Send,
  Star,
  Grid
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props {
  client: any;
  slug: string;
}

function cityFromAddress(addr: string): string {
  const parts = (addr || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pick = parts
    .slice(-2)
    .map((p) => p.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return pick[0] || "Hyderabad";
}

function serviceAreaFromAddress(addr: string): string {
  const parts = (addr || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pick = parts
    .slice(-2)
    .map((p) => p.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return pick.length ? pick.join(", ") : "Hyderabad, Telangana";
}

export default function MarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);

  // Business Meta
  const brandName = cfg.companyName || cfg.appName || "UPVC Windows & Doors";
  const proprietor = cfg.companyProprietor || "Authorized Fabricator";
  const phone = cfg.companyContact || "+91 99890 28453";
  const email = cfg.companyEmail || "info@vitharn.com";
  const address = cfg.companyAddress || "Hyderabad, Telangana, India";
  const city = cityFromAddress(address);
  const serviceArea = serviceAreaFromAddress(address);
  const logoUrl = cfg.logoUrl;
  const logoInitial = (brandName || "U").trim().charAt(0).toUpperCase();

  const rawWhatsapp = phone.replace(/\D/g, "");
  const whatsappNum = rawWhatsapp.length === 10 ? `91${rawWhatsapp}` : (rawWhatsapp || "919989028453");

  // Header Scroll State
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Calculator State
  const [calcType, setCalcType] = useState<"sliding" | "casement" | "villa" | "french">("sliding");
  const [calcWidth, setCalcWidth] = useState<number>(5);
  const [calcHeight, setCalcHeight] = useState<number>(4);
  const [calcGlass, setCalcGlass] = useState<"single" | "dgu" | "tinted">("single");
  const [calcMesh, setCalcMesh] = useState<boolean>(true);

  // Price Calculation Logic
  const sqft = Math.max(1, Math.round(calcWidth * calcHeight * 10) / 10);
  let baseRatePerSqft = 450;
  if (calcType === "sliding") baseRatePerSqft = 480;
  if (calcType === "casement") baseRatePerSqft = 560;
  if (calcType === "villa") baseRatePerSqft = 680;
  if (calcType === "french") baseRatePerSqft = 620;

  if (calcGlass === "dgu") baseRatePerSqft += 140;
  if (calcGlass === "tinted") baseRatePerSqft += 60;
  if (calcMesh) baseRatePerSqft += 80;

  const minTotal = Math.round(sqft * baseRatePerSqft);
  const maxTotal = Math.round(sqft * (baseRatePerSqft + 90));

  const whatsappQuoteMsg = encodeURIComponent(
    `Hello ${proprietor}! I visited your ${brandName} website and calculated an estimate for:\n\n` +
    `• Type: ${calcType.toUpperCase()} Windows/Doors\n` +
    `• Dimensions: ${calcWidth} ft (W) × ${calcHeight} ft (H) = ${sqft} Sq.Ft\n` +
    `• Glass: ${calcGlass.toUpperCase()} Glazing\n` +
    `• Insect Mesh: ${calcMesh ? "Yes (SS304)" : "No"}\n` +
    `• Estimated Range: ₹${minTotal.toLocaleString("en-IN")} - ₹${maxTotal.toLocaleString("en-IN")}\n\n` +
    `Please arrange a free site measurement and final quotation.`
  );

  // Form State
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formType, setFormType] = useState("Sliding Windows");
  const [formSent, setFormSent] = useState(false);

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPhone) return;
    const msg = encodeURIComponent(
      `Hi ${proprietor}! I would like to request a Free Site Measurement:\n\n` +
      `• Name: ${formName || "Homeowner"}\n` +
      `• Phone: ${formPhone}\n` +
      `• Location/Area: ${formArea || city}\n` +
      `• Requirements: ${formType}\n\n` +
      `Please contact me to schedule a visit.`
    );
    window.open(`https://wa.me/${whatsappNum}?text=${msg}`, "_blank");
    setFormSent(true);
  };

  return (
    <div className="venkateshwara-root">
      <div className="v-bg-mesh" />
      <div className="v-grid-overlay" />

      {/* Top Banner */}
      <div className="v-topbar">
        <div className="v-container">
          <div className="v-topbar-inner">
            <div className="v-topbar-left">
              <span className="v-badge-pill">
                <Sparkles size={12} /> {city.toUpperCase()}'S PREMIER UPVC FABRICATOR
              </span>
              <span>10+ Years Trust • 10-Year Profile Warranty • German Hardware</span>
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <a href={`tel:${phone.replace(/\s+/g, "")}`} style={{ color: "#fff", display: "flex", alignItems: "center", gap: "6px", textDecoration: "none", fontWeight: 600 }}>
                <Phone size={13} color="#00d2ff" /> {phone}
              </a>
              <a href={`/${slug}/home`} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "12px", borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: "14px" }}>
                Client Portal
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Sticky Navigation */}
      <header className={`v-header ${scrolled ? "scrolled" : ""}`}>
        <div className="v-container">
          <div className="v-header-inner">
            <a href="#hero" className="v-logo-brand">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandName}
                  style={{ height: "42px", width: "auto", objectFit: "contain", borderRadius: "8px", background: "#fff", padding: "4px" }}
                />
              ) : (
                <div className="v-logo-emblem">{logoInitial}</div>
              )}
              <div className="v-logo-text">
                <h1>{brandName.toUpperCase()}</h1>
                <p>PREMIUM UPVC WINDOWS & DOORS</p>
              </div>
            </a>

            <nav className="v-nav-menu">
              <a href="#products" className="v-nav-link">Products</a>
              <a href="#calculator" className="v-nav-link">Estimate Calculator</a>
              <a href="#engineering" className="v-nav-link">German Engineering</a>
              <a href="#soundproofing" className="v-nav-link">Acoustic Shield</a>
              <a href="#process" className="v-nav-link">Installation Process</a>
              <a href="#reviews" className="v-nav-link">Reviews</a>
            </nav>

            <div className="v-header-actions">
              <a
                href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}! I am looking for UPVC windows/doors for my home in ${city}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="v-btn-primary v-btn-whatsapp"
              >
                <MessageCircle size={16} /> WhatsApp Quote
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" className="v-hero">
        <div className="v-container">
          <div className="v-hero-grid">
            <motion.div
              className="v-hero-content"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="v-hero-badge">
                <Shield size={14} /> Certified 100% Lead-Free Multi-Chamber Profiles
              </div>
              <h1 className="v-hero-title">
                Engineered For <span className="highlight">Silence.</span><br />
                Crafted For A Lifetime.
              </h1>
              <p className="v-hero-desc">
                {city}’s premier custom manufacturer of soundproof, rainproof & energy-efficient UPVC windows and doors. Designed for extreme monsoon durability and zero maintenance.
              </p>

              <div className="v-hero-cta">
                <a href="#calculator" className="v-btn-primary">
                  <Calculator size={17} /> Instant Price Calculator <ArrowRight size={16} />
                </a>
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="v-btn-secondary">
                  <Phone size={16} /> Call {proprietor}
                </a>
              </div>

              <div className="v-hero-stats">
                <div className="v-stat-item">
                  <h3>10<span>+</span></h3>
                  <p>Years Experience in {city}</p>
                </div>
                <div className="v-stat-item">
                  <h3>500<span>+</span></h3>
                  <p>Homes & Villas Glazed</p>
                </div>
                <div className="v-stat-item">
                  <h3>10<span>Yr</span></h3>
                  <p>Comprehensive Warranty</p>
                </div>
              </div>
            </motion.div>

            {/* Hero Interactive Showcase Card */}
            <motion.div
              className="v-hero-card-preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="v-hero-card-header">
                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#00d2ff", fontWeight: 700, letterSpacing: "0.1em" }}>FACTORY SPECIFICATION</span>
                  <h3 style={{ margin: "4px 0 0", fontSize: "19px", color: "#fff" }}>Heavy-Duty UPVC Standard</h3>
                </div>
                <div className="v-badge-pill" style={{ background: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.4)", color: "#34d399" }}>
                  <CheckCircle2 size={12} /> In Stock
                </div>
              </div>

              <div className="v-spec-item">
                <div className="v-spec-icon"><VolumeX size={18} /></div>
                <div className="v-spec-text">
                  <h4>35dB+ Acoustic Cancellation</h4>
                  <p>Double Glazed DGU glass blocks heavy traffic & city noise</p>
                </div>
              </div>

              <div className="v-spec-item">
                <div className="v-spec-icon"><Shield size={18} /></div>
                <div className="v-spec-text">
                  <h4>Galvanized Steel Reinforcement</h4>
                  <p>1.5mm thick internal steel core prevents bending & sagging</p>
                </div>
              </div>

              <div className="v-spec-item">
                <div className="v-spec-icon"><Wind size={18} /></div>
                <div className="v-spec-text">
                  <h4>100% Monsoon Water-Tightness</h4>
                  <p>EPDM co-extruded gaskets completely stop rain seepage</p>
                </div>
              </div>

              <div className="v-spec-item">
                <div className="v-spec-icon"><Lock size={18} /></div>
                <div className="v-spec-text">
                  <h4>Multi-Point European Locking</h4>
                  <p>High-security anti-burglary locks with key & shootbolts</p>
                </div>
              </div>

              <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--v-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>Free {city} Measurement</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#00d2ff" }}>Within 24 Hours</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Interactive Price Estimator / Quote Calculator */}
      <section id="calculator" className="v-section v-section-alt">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">Transparent Pricing</span>
            <h2 className="v-section-title">Instant Window & Door Cost Estimator</h2>
            <p className="v-section-desc">
              Get an accurate estimate for your home or villa in 10 seconds. Select your specifications below and directly send the blueprint to {proprietor} for fabrication.
            </p>
          </div>

          <div className="v-calc-card">
            <div className="v-calc-grid">
              <div>
                <div className="v-calc-section-title">
                  <Sliders size={16} /> 1. Select Opening Style
                </div>
                <div className="v-calc-type-selector">
                  <button
                    type="button"
                    className={`v-type-btn ${calcType === "sliding" ? "active" : ""}`}
                    onClick={() => setCalcType("sliding")}
                  >
                    <Grid size={20} />
                    <span>Sliding Window</span>
                  </button>
                  <button
                    type="button"
                    className={`v-type-btn ${calcType === "casement" ? "active" : ""}`}
                    onClick={() => setCalcType("casement")}
                  >
                    <Compass size={20} />
                    <span>Openable Casement</span>
                  </button>
                  <button
                    type="button"
                    className={`v-type-btn ${calcType === "villa" ? "active" : ""}`}
                    onClick={() => setCalcType("villa")}
                  >
                    <Shield size={20} />
                    <span>Villa (Grill+Mesh)</span>
                  </button>
                  <button
                    type="button"
                    className={`v-type-btn ${calcType === "french" ? "active" : ""}`}
                    onClick={() => setCalcType("french")}
                  >
                    <Building2 size={20} />
                    <span>French Balcony Door</span>
                  </button>
                </div>

                <div className="v-calc-section-title">
                  <Compass size={16} /> 2. Dimensions (Feet)
                </div>
                <div className="v-input-row">
                  <div className="v-input-group">
                    <label>Width (Feet): {calcWidth} ft</label>
                    <input
                      type="range"
                      min="2"
                      max="14"
                      step="0.5"
                      value={calcWidth}
                      onChange={(e) => setCalcWidth(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "#00d2ff" }}
                    />
                  </div>
                  <div className="v-input-group">
                    <label>Height (Feet): {calcHeight} ft</label>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      step="0.5"
                      value={calcHeight}
                      onChange={(e) => setCalcHeight(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "#00d2ff" }}
                    />
                  </div>
                </div>

                <div className="v-calc-section-title">
                  <Sparkles size={16} /> 3. Glass & Mesh Options
                </div>
                <div className="v-input-row">
                  <div className="v-input-group">
                    <label>Glass Selection</label>
                    <select
                      className="v-input-control"
                      value={calcGlass}
                      onChange={(e) => setCalcGlass(e.target.value as any)}
                    >
                      <option value="single">5mm Toughened Clear Glass</option>
                      <option value="dgu">12mm Double Glazed (Soundproof DGU)</option>
                      <option value="tinted">Sun-Control Tinted / Frosted Glass</option>
                    </select>
                  </div>
                  <div className="v-input-group">
                    <label>SS304 Mosquito Mesh</label>
                    <select
                      className="v-input-control"
                      value={calcMesh ? "yes" : "no"}
                      onChange={(e) => setCalcMesh(e.target.value === "yes")}
                    >
                      <option value="yes">Include SS304 Mosquito Mesh</option>
                      <option value="no">Without Insect Mesh</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Calculator Summary Panel */}
              <div className="v-calc-summary-panel">
                <div>
                  <h4 style={{ margin: "0 0 16px", fontSize: "16px", color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Calculated Summary
                  </h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Total Area:</span>
                    <strong style={{ color: "#fff" }}>{sqft} Sq.Ft</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Style:</span>
                    <strong style={{ color: "#00d2ff" }}>{calcType.toUpperCase()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Hardware:</span>
                    <strong style={{ color: "#fff" }}>Multi-Point German</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "16px" }}>
                    <span>Reinforcement:</span>
                    <strong style={{ color: "#fff" }}>1.5mm GI Steel</strong>
                  </div>
                </div>

                <div className="v-calc-total-box">
                  <div className="lbl">Estimated Price Range</div>
                  <div className="price-range">
                    ₹{minTotal.toLocaleString("en-IN")} - ₹{maxTotal.toLocaleString("en-IN")}
                  </div>
                  <div className="disclaimer">
                    Includes fabrication, high-grade hardware & delivery in {city}.
                  </div>
                </div>

                <a
                  href={`https://wa.me/${whatsappNum}?text=${whatsappQuoteMsg}`}
                  target="_blank"
                  rel="noreferrer"
                  className="v-btn-primary v-btn-whatsapp"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <MessageCircle size={16} /> WhatsApp This Quote to {proprietor}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Spectrum */}
      <section id="products" className="v-section">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">Complete Product Range</span>
            <h2 className="v-section-title">Architectural Systems Built for {city}</h2>
            <p className="v-section-desc">
              Every window and door is fabricated using calibrated machinery with high-precision steel reinforcement and seamless multi-chamber thermal fusion.
            </p>
          </div>

          <div className="v-product-grid">
            {/* 1. Sliding */}
            <div className="v-product-card">
              <span className="v-product-badge">Top Seller</span>
              <div className="v-product-icon-wrap"><Grid size={28} /></div>
              <h3>2 & 3-Track Sliding Systems</h3>
              <p>
                Space-efficient gliding panels on smooth nylon tracks. Ideal for living room balconies, wide bedroom windows, and outdoor garden access.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> Integrated SS304 mosquito mesh track</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Heavy-duty brass/nylon tandem rollers</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Wool-pile dust and weather barrier</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for 2/3 Track Sliding Windows.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for Sliding <ArrowRight size={14} />
              </a>
            </div>

            {/* 2. Casement */}
            <div className="v-product-card">
              <span className="v-product-badge">Max Ventilation</span>
              <div className="v-product-icon-wrap"><Compass size={28} /></div>
              <h3>Openable Casement Windows</h3>
              <p>
                Side-hung or top-hung windows offering 100% opening area and supreme acoustic isolation through compression gaskets.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> 90-degree opening for easy glass cleaning</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Multi-point perimeter compression locking</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Up to 40dB noise reduction with DGU</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for Casement Openable Windows.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for Casement <ArrowRight size={14} />
              </a>
            </div>

            {/* 3. Villa Style */}
            <div className="v-product-card">
              <span className="v-product-badge">Total Security</span>
              <div className="v-product-icon-wrap"><Shield size={28} /></div>
              <h3>Villa Windows (Grill + Mesh)</h3>
              <p>
                The complete Indian homeowner package: elegant openable UPVC sashes, heavy-duty built-in steel security grill, and mosquito mesh.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> Powder-coated welded security grill</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Dual sashes for glass & insect screen</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Eliminates external civil grill welding</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for Villa Security Windows.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for Villa Style <ArrowRight size={14} />
              </a>
            </div>

            {/* 4. French Doors */}
            <div className="v-product-card">
              <div className="v-product-icon-wrap"><Building2 size={28} /></div>
              <h3>French Balcony & Patio Doors</h3>
              <p>
                Majestic double-door configurations bringing maximum natural light, luxury aesthetics, and seamless transition to sit-outs.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> Heavy-gauge profile for door heights up to 9ft</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Multi-point shootbolts top and bottom</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Low-threshold aluminium sill available</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for French Doors.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for French Doors <ArrowRight size={14} />
              </a>
            </div>

            {/* 5. Tilt & Turn */}
            <div className="v-product-card">
              <div className="v-product-icon-wrap"><Layers size={28} /></div>
              <h3>Tilt & Turn European Systems</h3>
              <p>
                Dual action mechanism: tilt from top for gentle draft-free rain-safe ventilation, or swing fully open like a door for maximum access.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> German Roto / Siegenia hardware</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Safe for high-rise apartment children</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Superior thermal insulation</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for Tilt & Turn Windows.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for Tilt & Turn <ArrowRight size={14} />
              </a>
            </div>

            {/* 6. Custom Facades & Arches */}
            <div className="v-product-card">
              <div className="v-product-icon-wrap"><Compass size={28} /></div>
              <h3>Arch & Combination Facades</h3>
              <p>
                Bespoke architectural bending and fixed glass curtain designs. Custom-engineered for stairwells, double-height living rooms, and villa gables.
              </p>
              <div className="v-product-specs">
                <div className="v-spec-row"><CheckCircle2 size={14} /> Accurate template-based bending</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> Structural silicone & EPDM fusion</div>
                <div className="v-spec-row"><CheckCircle2 size={14} /> High wind-pressure load compliance</div>
              </div>
              <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}, I want a quote for Custom Arch Windows & Facades.`)}`} target="_blank" rel="noreferrer" className="v-btn-secondary" style={{ marginTop: "auto" }}>
                Enquire for Custom Arches <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Soundproofing & Acoustic Shield Visualizer */}
      <section id="soundproofing" className="v-section v-section-alt">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">Acoustic Engineering</span>
            <h2 className="v-section-title">Block {city} Noise (35dB+ Drop)</h2>
            <p className="v-section-desc">
              Living near main roads, metro lines, or bustling areas? {brandName} UPVC windows with Double Glazed Units (DGU) turn noisy chaos into quiet peace.
            </p>
          </div>

          <div className="v-acoustic-box">
            <div>
              <h3 style={{ fontSize: "24px", color: "#fff", margin: "0 0 14px", fontFamily: "var(--v-font-heading)" }}>
                Acoustic Multi-Barrier Technology
              </h3>
              <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: "14px", marginBottom: "24px" }}>
                Unlike traditional aluminium or wooden frames that leak sound through joints and single thin glass, our UPVC windows combine three noise cancellation barriers:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#00d2ff", color: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", flexShrink: 0 }}>1</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "14px" }}>Multi-Chamber UPVC Extrusion</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "12px" }}>Dead air chambers trap acoustic vibrations and break sound waves.</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#00d2ff", color: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", flexShrink: 0 }}>2</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "14px" }}>Argon/Air Gap Double Glazing (DGU)</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "12px" }}>5mm Glass + 12mm Air Gap + 5mm Glass cuts ambient decibels dramatically.</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#00d2ff", color: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", flexShrink: 0 }}>3</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "14px" }}>Dual EPDM Compression Gaskets</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "12px" }}>Creates an airtight perimeter seal with zero air or sound leakage.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="v-sound-meter">
              <div className="v-sound-bar">
                <div className="v-sound-bar-header">
                  <span style={{ color: "#f87171" }}>Outside Traffic / Street Horns</span>
                  <span style={{ color: "#f87171" }}>85 dB (Disturbing)</span>
                </div>
                <div className="v-sound-track">
                  <div className="v-sound-fill-red" />
                </div>
              </div>

              <div className="v-sound-bar">
                <div className="v-sound-bar-header">
                  <span style={{ color: "#fbbf24" }}>Old Single Glass Aluminium Windows</span>
                  <span style={{ color: "#fbbf24" }}>65 dB (Loud)</span>
                </div>
                <div className="v-sound-track">
                  <div style={{ height: "100%", width: "65%", background: "#fbbf24" }} />
                </div>
              </div>

              <div className="v-sound-bar" style={{ borderColor: "#10b981", background: "rgba(16, 185, 129, 0.08)" }}>
                <div className="v-sound-bar-header">
                  <span style={{ color: "#34d399", fontWeight: 700 }}>{brandName} DGU UPVC Window</span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>32 dB (Whisper Quiet)</span>
                </div>
                <div className="v-sound-track">
                  <div className="v-sound-fill-green" />
                </div>
              </div>

              <div style={{ background: "rgba(0, 210, 255, 0.1)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(0, 210, 255, 0.3)", textAlign: "center" }}>
                <span style={{ fontSize: "13px", color: "#00d2ff", fontWeight: 600 }}>
                  ✨ Experience deep sleep and peaceful focus in your home.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Anatomy of Quality */}
      <section id="engineering" className="v-section">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">German Standard</span>
            <h2 className="v-section-title">The Anatomy of a {brandName} Window</h2>
            <p className="v-section-desc">
              We never compromise on internal materials. Here is what is built inside every frame we deliver to your home.
            </p>
          </div>

          <div className="v-anatomy-grid">
            <div className="v-anatomy-card">
              <div className="v-spec-icon"><Layers size={20} /></div>
              <h4>Multi-Chamber Profiles</h4>
              <p>Tropical-grade UPVC compound tested against harsh Indian sun. Will not yellow, warp, or crack.</p>
            </div>
            <div className="v-anatomy-card">
              <div className="v-spec-icon"><Shield size={20} /></div>
              <h4>1.5mm GI Steel Core</h4>
              <p>Full-perimeter galvanized steel reinforcement provides rigid structural stability against cyclones.</p>
            </div>
            <div className="v-anatomy-card">
              <div className="v-spec-icon"><Wind size={20} /></div>
              <h4>EPDM Weather Gaskets</h4>
              <p>High-elasticity synthetic rubber seals maintain airtight contact for over 15 years.</p>
            </div>
            <div className="v-anatomy-card">
              <div className="v-spec-icon"><Lock size={20} /></div>
              <h4>Precision German Hardware</h4>
              <p>Corrosion-resistant multi-point handles, friction hinges, and stainless steel rollers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Process */}
      <section id="process" className="v-section v-section-alt">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">Hassle-Free Experience</span>
            <h2 className="v-section-title">4 Simple Steps to Perfection</h2>
            <p className="v-section-desc">
              From site measurement to clean installation, our in-house technicians ensure zero headaches.
            </p>
          </div>

          <div className="v-process-grid">
            <div className="v-process-card">
              <div className="v-step-num">01</div>
              <h4>Free Site Survey</h4>
              <p>Our expert visits your site in {city} with samples and takes laser-accurate measurements.</p>
            </div>
            <div className="v-process-card">
              <div className="v-step-num">02</div>
              <h4>Itemized 3D Quote</h4>
              <p>Receive an itemized digital quotation with zero hidden fees, custom specs, and clear delivery timeline.</p>
            </div>
            <div className="v-process-card">
              <div className="v-step-num">03</div>
              <h4>Factory CNC Fabrication</h4>
              <p>Precision corner fusion welding and steel reinforcement at our modern facility.</p>
            </div>
            <div className="v-process-card">
              <div className="v-step-num">04</div>
              <h4>Clean Installation</h4>
              <p>Dust-protected installation by trained specialists backed by a 10-year warranty card.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews & Testimonials */}
      <section id="reviews" className="v-section">
        <div className="v-container">
          <div className="v-section-header">
            <span className="v-section-kicker">Customer Satisfaction</span>
            <h2 className="v-section-title">Trusted by 500+ Homeowners</h2>
            <p className="v-section-desc">
              See what architects, interior designers, and villa owners say about {brandName}.
            </p>
          </div>

          <div className="v-review-grid">
            <div className="v-review-card">
              <div>
                <div className="v-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="v-review-quote">
                  "{proprietor} and the team completed 18 villa windows for our residence. The soundproofing against outer highway noise is unbelievable. Very honest pricing and delivered right on time."
                </p>
              </div>
              <div className="v-reviewer-meta">
                <div className="v-reviewer-avatar">RK</div>
                <div className="v-reviewer-info">
                  <h5>Ravi Kumar Reddy</h5>
                  <p>Villa Owner, {city}</p>
                </div>
              </div>
            </div>

            <div className="v-review-card">
              <div>
                <div className="v-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="v-review-quote">
                  "We installed 3-track sliding balcony doors with mosquito mesh in our high-rise apartment. Heavy monsoon rains had zero leakage. The sliding action is super smooth."
                </p>
              </div>
              <div className="v-reviewer-meta">
                <div className="v-reviewer-avatar">SP</div>
                <div className="v-reviewer-info">
                  <h5>Sunil Prabhakar</h5>
                  <p>Apartment Owner, {city}</p>
                </div>
              </div>
            </div>

            <div className="v-review-card">
              <div>
                <div className="v-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="v-review-quote">
                  "As an interior designer, I regularly recommend {brandName}. {proprietor} personally inspects every site and ensures perfect corner finishes and top-tier German hardware."
                </p>
              </div>
              <div className="v-reviewer-meta">
                <div className="v-reviewer-avatar">AN</div>
                <div className="v-reviewer-info">
                  <h5>Ananya Narang</h5>
                  <p>Architect & Interior Consultant, {city}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Free Measurement Booking Form */}
      <section id="contact" className="v-section v-section-alt">
        <div className="v-container">
          <div className="v-contact-card">
            <div>
              <span className="v-section-kicker">Book Inspection</span>
              <h2 style={{ fontSize: "32px", color: "#fff", margin: "0 0 16px", fontFamily: "var(--v-font-heading)" }}>
                Get Your Free Site Measurement
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.7, margin: "0 0 28px" }}>
                Speak directly with <strong>{proprietor}</strong>. We will visit your site anywhere in {city}, bring profile samples, and provide a digital itemized quotation with zero obligation.
              </p>

              <div className="v-contact-info-list">
                <div className="v-contact-item">
                  <div className="v-contact-icon"><Phone size={20} /></div>
                  <div className="v-contact-text">
                    <h5>Direct Phone / Mobile</h5>
                    <p><a href={`tel:${phone.replace(/\s+/g, "")}`} style={{ color: "#fff", textDecoration: "none" }}>{phone}</a></p>
                  </div>
                </div>

                <div className="v-contact-item">
                  <div className="v-contact-icon"><MessageCircle size={20} /></div>
                  <div className="v-contact-text">
                    <h5>WhatsApp Direct</h5>
                    <p><a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hello ${proprietor}! I want a site visit in ${city}.`)}`} target="_blank" rel="noreferrer" style={{ color: "#00d2ff", textDecoration: "none" }}>Chat with {proprietor}</a></p>
                  </div>
                </div>

                <div className="v-contact-item">
                  <div className="v-contact-icon"><MapPin size={20} /></div>
                  <div className="v-contact-text">
                    <h5>Factory & Service Area</h5>
                    <p>{address}</p>
                  </div>
                </div>

                <div className="v-contact-item">
                  <div className="v-contact-icon"><Clock size={20} /></div>
                  <div className="v-contact-text">
                    <h5>Working Hours</h5>
                    <p>Mon - Sat: 9:00 AM - 8:30 PM (Sun: On Call)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Request Form */}
            <div style={{ background: "rgba(10, 19, 36, 0.85)", padding: "32px", borderRadius: "20px", border: "1px solid var(--v-border)" }}>
              <h3 style={{ margin: "0 0 20px", fontSize: "20px", color: "#fff" }}>Schedule Your Site Visit</h3>
              {formSent ? (
                <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                  <CheckCircle2 size={32} color="#34d399" style={{ margin: "0 auto 10px" }} />
                  <h4 style={{ color: "#fff", margin: "0 0 6px" }}>Request Received!</h4>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>WhatsApp chat opened with {proprietor}. We will be in touch shortly!</p>
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="v-input-group">
                    <label>Your Name</label>
                    <input
                      type="text"
                      className="v-input-control"
                      placeholder="e.g. Ramesh Reddy"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="v-input-group">
                    <label>Phone Number (WhatsApp) *</label>
                    <input
                      type="tel"
                      required
                      className="v-input-control"
                      placeholder="e.g. 98480 12345"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>

                  <div className="v-input-group">
                    <label>Site Location / Area in {city}</label>
                    <input
                      type="text"
                      className="v-input-control"
                      placeholder="e.g. Jubilee Hills, Gachibowli, Kukatpally"
                      value={formArea}
                      onChange={(e) => setFormArea(e.target.value)}
                    />
                  </div>

                  <div className="v-input-group">
                    <label>Windows / Doors Needed</label>
                    <select
                      className="v-input-control"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="Sliding Windows">Sliding Windows & Balcony Doors</option>
                      <option value="Casement Windows">Openable Casement Windows</option>
                      <option value="Villa Security Windows">Villa Windows (Grill + Mesh)</option>
                      <option value="Entire House/Villa Glazing">Full House / Villa Glazing Project</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="v-btn-primary"
                    style={{ width: "100%", justifyContent: "center", marginTop: "8px" }}
                  >
                    <Send size={16} /> Request Free Measurement
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="v-footer">
        <div className="v-container">
          <div className="v-footer-grid">
            <div className="v-footer-brand">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#fff", fontWeight: 700, fontSize: "17px" }}>
                {logoUrl ? (
                  <img src={logoUrl} alt={brandName} style={{ height: "36px", width: "auto", objectFit: "contain", borderRadius: "6px", background: "#fff", padding: "2px" }} />
                ) : (
                  <div className="v-logo-emblem" style={{ width: "36px", height: "36px", fontSize: "16px" }}>{logoInitial}</div>
                )}
                {brandName}
              </div>
              <p>
                Authorized manufacturer and installer of precision-engineered UPVC window & door systems for residential villas, apartments and commercial projects across {serviceArea}.
              </p>
            </div>

            <div className="v-footer-col">
              <h4>Quick Links</h4>
              <ul className="v-footer-links">
                <li><a href="#products">Sliding Windows</a></li>
                <li><a href="#products">Casement Windows</a></li>
                <li><a href="#products">Villa Security Windows</a></li>
                <li><a href="#products">French Doors</a></li>
                <li><a href="#calculator">Price Calculator</a></li>
              </ul>
            </div>

            <div className="v-footer-col">
              <h4>Service Areas</h4>
              <ul className="v-footer-links">
                <li><a href="#contact">Central & City Limits</a></li>
                <li><a href="#contact">Gated Communities & Villas</a></li>
                <li><a href="#contact">High-Rise Apartments</a></li>
                <li><a href="#contact">Commercial & Offices</a></li>
                <li><a href="#contact">Surrounding Suburbs</a></li>
              </ul>
            </div>

            <div className="v-footer-col">
              <h4>Contact Factory</h4>
              <p style={{ margin: "0 0 8px", color: "#fff", fontWeight: 600 }}>{proprietor}</p>
              <p style={{ margin: "0 0 8px", fontSize: "13px" }}>{phone}</p>
              <p style={{ margin: "0 0 16px", fontSize: "13px" }}>{email}</p>
              <a href={`/${slug}/home`} className="v-btn-secondary" style={{ padding: "8px 14px", fontSize: "12px" }}>
                Client Portal Login
              </a>
            </div>
          </div>

          <div className="v-footer-bottom">
            <div>
              © {new Date().getFullYear()} {brandName}. All rights reserved.
            </div>
            <div>
              Powered by <span style={{ color: "#00d2ff", fontWeight: 600 }}>Vitharn ERP Services</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Quick Action Buttons */}
      <div className="v-floating-bar">
        <a
          href={`tel:${phone.replace(/\s+/g, "")}`}
          className="v-float-btn"
          style={{ background: "#0f172a", color: "#fff", border: "1px solid var(--v-border)" }}
        >
          <Phone size={16} color="#00d2ff" /> Call
        </a>
        <a
          href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hello ${proprietor}! I visited your ${brandName} website and would like a quote for UPVC windows.`)}`}
          target="_blank"
          rel="noreferrer"
          className="v-float-btn v-btn-whatsapp"
        >
          <MessageCircle size={16} /> WhatsApp Quote
        </a>
      </div>
    </div>
  );
}
