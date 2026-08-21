"use client";

import "./vaishnavi.css";
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
  Lock,
  Building2,
  Send,
  Star,
  Grid,
  Sun,
  Award,
  Maximize2
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props {
  client: any;
  slug: string;
}

export default function VaishnaviMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);

  // Business Meta
  const brandName = cfg.companyName || "VAISHNAVI UPVC WINDOWS AND DOORS";
  const proprietor = cfg.companyProprietor || "Kiran Chary";
  const phone = cfg.companyContact || "9640000825";
  const email = cfg.companyEmail || "ecotexupvc@gmail.com";
  const address = cfg.companyAddress || "SY NO 21 & 22, Near Kharmanghat, Hanuman Temple, Gayatri Nagar X Roads, Jillelaguda, Hyderabad - 500079";
  const gstNumber = cfg.gstNumber || "36CSPPV7053P1ZJ";
  const logoUrl = cfg.logoUrl || "/vaishnavi/images/hero.jpg";

  const rawWhatsapp = phone.replace(/\D/g, "");
  const whatsappNum = rawWhatsapp.length === 10 ? `91${rawWhatsapp}` : (rawWhatsapp || "919640000825");

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
  const maxTotal = Math.round(sqft * (baseRatePerSqft + 85));

  const whatsappQuoteMsg = encodeURIComponent(
    `Hello ${proprietor}! I visited your ${brandName} website and calculated an estimate for:\n\n` +
    `• Type: ${calcType.toUpperCase()} Windows/Doors\n` +
    `• Dimensions: ${calcWidth} ft (W) × ${calcHeight} ft (H) = ${sqft} Sq.Ft\n` +
    `• Glass: ${calcGlass.toUpperCase()} Glazing\n` +
    `• SS304 Mosquito Mesh: ${calcMesh ? "Included" : "No"}\n` +
    `• Estimated Range: ₹${minTotal.toLocaleString("en-IN")} - ₹${maxTotal.toLocaleString("en-IN")}\n\n` +
    `Please schedule a free site measurement and provide the final itemized quote.`
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
      `• Location/Area: ${formArea || "Hyderabad"}\n` +
      `• Requirements: ${formType}\n\n` +
      `Please contact me to schedule a visit.`
    );
    window.open(`https://wa.me/${whatsappNum}?text=${msg}`, "_blank");
    setFormSent(true);
  };

  return (
    <div className="vaishnavi-root">
      <div className="vsh-bg-mesh" />
      <div className="vsh-grid-overlay" />

      {/* Top Banner */}
      <div className="vsh-topbar">
        <div className="vsh-container">
          <div className="vsh-topbar-inner">
            <div className="vsh-topbar-left">
              <span className="vsh-badge-pill">
                <Sparkles size={12} /> FOR BETTER VIEW, BETTER LIFE
              </span>
              <span>Direct Factory • 10-Yr Profile Warranty • Kharmanghat & Jillelaguda Facility</span>
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <a href={`tel:${phone}`} style={{ color: "#fff", display: "flex", alignItems: "center", gap: "6px", textDecoration: "none", fontWeight: 600 }}>
                <Phone size={13} color="#d4af37" /> +91 {phone}
              </a>
              <a href={`/${slug}/home`} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "12px", borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: "14px" }}>
                Client Portal
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Sticky Navigation */}
      <header className={`vsh-header ${scrolled ? "scrolled" : ""}`}>
        <div className="vsh-container">
          <div className="vsh-header-inner">
            <a href="#hero" className="vsh-logo-brand">
              <div className="vsh-logo-emblem">V</div>
              <div className="vsh-logo-text">
                <h1>VAISHNAVI UPVC</h1>
                <p>WINDOWS · DOORS · FACADES</p>
              </div>
            </a>

            <nav className="vsh-nav-menu">
              <a href="#products" className="vsh-nav-link">Products</a>
              <a href="#calculator" className="vsh-nav-link">Cost Calculator</a>
              <a href="#engineering" className="vsh-nav-link">German Quality</a>
              <a href="#soundproofing" className="vsh-nav-link">Acoustic Shield</a>
              <a href="#gallery" className="vsh-nav-link">Projects</a>
              <a href="#reviews" className="vsh-nav-link">Reviews</a>
            </nav>

            <div className="vsh-header-actions">
              <a
                href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi ${proprietor}! I am looking for UPVC windows and doors for my project in Hyderabad.`)}`}
                target="_blank"
                rel="noreferrer"
                className="vsh-btn-primary vsh-btn-whatsapp"
              >
                <MessageCircle size={16} /> WhatsApp Quote
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" className="vsh-hero">
        <div className="vsh-container">
          <div className="vsh-hero-grid">
            <motion.div
              className="vsh-hero-content"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="vsh-hero-badge">
                <Award size={14} /> Certified Tropical-Grade Lead-Free UPVC Profiles
              </div>
              <h1 className="vsh-hero-title">
                For Better View, <br />
                <span className="highlight-gold">Better Life.</span>
              </h1>
              <p className="vsh-hero-desc">
                Vaishnavi UPVC manufactures high-precision soundproof, monsoon-sealed, and heat-reflective window and door systems. Precision corner fusion welded with galvanized steel core for a lifetime of silence and architectural elegance.
              </p>

              <div className="vsh-hero-cta">
                <a href="#calculator" className="vsh-btn-primary">
                  <Calculator size={17} /> Instant Cost Calculator <ArrowRight size={16} />
                </a>
                <a href={`tel:${phone}`} className="vsh-btn-secondary">
                  <Phone size={16} /> Call Kiran Chary
                </a>
              </div>

              <div className="vsh-hero-stats">
                <div className="vsh-stat-item">
                  <h3>12<span>+</span></h3>
                  <p>Years Experience in Hyderabad</p>
                </div>
                <div className="vsh-stat-item">
                  <h3>850<span>+</span></h3>
                  <p>Villas & Homes Glazed</p>
                </div>
                <div className="vsh-stat-item">
                  <h3>10<span>Yr</span></h3>
                  <p>Profile & Fusion Warranty</p>
                </div>
              </div>
            </motion.div>

            {/* Hero Showcase Card */}
            <motion.div
              className="vsh-hero-card-preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="vsh-hero-image-wrap">
                <img src="/vaishnavi/images/hero.jpg" alt="Vaishnavi UPVC Luxury Installation" />
              </div>

              <div className="vsh-spec-pill-grid">
                <div className="vsh-spec-pill">
                  <div className="vsh-spec-pill-icon"><VolumeX size={18} /></div>
                  <div className="vsh-spec-pill-text">
                    <h5>35dB+ Acoustic Shield</h5>
                    <p>Double Glazed DGU System</p>
                  </div>
                </div>

                <div className="vsh-spec-pill">
                  <div className="vsh-spec-pill-icon"><Shield size={18} /></div>
                  <div className="vsh-spec-pill-text">
                    <h5>1.5mm GI Steel Core</h5>
                    <p>Zero Sagging / Distortion</p>
                  </div>
                </div>

                <div className="vsh-spec-pill">
                  <div className="vsh-spec-pill-icon"><Wind size={18} /></div>
                  <div className="vsh-spec-pill-text">
                    <h5>Monsoon Water-Tight</h5>
                    <p>EPDM Co-Extruded Seals</p>
                  </div>
                </div>

                <div className="vsh-spec-pill">
                  <div className="vsh-spec-pill-icon"><Lock size={18} /></div>
                  <div className="vsh-spec-pill-text">
                    <h5>German Multi-Locking</h5>
                    <p>Anti-Burglary Shootbolts</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Interactive Price Estimator / Quote Calculator */}
      <section id="calculator" className="vsh-section vsh-section-alt">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Transparent Factory Pricing</span>
            <h2 className="vsh-section-title">Instant Window & Door Cost Estimator</h2>
            <p className="vsh-section-desc">
              Calculate accurate estimate costs for your home or commercial project in real time. Choose your dimensions and opening preferences, then send the specifications directly to Kiran Chary.
            </p>
          </div>

          <div className="vsh-calc-card">
            <div className="vsh-calc-grid">
              <div>
                <div className="vsh-calc-title">
                  <Sliders size={16} color="#d4af37" /> 1. Select Opening Architecture
                </div>
                <div className="vsh-type-selector">
                  <button
                    type="button"
                    className={`vsh-type-btn ${calcType === "sliding" ? "active" : ""}`}
                    onClick={() => setCalcType("sliding")}
                  >
                    <Grid size={22} />
                    <span>2/3 Track Sliding</span>
                  </button>
                  <button
                    type="button"
                    className={`vsh-type-btn ${calcType === "casement" ? "active" : ""}`}
                    onClick={() => setCalcType("casement")}
                  >
                    <Compass size={22} />
                    <span>Casement Openable</span>
                  </button>
                  <button
                    type="button"
                    className={`vsh-type-btn ${calcType === "villa" ? "active" : ""}`}
                    onClick={() => setCalcType("villa")}
                  >
                    <Shield size={22} />
                    <span>Villa (Grill+Mesh)</span>
                  </button>
                  <button
                    type="button"
                    className={`vsh-type-btn ${calcType === "french" ? "active" : ""}`}
                    onClick={() => setCalcType("french")}
                  >
                    <Building2 size={22} />
                    <span>French Balcony Door</span>
                  </button>
                </div>

                <div className="vsh-calc-title">
                  <Maximize2 size={16} color="#d4af37" /> 2. Dimensions in Feet
                </div>
                <div className="vsh-input-row">
                  <div className="vsh-input-group">
                    <label>Opening Width: <strong style={{ color: "#fff" }}>{calcWidth} ft</strong></label>
                    <input
                      type="range"
                      min="2"
                      max="14"
                      step="0.5"
                      value={calcWidth}
                      onChange={(e) => setCalcWidth(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "#d4af37" }}
                    />
                  </div>
                  <div className="vsh-input-group">
                    <label>Opening Height: <strong style={{ color: "#fff" }}>{calcHeight} ft</strong></label>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      step="0.5"
                      value={calcHeight}
                      onChange={(e) => setCalcHeight(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "#d4af37" }}
                    />
                  </div>
                </div>

                <div className="vsh-calc-title">
                  <Sparkles size={16} color="#d4af37" /> 3. Glazing & Security Specs
                </div>
                <div className="vsh-input-row">
                  <div className="vsh-input-group">
                    <label>Glass Specification</label>
                    <select
                      className="vsh-input-control"
                      value={calcGlass}
                      onChange={(e) => setCalcGlass(e.target.value as any)}
                    >
                      <option value="single">5mm Toughened Clear Glass</option>
                      <option value="dgu">12mm Double Glazed Unit (Acoustic DGU)</option>
                      <option value="tinted">Sun-Control Tinted / Frosted Glaze</option>
                    </select>
                  </div>
                  <div className="vsh-input-group">
                    <label>Mosquito Mesh Barrier</label>
                    <select
                      className="vsh-input-control"
                      value={calcMesh ? "yes" : "no"}
                      onChange={(e) => setCalcMesh(e.target.value === "yes")}
                    >
                      <option value="yes">Include SS304 Stainless Steel Mesh</option>
                      <option value="no">Without Insect Mesh</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Calculator Summary Panel */}
              <div className="vsh-calc-summary-panel">
                <div>
                  <h4 style={{ margin: "0 0 16px", fontSize: "15px", color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--vsh-font-heading)" }}>
                    Estimated Specification
                  </h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Total Area:</span>
                    <strong style={{ color: "#fff" }}>{sqft} Sq.Ft</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Profile System:</span>
                    <strong style={{ color: "#d4af37" }}>{calcType.toUpperCase()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                    <span>Reinforcement:</span>
                    <strong style={{ color: "#fff" }}>1.5mm Hot-Dipped GI Core</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "16px" }}>
                    <span>Hardware:</span>
                    <strong style={{ color: "#fff" }}>Multi-Point Anti-Burglary</strong>
                  </div>
                </div>

                <div className="vsh-calc-total-box">
                  <div className="lbl">Estimated Price Range</div>
                  <div className="price-range">
                    ₹{minTotal.toLocaleString("en-IN")} - ₹{maxTotal.toLocaleString("en-IN")}
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#94a3b8" }}>
                    Includes factory fabrication, German hardware & Hyderabad site delivery.
                  </p>
                </div>

                <a
                  href={`https://wa.me/${whatsappNum}?text=${whatsappQuoteMsg}`}
                  target="_blank"
                  rel="noreferrer"
                  className="vsh-btn-primary vsh-btn-whatsapp"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <MessageCircle size={16} /> WhatsApp Quote to Kiran Chary
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Spectrum */}
      <section id="products" className="vsh-section">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Architectural Portfolio</span>
            <h2 className="vsh-section-title">Engineered For Every Opening</h2>
            <p className="vsh-section-desc">
              From high-rise balcony sliders withstanding heavy monsoons to soundproof bedroom casements, each system is custom manufactured to laser measurements.
            </p>
          </div>

          <div className="vsh-product-grid">
            {/* 1. Sliding */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-sliding.jpg" alt="Sliding Windows" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">Top Residential Choice</span>
                <h3>2 & 3-Track Sliding Systems</h3>
                <p>
                  Smooth gliding sashes on durable nylon/brass tandem rollers with integrated stainless steel mosquito mesh tracks.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Integrated SS304 mosquito mesh track</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Multi-chamber profile with drainage slots</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Wool-pile weather seals prevent dust ingress</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for 2/3-Track Sliding Windows.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for Sliding <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* 2. Casement */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-casement.jpg" alt="Casement Openable Windows" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">Maximum Ventilation</span>
                <h3>Openable Casement Windows</h3>
                <p>
                  Side-hung or top-hung sashes offering 100% opening area and supreme compression acoustic isolation.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> 90-degree opening for easy glass cleaning</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Multi-point perimeter compression locking</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Up to 38dB noise drop with acoustic DGU</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for Openable Casement Windows.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for Casement <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* 3. Villa Security Windows */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-casement.jpg" alt="Villa Security Windows" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">Total Family Security</span>
                <h3>Villa Windows (Grill + Mesh)</h3>
                <p>
                  The complete Indian home solution: heavy-duty welded internal steel security grill, glass sash, and insect mesh in a single unified frame.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Powder-coated welded steel grill</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Independent glass and insect mesh sashes</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Zero external welding required</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for Villa Security Windows with Grill.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for Villa Windows <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* 4. French Patio Doors */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-french.jpg" alt="French Balcony & Patio Doors" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">Luxury Balconies</span>
                <h3>French Balcony & Patio Doors</h3>
                <p>
                  Majestic double-door configurations bringing panoramic natural sunlight and seamless transition to sit-outs and garden terraces.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Heavy-gauge profile for door heights up to 9.5ft</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Top and bottom multi-point shootbolts</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Low-threshold aluminium barrier option</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for French Balcony Doors.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for French Doors <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* 5. Tilt & Turn */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-tilt.jpg" alt="Tilt and Turn Windows" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">European Standard</span>
                <h3>Tilt & Turn Dual Action Systems</h3>
                <p>
                  Tilt inward from the top for gentle draft-free rain-safe ventilation, or swing fully open like a door for full room clearance.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> German multi-action gear mechanism</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> High-rise child safety tilt mode</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Outstanding acoustic & thermal rating</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for Tilt & Turn Windows.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for Tilt & Turn <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* 6. Custom Architectural Arches & Facades */}
            <div className="vsh-product-card">
              <div className="vsh-product-image">
                <img src="/vaishnavi/images/prod-arch.jpg" alt="Custom Arch Windows" />
              </div>
              <div className="vsh-product-body">
                <span className="vsh-product-badge">Bespoke Architecture</span>
                <h3>Arch Facades & Curtain Glazing</h3>
                <p>
                  Custom curved bending and high-span fixed glass facades engineered for stairwells, double-height living areas, and villa gables.
                </p>
                <div className="vsh-product-specs">
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Accurate template-based profile bending</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Structural silicone with high wind-load support</div>
                  <div className="vsh-spec-row"><CheckCircle2 size={14} /> Thermal break & UV solar control glass</div>
                </div>
                <a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hi Kiran Chary, I'd like a quote for Arch Windows & Glass Facades.")}`} target="_blank" rel="noreferrer" className="vsh-btn-secondary" style={{ marginTop: "auto" }}>
                  Enquire for Arches & Facades <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Soundproofing & Climate Comfort Visualizer */}
      <section id="soundproofing" className="vsh-section vsh-section-alt">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Acoustic & Thermal Comfort</span>
            <h2 className="vsh-section-title">Silence Hyderabad Traffic (35dB+ Drop)</h2>
            <p className="vsh-section-desc">
              Living near busy roads, flyovers, or urban traffic? Vaishnavi Double Glazed Units (DGU) with multi-chamber profiles transform loud chaotic environments into peaceful sanctuaries.
            </p>
          </div>

          <div className="vsh-acoustic-card">
            <div>
              <h3 style={{ fontSize: "24px", color: "#fff", margin: "0 0 14px", fontFamily: "var(--vsh-font-heading)" }}>
                3-Layer Acoustic Barrier Engineering
              </h3>
              <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: "14px", marginBottom: "24px" }}>
                Unlike traditional aluminium or wooden frames that leak noise through unsealed gaps, Vaishnavi UPVC systems combine three acoustic cancellation barriers:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#d4af37", color: "#070c16", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", flexShrink: 0 }}>1</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "15px" }}>Multi-Chamber UPVC Extrusions</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "13px" }}>Engineered air chambers trap sound waves and stop acoustic transmission.</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#d4af37", color: "#070c16", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", flexShrink: 0 }}>2</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "15px" }}>Double Glazed Unit (DGU) with Argon/Air Gap</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "13px" }}>5mm Glass + 12mm Air Gap + 5mm Glass dramatically dampens decibels.</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#d4af37", color: "#070c16", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", flexShrink: 0 }}>3</div>
                  <div>
                    <strong style={{ color: "#fff", fontSize: "15px" }}>Dual EPDM Compression Gaskets</strong>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "13px" }}>Creates an airtight perimeter seal stopping all sound, rain, and dust leaks.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="vsh-sound-meter">
              <div className="vsh-sound-bar">
                <div className="vsh-sound-bar-header">
                  <span style={{ color: "#f87171" }}>Outside Highway / City Traffic Noise</span>
                  <span style={{ color: "#f87171" }}>85 dB (Disturbing)</span>
                </div>
                <div className="vsh-sound-track">
                  <div className="vsh-sound-fill-red" />
                </div>
              </div>

              <div className="vsh-sound-bar">
                <div className="vsh-sound-bar-header">
                  <span style={{ color: "#fbbf24" }}>Old Aluminium / Unsealed Wood Windows</span>
                  <span style={{ color: "#fbbf24" }}>65 dB (Loud)</span>
                </div>
                <div className="vsh-sound-track">
                  <div className="vsh-sound-fill-yellow" />
                </div>
              </div>

              <div className="vsh-sound-bar" style={{ borderColor: "#10b981", background: "rgba(16, 185, 129, 0.08)" }}>
                <div className="vsh-sound-bar-header">
                  <span style={{ color: "#34d399", fontWeight: 700 }}>Vaishnavi DGU UPVC Window</span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>32 dB (Whisper Quiet Library Peace)</span>
                </div>
                <div className="vsh-sound-track">
                  <div className="vsh-sound-fill-green" />
                </div>
              </div>

              <div style={{ background: "rgba(212, 175, 55, 0.08)", padding: "16px", borderRadius: "14px", border: "1px solid rgba(212, 175, 55, 0.25)", textAlign: "center" }}>
                <span style={{ fontSize: "13px", color: "var(--vsh-gold-light)", fontWeight: 600 }}>
                  ⚡ Bonus: Thermal barrier reduces indoor heat by up to 40%, cutting summer AC electricity bills.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Anatomy of Quality */}
      <section id="engineering" className="vsh-section">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Manufacturing Standards</span>
            <h2 className="vsh-section-title">The Anatomy of a Vaishnavi UPVC Window</h2>
            <p className="vsh-section-desc">
              We never cut corners on internal components. Every frame delivered from our Kharmanghat facility is built to strict structural parameters.
            </p>
          </div>

          <div className="vsh-anatomy-grid">
            <div className="vsh-anatomy-card">
              <div className="vsh-spec-pill-icon"><Layers size={20} /></div>
              <h4>Multi-Chamber Fusion</h4>
              <p>Tropical-grade UV compound tested against Telangana’s hot summers. Will never yellow, warp, or crack.</p>
            </div>
            <div className="vsh-anatomy-card">
              <div className="vsh-spec-pill-icon"><Shield size={20} /></div>
              <h4>1.5mm Zinc GI Core</h4>
              <p>Continuous hot-dipped galvanized steel reinforcement prevents high-rise wind deflection and frame bending.</p>
            </div>
            <div className="vsh-anatomy-card">
              <div className="vsh-spec-pill-icon"><Wind size={20} /></div>
              <h4>EPDM Weather Gaskets</h4>
              <p>High-memory synthetic rubber gaskets provide 100% airtight seal against monsoon storms and urban dust.</p>
            </div>
            <div className="vsh-anatomy-card">
              <div className="vsh-spec-pill-icon"><Lock size={20} /></div>
              <h4>Precision German Hardware</h4>
              <p>Multi-point locking handles, heavy-duty friction hinges, and stainless steel rollers tested for 50,000 cycles.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Showcase */}
      <section id="gallery" className="vsh-section vsh-section-alt">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Real Completed Work</span>
            <h2 className="vsh-section-title">Architectural Installations in Hyderabad</h2>
            <p className="vsh-section-desc">
              Explore how Vaishnavi UPVC windows and doors elevate modern villas, duplexes, and premium apartments across Telangana.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            <div style={{ borderRadius: "18px", overflow: "hidden", height: "280px", border: "1px solid var(--vsh-border)" }}>
              <img src="/vaishnavi/images/hero.jpg" alt="Villa Courtyard Sliding Doors" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ borderRadius: "18px", overflow: "hidden", height: "280px", border: "1px solid var(--vsh-border)" }}>
              <img src="/vaishnavi/images/prod-french.jpg" alt="Balcony French Patio Doors" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ borderRadius: "18px", overflow: "hidden", height: "280px", border: "1px solid var(--vsh-border)" }}>
              <img src="/vaishnavi/images/prod-arch.jpg" alt="Custom Arch Structural Facade" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Process */}
      <section id="process" className="vsh-section">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Seamless Execution</span>
            <h2 className="vsh-section-title">4 Simple Steps to Perfection</h2>
            <p className="vsh-section-desc">
              From free laser site survey to clean dust-protected installation, our trained in-house technicians handle everything.
            </p>
          </div>

          <div className="vsh-process-grid">
            <div className="vsh-process-card">
              <div className="vsh-step-num">01</div>
              <h4>Free Site Survey</h4>
              <p>Kiran Chary or senior technical surveyor visits your site with physical profile samples and takes laser measurements.</p>
            </div>
            <div className="vsh-process-card">
              <div className="vsh-step-num">02</div>
              <h4>Itemized 3D Quote</h4>
              <p>Receive a clear digital quotation with exact profile specifications, glass type, hardware list, and delivery schedule.</p>
            </div>
            <div className="vsh-process-card">
              <div className="vsh-step-num">03</div>
              <h4>Factory Fabrication</h4>
              <p>High-precision multi-point corner fusion welding and steel reinforcement at our Kharmanghat factory.</p>
            </div>
            <div className="vsh-process-card">
              <div className="vsh-step-num">04</div>
              <h4>Clean Installation</h4>
              <p>Professional fitting with premium silicone weather seals, backed by our 10-year official warranty certificate.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Reviews & Testimonials */}
      <section id="reviews" className="vsh-section vsh-section-alt">
        <div className="vsh-container">
          <div className="vsh-section-header">
            <span className="vsh-section-kicker">Customer Satisfaction</span>
            <h2 className="vsh-section-title">Trusted by 850+ Hyderabad Homeowners</h2>
            <p className="vsh-section-desc">
              See what villa owners, architects, and apartment residents say about working with Vaishnavi UPVC Windows and Doors.
            </p>
          </div>

          <div className="vsh-review-grid">
            <div className="vsh-review-card">
              <div>
                <div className="vsh-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="vsh-review-quote">
                  "Kiran Chary personally oversaw the installation of 14 sliding and casement windows for our villa in Jillelaguda. The acoustic drop is incredible. Heavy rain has zero water seepage. Highly recommended!"
                </p>
              </div>
              <div className="vsh-reviewer-meta">
                <div className="vsh-reviewer-avatar">VR</div>
                <div className="vsh-reviewer-info">
                  <h5>Venkat Rao Goud</h5>
                  <p>Villa Owner, Jillelaguda, Hyderabad</p>
                </div>
              </div>
            </div>

            <div className="vsh-review-card">
              <div>
                <div className="vsh-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="vsh-review-quote">
                  "We got 3-track sliding balcony doors with mosquito mesh for our apartment near LB Nagar. The sliding track is butter-smooth and the finish is top-class. Honest pricing with zero hidden charges."
                </p>
              </div>
              <div className="vsh-reviewer-meta">
                <div className="vsh-reviewer-avatar">MS</div>
                <div className="vsh-reviewer-info">
                  <h5>Madhusudhan Sharma</h5>
                  <p>Apartment Resident, LB Nagar</p>
                </div>
              </div>
            </div>

            <div className="vsh-review-card">
              <div>
                <div className="vsh-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="#ffb703" />)}
                </div>
                <p className="vsh-review-quote">
                  "As a builder and interior consultant in Hyderabad, Vaishnavi UPVC is our first choice. Kiran Chary delivers on time with calibrated corner joints and authentic German hardware."
                </p>
              </div>
              <div className="vsh-reviewer-meta">
                <div className="vsh-reviewer-avatar">SK</div>
                <div className="vsh-reviewer-info">
                  <h5>Suresh Kumar Reddy</h5>
                  <p>Architect & Builder, Hyderabad</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Free Measurement Booking Form */}
      <section id="contact" className="vsh-section">
        <div className="vsh-container">
          <div className="vsh-contact-card">
            <div>
              <span className="vsh-section-kicker">Book Free Consultation</span>
              <h2 style={{ fontSize: "32px", color: "#fff", margin: "0 0 16px", fontFamily: "var(--vsh-font-heading)" }}>
                Schedule Your Free Site Measurement
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.7, margin: "0 0 28px" }}>
                Speak directly with proprietor <strong>{proprietor}</strong>. We will visit your site anywhere in Hyderabad, bring profile samples, inspect openings, and provide an itemized digital estimate with zero obligation.
              </p>

              <div className="vsh-contact-info-list">
                <div className="vsh-contact-item">
                  <div className="vsh-contact-icon"><Phone size={20} /></div>
                  <div className="vsh-contact-text">
                    <h5>Direct Phone / Mobile</h5>
                    <p><a href={`tel:${phone}`} style={{ color: "#fff", textDecoration: "none" }}>+91 {phone}</a></p>
                  </div>
                </div>

                <div className="vsh-contact-item">
                  <div className="vsh-contact-icon"><MessageCircle size={20} /></div>
                  <div className="vsh-contact-text">
                    <h5>WhatsApp Direct</h5>
                    <p><a href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent("Hello Kiran Chary! I would like to arrange a site visit.")}`} target="_blank" rel="noreferrer" style={{ color: "var(--vsh-gold-light)", textDecoration: "none" }}>Chat with Kiran Chary</a></p>
                  </div>
                </div>

                <div className="vsh-contact-item">
                  <div className="vsh-contact-icon"><MapPin size={20} /></div>
                  <div className="vsh-contact-text">
                    <h5>Factory & Registered Address</h5>
                    <p style={{ fontSize: "13px", color: "#cbd5e1" }}>{address}</p>
                  </div>
                </div>

                <div className="vsh-contact-item">
                  <div className="vsh-contact-icon"><Clock size={20} /></div>
                  <div className="vsh-contact-text">
                    <h5>Working Hours</h5>
                    <p>Mon - Sat: 9:00 AM - 8:30 PM (Sun: By Appointment)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Request Form */}
            <div style={{ background: "rgba(11, 19, 34, 0.9)", padding: "32px", borderRadius: "20px", border: "1px solid var(--vsh-border)" }}>
              <h3 style={{ margin: "0 0 20px", fontSize: "20px", color: "#fff", fontFamily: "var(--vsh-font-heading)" }}>Schedule Your Site Survey</h3>
              {formSent ? (
                <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                  <CheckCircle2 size={32} color="#34d399" style={{ margin: "0 auto 10px" }} />
                  <h4 style={{ color: "#fff", margin: "0 0 6px" }}>Measurement Request Received!</h4>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>WhatsApp chat opened with Kiran Chary. We will confirm your site visit shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="vsh-input-group">
                    <label>Your Name</label>
                    <input
                      type="text"
                      className="vsh-input-control"
                      placeholder="e.g. Ramesh Reddy"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="vsh-input-group">
                    <label>Phone Number (WhatsApp) *</label>
                    <input
                      type="tel"
                      required
                      className="vsh-input-control"
                      placeholder="e.g. 98480 12345"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>

                  <div className="vsh-input-group">
                    <label>Site Location / Area in Hyderabad</label>
                    <input
                      type="text"
                      className="vsh-input-control"
                      placeholder="e.g. Kharmanghat, LB Nagar, Kokapet, Gachibowli"
                      value={formArea}
                      onChange={(e) => setFormArea(e.target.value)}
                    />
                  </div>

                  <div className="vsh-input-group">
                    <label>Required System Type</label>
                    <select
                      className="vsh-input-control"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="Sliding Windows">Sliding Windows & Balcony Glazing</option>
                      <option value="Casement Windows">Openable Casement Windows</option>
                      <option value="Villa Security Windows">Villa Windows (Grill + Mesh)</option>
                      <option value="French Balcony Doors">French Patio & Terrace Doors</option>
                      <option value="Complete Home Glazing">Complete Villa / House Windows</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="vsh-btn-primary"
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
      <footer className="vsh-footer">
        <div className="vsh-container">
          <div className="vsh-footer-grid">
            <div className="vsh-footer-brand">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#fff", fontWeight: 700, fontSize: "17px" }}>
                <div className="vsh-logo-emblem" style={{ width: "36px", height: "36px", fontSize: "16px" }}>V</div>
                {brandName}
              </div>
              <p>
                Direct manufacturer and certified installer of custom-engineered UPVC window & door systems for residential villas, luxury duplexes, and commercial developments across Hyderabad & Rangareddy.
              </p>
              <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--vsh-gold-light)" }}>
                GSTIN: {gstNumber}
              </div>
            </div>

            <div className="vsh-footer-col">
              <h4>Quick Links</h4>
              <ul className="vsh-footer-links">
                <li><a href="#products">Sliding Windows</a></li>
                <li><a href="#products">Casement Windows</a></li>
                <li><a href="#products">Villa Security Windows</a></li>
                <li><a href="#products">French Patio Doors</a></li>
                <li><a href="#calculator">Price Calculator</a></li>
              </ul>
            </div>

            <div className="vsh-footer-col">
              <h4>Service Regions</h4>
              <ul className="vsh-footer-links">
                <li><a href="#contact">Kharmanghat & Jillelaguda</a></li>
                <li><a href="#contact">LB Nagar & Vanasthalipuram</a></li>
                <li><a href="#contact">Gachibowli & Kokapet</a></li>
                <li><a href="#contact">Jubilee & Banjara Hills</a></li>
                <li><a href="#contact">Madhapur & Hitec City</a></li>
              </ul>
            </div>

            <div className="vsh-footer-col">
              <h4>Contact Technical Team</h4>
              <p style={{ margin: "0 0 6px", color: "#fff", fontWeight: 700 }}>{proprietor}</p>
              <p style={{ margin: "0 0 6px", fontSize: "13px" }}>+91 {phone}</p>
              <p style={{ margin: "0 0 16px", fontSize: "13px" }}>{email}</p>
              <a href={`/${slug}/home`} className="vsh-btn-secondary" style={{ padding: "8px 14px", fontSize: "12px" }}>
                Client Portal Login
              </a>
            </div>
          </div>

          <div className="vsh-footer-bottom">
            <div>
              © {new Date().getFullYear()} {brandName}. All rights reserved.
            </div>
            <div>
              Powered by <span style={{ color: "var(--vsh-gold-light)", fontWeight: 700 }}>Vitharn ERP Services</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Quick Action Buttons */}
      <div className="vsh-floating-bar">
        <a
          href={`tel:${phone}`}
          className="vsh-float-btn"
          style={{ background: "#0e1726", color: "#fff", border: "1px solid var(--vsh-border)" }}
        >
          <Phone size={16} color="#d4af37" /> Call
        </a>
        <a
          href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hello Kiran Chary! I visited the ${brandName} website and would like a quote for UPVC windows.`)}`}
          target="_blank"
          rel="noreferrer"
          className="vsh-float-btn vsh-btn-whatsapp"
        >
          <MessageCircle size={16} /> WhatsApp Quote
        </a>
      </div>
    </div>
  );
}
