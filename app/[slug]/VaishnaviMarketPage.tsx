"use client";

import "./vaishnavi.css";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  VolumeX,
  Wind,
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
  Layers,
  Grid,
  Sun,
  Maximize2
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props {
  client: any;
  slug: string;
}

export default function VaishnaviMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);

  const brandName = cfg.companyName || "Vaishnavi UPVC Windows & Doors";
  const proprietor = cfg.companyProprietor || "Kiran Chary";
  const phone = cfg.companyContact || "9640000825";
  const email = cfg.companyEmail || "ecotexupvc@gmail.com";
  const address = cfg.companyAddress || "SY NO 21 & 22, Near Kharmanghat Hanuman Temple, Gayatri Nagar X Roads, Jillelaguda, Hyderabad - 500079";
  const logoUrl = cfg.logoUrl;

  const rawWa = phone.replace(/\D/g, "");
  const wa = rawWa.length === 10 ? `91${rawWa}` : rawWa;

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Calculator
  const [cType, setCType] = useState<"sliding"|"casement"|"villa"|"french">("sliding");
  const [cW, setCW] = useState(5);
  const [cH, setCH] = useState(4);
  const [cGlass, setCGlass] = useState<"clear"|"dgu"|"tinted">("clear");
  const [cMesh, setCMesh] = useState(true);

  const sqft = Math.max(1, Math.round(cW * cH * 10) / 10);
  let rate = 450;
  if (cType === "sliding") rate = 480;
  if (cType === "casement") rate = 560;
  if (cType === "villa") rate = 680;
  if (cType === "french") rate = 620;
  if (cGlass === "dgu") rate += 140;
  if (cGlass === "tinted") rate += 60;
  if (cMesh) rate += 80;
  const lo = Math.round(sqft * rate);
  const hi = Math.round(sqft * (rate + 85));

  const quoteMsg = encodeURIComponent(
    `Hi ${proprietor}, I need a quote:\n` +
    `Type: ${cType}\nSize: ${cW}×${cH} ft (${sqft} sqft)\n` +
    `Glass: ${cGlass}\nMesh: ${cMesh ? "Yes" : "No"}\n` +
    `Est: ₹${lo.toLocaleString("en-IN")} – ₹${hi.toLocaleString("en-IN")}`
  );

  // Contact form
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fArea, setFArea] = useState("");
  const [fType, setFType] = useState("Sliding Windows");
  const [fSent, setFSent] = useState(false);

  const submitLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fPhone) return;
    const m = encodeURIComponent(
      `Hi ${proprietor}, site visit request:\nName: ${fName || "—"}\nPhone: ${fPhone}\nArea: ${fArea || "Hyderabad"}\nNeed: ${fType}`
    );
    window.open(`https://wa.me/${wa}?text=${m}`, "_blank");
    setFSent(true);
  };

  return (
    <div className="vn-page">

      {/* Announcement Strip */}
      <div className="vn-strip">
        Direct factory at Kharmanghat, Jillelaguda &nbsp;·&nbsp; <strong>10-Year Profile Warranty</strong> &nbsp;·&nbsp;
        <a href={`tel:${phone}`}>Call +91 {phone}</a>
      </div>

      {/* Header */}
      <header className={`vn-header ${scrolled ? "scrolled" : ""}`}>
        <div className="vn-wrap">
          <div className="vn-header-inner">
            <a href="#hero" className="vn-brand">
              {logoUrl && <img src={logoUrl} alt="" className="vn-brand-logo" />}
              <div className="vn-brand-text">
                <h1>Vaishnavi UPVC</h1>
                <p>Windows · Doors</p>
              </div>
            </a>

            <nav className="vn-nav">
              <a href="#products">Products</a>
              <a href="#calculator">Price Estimate</a>
              <a href="#why">Why UPVC</a>
              <a href="#contact">Contact</a>
            </nav>

            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${proprietor}, I need UPVC windows for my home.`)}`}
              target="_blank" rel="noreferrer"
              className="vn-header-cta vn-btn-whatsapp"
            >
              <MessageCircle size={16} /> Get Quote
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="hero" className="vn-hero">
        <div className="vn-wrap">
          <div className="vn-hero-grid">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="vn-hero-eyebrow">Hyderabad UPVC Manufacturer</div>
              <h2>For better view,<br /><em>better life.</em></h2>
              <p className="vn-hero-lead">
                We measure, fabricate, and install precision UPVC window and door systems at our Kharmanghat facility. Soundproof. Monsoon-sealed. Zero maintenance. Built for Hyderabad weather.
              </p>
              <div className="vn-hero-actions">
                <a href="#calculator" className="vn-btn-primary">
                  <Calculator size={17} /> Get Instant Estimate
                </a>
                <a href={`tel:${phone}`} className="vn-btn-ghost">
                  <Phone size={16} /> Call Kiran Chary
                </a>
              </div>
              <div className="vn-hero-metrics">
                <div className="vn-metric"><b>850+</b><span>Homes fitted</span></div>
                <div className="vn-metric"><b>12yr</b><span>In Hyderabad</span></div>
                <div className="vn-metric"><b>10yr</b><span>Warranty</span></div>
              </div>
            </motion.div>

            <motion.div
              className="vn-hero-photo"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
            >
              <img src="/vaishnavi/images/hero.jpg" alt="Vaishnavi UPVC sliding doors in a Hyderabad villa" />
              <div className="vn-hero-photo-badge">
                <div className="vn-hero-photo-badge-icon"><Shield size={20} /></div>
                <div>
                  <h5>Factory Direct Pricing</h5>
                  <p>No middlemen, no markups</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="vn-section vn-section-cream">
        <div className="vn-wrap">
          <div className="vn-section-header vn-section-header-center">
            <div className="vn-section-eyebrow">What We Build</div>
            <h2 className="vn-section-title">Every window system, one factory</h2>
            <p className="vn-section-sub">
              From standard bedroom sliders to full-villa glazing projects with integrated grills and mesh — fabricated, delivered, and installed by our in-house team.
            </p>
          </div>

          <div className="vn-products-grid">
            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-sliding.jpg" alt="Sliding windows" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">Most Popular</span>
                <h3>Sliding Windows & Doors</h3>
                <p>Smooth 2 and 3-track systems for balconies, living rooms, and bedroom openings.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Integrated SS304 mosquito mesh track</li>
                  <li><CheckCircle2 size={14} /> Brass/nylon tandem rollers</li>
                  <li><CheckCircle2 size={14} /> Wool-pile weather seals</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need sliding windows.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>

            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-casement.jpg" alt="Casement windows" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">Best Airflow</span>
                <h3>Openable Casement Windows</h3>
                <p>Side-hung or top-hung sashes with 100% opening area and compression-sealed acoustic isolation.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Multi-point perimeter locking</li>
                  <li><CheckCircle2 size={14} /> 90° opening for easy cleaning</li>
                  <li><CheckCircle2 size={14} /> Up to 38dB noise reduction</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need casement windows.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>

            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-french.jpg" alt="French doors" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">Balcony & Terrace</span>
                <h3>French & Patio Doors</h3>
                <p>Double-leaf doors for sit-outs, garden access, and terrace openings up to 9 feet tall.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Heavy-gauge reinforced profiles</li>
                  <li><CheckCircle2 size={14} /> Multi-point shootbolt locking</li>
                  <li><CheckCircle2 size={14} /> Low-threshold aluminium sill</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need French doors.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>

            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-casement.jpg" alt="Villa windows" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">Complete Security</span>
                <h3>Villa Windows — Grill + Mesh</h3>
                <p>Openable sash, welded steel security grill, and insect mesh in a single UPVC frame. No external welding needed.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Powder-coated internal grill</li>
                  <li><CheckCircle2 size={14} /> Dual independent sashes</li>
                  <li><CheckCircle2 size={14} /> Clean exterior finish</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need villa windows with grill.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>

            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-tilt.jpg" alt="Tilt and turn windows" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">European</span>
                <h3>Tilt & Turn Windows</h3>
                <p>Tilt from top for rain-safe ventilation, or swing open fully. Preferred for high-rise apartments and children's rooms.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Dual-action German mechanism</li>
                  <li><CheckCircle2 size={14} /> Child-safe tilt mode</li>
                  <li><CheckCircle2 size={14} /> Superior thermal insulation</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need tilt & turn windows.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>

            <div className="vn-product-card">
              <div className="vn-product-img"><img src="/vaishnavi/images/prod-arch.jpg" alt="Custom arch facades" /></div>
              <div className="vn-product-body">
                <span className="vn-product-tag">Custom</span>
                <h3>Arches & Structural Glazing</h3>
                <p>Curved profile bending and fixed-glass curtain walls for stairwells, double-height halls, and villa gables.</p>
                <ul className="vn-product-features">
                  <li><CheckCircle2 size={14} /> Template-based profile bending</li>
                  <li><CheckCircle2 size={14} /> Structural silicone sealing</li>
                  <li><CheckCircle2 size={14} /> High wind-load compliance</li>
                </ul>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Hi, I need custom arch windows.")}`} target="_blank" rel="noreferrer" className="vn-product-enquire">
                  Get quote <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section id="calculator" className="vn-section">
        <div className="vn-wrap">
          <div className="vn-section-header">
            <div className="vn-section-eyebrow">Transparent Pricing</div>
            <h2 className="vn-section-title">See what your windows will cost</h2>
            <p className="vn-section-sub">
              Pick your opening type, adjust dimensions, and get a factory-direct price range. Then send it straight to Kiran Chary on WhatsApp.
            </p>
          </div>

          <div className="vn-calc-container">
            <div className="vn-calc-grid">
              <div className="vn-calc-form">
                <span className="vn-calc-label">1. Window type</span>
                <div className="vn-calc-types">
                  {([
                    ["sliding", "Sliding", Grid],
                    ["casement", "Casement", Compass],
                    ["villa", "Villa + Grill", Shield],
                    ["french", "French Door", Building2],
                  ] as const).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      className={`vn-type-btn ${cType === key ? "active" : ""}`}
                      onClick={() => setCType(key as any)}
                    >
                      <Icon size={22} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                <span className="vn-calc-label">2. Dimensions</span>
                <div className="vn-slider-row">
                  <div className="vn-slider-group">
                    <label>Width <strong>{cW} ft</strong></label>
                    <input type="range" min={2} max={14} step={0.5} value={cW} onChange={e => setCW(+e.target.value)} />
                  </div>
                  <div className="vn-slider-group">
                    <label>Height <strong>{cH} ft</strong></label>
                    <input type="range" min={2} max={10} step={0.5} value={cH} onChange={e => setCH(+e.target.value)} />
                  </div>
                </div>

                <span className="vn-calc-label">3. Glass & mesh</span>
                <div className="vn-select-row">
                  <div>
                    <select className="vn-select" value={cGlass} onChange={e => setCGlass(e.target.value as any)}>
                      <option value="clear">5mm Toughened Clear</option>
                      <option value="dgu">Double Glazed (Soundproof DGU)</option>
                      <option value="tinted">Tinted / Frosted Glass</option>
                    </select>
                  </div>
                  <div>
                    <select className="vn-select" value={cMesh ? "y" : "n"} onChange={e => setCMesh(e.target.value === "y")}>
                      <option value="y">SS304 Mosquito Mesh — Yes</option>
                      <option value="n">Without Mesh</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Summary sidebar */}
              <div className="vn-calc-sidebar">
                <div>
                  <span className="vn-calc-label">Summary</span>
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ opacity: 0.6 }}>Area</span>
                      <strong>{sqft} sqft</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ opacity: 0.6 }}>Type</span>
                      <strong style={{ textTransform: "capitalize" }}>{cType}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ opacity: 0.6 }}>Steel</span>
                      <strong>1.5mm GI</strong>
                    </div>
                  </div>
                </div>

                <div className="vn-calc-total">
                  <div className="price-label">Estimated range</div>
                  <div className="price-value">₹{lo.toLocaleString("en-IN")} – ₹{hi.toLocaleString("en-IN")}</div>
                </div>

                <a
                  href={`https://wa.me/${wa}?text=${quoteMsg}`}
                  target="_blank" rel="noreferrer"
                  className="vn-btn-primary vn-btn-whatsapp"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <MessageCircle size={16} /> Send to Kiran Chary
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why UPVC — forest section */}
      <section id="why" className="vn-section vn-section-forest">
        <div className="vn-wrap">
          <div className="vn-section-header vn-section-header-center">
            <div className="vn-section-eyebrow" style={{ color: "rgba(255,255,255,0.4)" }}>Why UPVC over aluminium or wood</div>
            <h2 className="vn-section-title">Built for Hyderabad weather</h2>
            <p className="vn-section-sub">
              Hyderabad gets 40°C summers, heavy monsoons, and dusty air. UPVC handles all three without painting, oiling, or rusting — ever.
            </p>
          </div>

          <div className="vn-why-grid">
            <div className="vn-why-card">
              <div className="vn-why-card-icon"><VolumeX size={22} /></div>
              <h4>35dB+ noise drop</h4>
              <p>Multi-chamber profiles and DGU glass cut highway traffic noise to a whisper. Sleep with windows closed on a main road.</p>
            </div>
            <div className="vn-why-card">
              <div className="vn-why-card-icon"><Wind size={22} /></div>
              <h4>100% rain-sealed</h4>
              <p>EPDM compression gaskets create an airtight perimeter. Zero seepage during Hyderabad monsoons — guaranteed.</p>
            </div>
            <div className="vn-why-card">
              <div className="vn-why-card-icon"><Sun size={22} /></div>
              <h4>40% cooler indoors</h4>
              <p>UPVC doesn't conduct heat. Double-glazed options reflect solar radiation — your AC runs less, electricity bills drop.</p>
            </div>
            <div className="vn-why-card">
              <div className="vn-why-card-icon"><Lock size={22} /></div>
              <h4>Multi-point locks</h4>
              <p>German-standard anti-burglary hardware with shootbolts top and bottom. Secure without needing external grills.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="vn-section">
        <div className="vn-wrap">
          <div className="vn-section-header vn-section-header-center">
            <div className="vn-section-eyebrow">How it works</div>
            <h2 className="vn-section-title">Measurement to installation in 4 steps</h2>
          </div>

          <div className="vn-process-row">
            <div className="vn-process-step">
              <div className="vn-process-num">01</div>
              <h4>Free site visit</h4>
              <p>Kiran Chary or a senior technician visits your site with profile samples and takes laser measurements.</p>
            </div>
            <div className="vn-process-step">
              <div className="vn-process-num">02</div>
              <h4>Itemised quote</h4>
              <p>You get a clear digital quotation — profile type, glass, hardware, delivery date. No hidden charges.</p>
            </div>
            <div className="vn-process-step">
              <div className="vn-process-num">03</div>
              <h4>Factory fabrication</h4>
              <p>CNC corner-welding with galvanised steel reinforcement at our Kharmanghat facility.</p>
            </div>
            <div className="vn-process-step">
              <div className="vn-process-num">04</div>
              <h4>Clean installation</h4>
              <p>Dust-protected fitting by our trained team, silicone weather-sealing, and a 10-year warranty card.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="vn-section vn-section-cream">
        <div className="vn-wrap">
          <div className="vn-section-header">
            <div className="vn-section-eyebrow">Get started</div>
            <h2 className="vn-section-title">Book a free site measurement</h2>
            <p className="vn-section-sub">
              Talk directly to {proprietor}. We visit your site anywhere in Hyderabad with profile samples, measure every opening, and send an itemised quote — no obligation.
            </p>
          </div>

          <div className="vn-contact-grid">
            <div className="vn-contact-info">
              <div className="vn-contact-row">
                <div className="vn-contact-icon"><Phone size={20} /></div>
                <div>
                  <h5>Phone</h5>
                  <p><a href={`tel:${phone}`}>+91 {phone}</a></p>
                </div>
              </div>
              <div className="vn-contact-row">
                <div className="vn-contact-icon"><MessageCircle size={20} /></div>
                <div>
                  <h5>WhatsApp</h5>
                  <p><a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${proprietor}, I need a site visit.`)}`} target="_blank" rel="noreferrer">Chat with {proprietor}</a></p>
                </div>
              </div>
              <div className="vn-contact-row">
                <div className="vn-contact-icon"><MapPin size={20} /></div>
                <div>
                  <h5>Factory address</h5>
                  <p style={{ fontWeight: 400, fontSize: 14 }}>{address}</p>
                </div>
              </div>
              <div className="vn-contact-row">
                <div className="vn-contact-icon"><Clock size={20} /></div>
                <div>
                  <h5>Hours</h5>
                  <p>Mon–Sat 9 AM – 8:30 PM · Sun by appointment</p>
                </div>
              </div>
            </div>

            <div className="vn-contact-form-card">
              <h3>Request a site visit</h3>
              {fSent ? (
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 14, padding: 24, textAlign: "center" }}>
                  <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: 8 }} />
                  <h4 style={{ marginBottom: 4 }}>Sent!</h4>
                  <p style={{ color: "var(--vn-muted)", fontSize: 14 }}>WhatsApp chat opened with {proprietor}.</p>
                </div>
              ) : (
                <form onSubmit={submitLead} className="vn-form-stack">
                  <div>
                    <span className="vn-form-label">Name</span>
                    <input className="vn-input" placeholder="e.g. Ramesh Reddy" value={fName} onChange={e => setFName(e.target.value)} />
                  </div>
                  <div>
                    <span className="vn-form-label">Phone (WhatsApp) *</span>
                    <input className="vn-input" type="tel" required placeholder="e.g. 98480 12345" value={fPhone} onChange={e => setFPhone(e.target.value)} />
                  </div>
                  <div>
                    <span className="vn-form-label">Location in Hyderabad</span>
                    <input className="vn-input" placeholder="e.g. Kharmanghat, LB Nagar, Gachibowli" value={fArea} onChange={e => setFArea(e.target.value)} />
                  </div>
                  <div>
                    <span className="vn-form-label">What do you need?</span>
                    <select className="vn-select" value={fType} onChange={e => setFType(e.target.value)}>
                      <option>Sliding Windows</option>
                      <option>Casement Windows</option>
                      <option>Villa Windows (Grill + Mesh)</option>
                      <option>French / Patio Doors</option>
                      <option>Full house / villa glazing</option>
                    </select>
                  </div>
                  <button type="submit" className="vn-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
                    <Send size={16} /> Request Free Measurement
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="vn-footer">
        <div className="vn-wrap">
          <div className="vn-footer-grid">
            <div>
              <div className="vn-footer-brand">
                {logoUrl && <img src={logoUrl} alt="" />}
                Vaishnavi UPVC
              </div>
              <p>
                Manufacturer and installer of precision UPVC window and door systems for villas, apartments, and commercial projects across Hyderabad and Rangareddy.
              </p>
            </div>
            <div>
              <h4>Products</h4>
              <ul>
                <li><a href="#products">Sliding Windows</a></li>
                <li><a href="#products">Casement Windows</a></li>
                <li><a href="#products">Villa Grill + Mesh</a></li>
                <li><a href="#products">French Doors</a></li>
                <li><a href="#calculator">Price Calculator</a></li>
              </ul>
            </div>
            <div>
              <h4>Areas</h4>
              <ul>
                <li><a href="#contact">Kharmanghat & LB Nagar</a></li>
                <li><a href="#contact">Gachibowli & Kokapet</a></li>
                <li><a href="#contact">Jubilee & Banjara Hills</a></li>
                <li><a href="#contact">Madhapur & Hitec City</a></li>
                <li><a href="#contact">Secunderabad</a></li>
              </ul>
            </div>
            <div>
              <h4>Contact</h4>
              <p style={{ color: "#fff", fontWeight: 600, marginBottom: 6 }}>{proprietor}</p>
              <p style={{ marginBottom: 6 }}>+91 {phone}</p>
              <p style={{ marginBottom: 16 }}>{email}</p>
              <a href={`/${slug}/home`} className="vn-btn-ghost" style={{ padding: "8px 14px", fontSize: 12, color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }}>
                Client Portal
              </a>
            </div>
          </div>
          <div className="vn-footer-bottom">
            <span>© {new Date().getFullYear()} {brandName}</span>
            <span>Powered by <span style={{ color: "var(--vn-copper-light)" }}>Vitharn ERP</span></span>
          </div>
        </div>
      </footer>

      {/* Floating Mobile CTA */}
      <div className="vn-mobile-bar">
        <a href={`tel:${phone}`} className="vn-mobile-btn" style={{ background: "#fff", color: "var(--vn-charcoal)", border: "1px solid var(--vn-border)" }}>
          <Phone size={16} /> Call
        </a>
        <a
          href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${proprietor}, I visited the Vaishnavi UPVC website.`)}`}
          target="_blank" rel="noreferrer"
          className="vn-mobile-btn" style={{ background: "#25d366", color: "#fff" }}
        >
          <MessageCircle size={16} /> WhatsApp
        </a>
      </div>
    </div>
  );
}
