"use client";

import "./akshaya.css";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  Check,
  CircleGauge,
  Clock3,
  Compass,
  Grid2X2,
  Hammer,
  Layers3,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Phone,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  SunMedium,
  Wind,
  X,
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

type Props = { client: any; slug: string };
type OpeningId = "sliding" | "casement" | "villa" | "french" | "tilt" | "arch";
type GlassId = "clear" | "dgu" | "tinted";
type Review = {
  id?: string | number;
  customer_name?: string;
  role?: string;
  rating?: number;
  review_text?: string;
  source?: string;
};

function cityFromAddress(address: string) {
  const parts = (address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1].replace(/[0-9]/g, "").trim() : "Hyderabad";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

const productCatalog: Array<{
  id: OpeningId;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  points: string[];
  icon: any;
}> = [
  {
    id: "sliding",
    eyebrow: "01 / EVERYDAY EASE",
    title: "Sliding windows",
    description: "Clean, space-saving panels for balconies, living rooms and wide openings.",
    image: "/akshaya/images/sliding.webp",
    alt: "White UPVC sliding window with a fine mosquito mesh panel",
    points: ["Smooth tandem rollers", "SS304 mesh-ready track", "Low-maintenance weather seal"],
    icon: Grid2X2,
  },
  {
    id: "casement",
    eyebrow: "02 / OPEN AIR",
    title: "Casement windows",
    description: "Open wide for light and ventilation, then close tight for a quieter room.",
    image: "/akshaya/images/casement.webp",
    alt: "White UPVC casement window open in a calm bedroom",
    points: ["Full opening ventilation", "Multi-point locking", "Easy-clean access"],
    icon: Compass,
  },
  {
    id: "french",
    eyebrow: "03 / STATEMENT DOORS",
    title: "French & patio doors",
    description: "A brighter connection to balconies, sit-outs and gardens with a refined profile.",
    image: "/akshaya/images/french-doors.webp",
    alt: "White UPVC French doors opening to a planted balcony",
    points: ["Tall-door reinforcement", "Secure shootbolts", "Wide natural-light opening"],
    icon: Layers3,
  },
  {
    id: "villa",
    eyebrow: "04 / VILLA SCALE",
    title: "Villa glazing",
    description: "Large-format openings with the comfort, security and finish a modern home deserves.",
    image: "/akshaya/images/villa.webp",
    alt: "Contemporary villa facade with large UPVC glazing",
    points: ["Large fixed panes", "Custom combinations", "Architectural facade finish"],
    icon: SunMedium,
  },
  {
    id: "tilt",
    eyebrow: "05 / EUROPEAN CONTROL",
    title: "Tilt & turn windows",
    description: "Tilt gently for everyday ventilation or turn wide when you want the room to open up.",
    image: "/akshaya/images/tilt-turn.webp",
    alt: "White UPVC tilt and turn window in a high-rise apartment",
    points: ["Two-way ventilation", "Secure high-rise opening", "Easy-clean access"],
    icon: CircleGauge,
  },
  {
    id: "arch",
    eyebrow: "06 / BESPOKE FORM",
    title: "Arches & combinations",
    description: "A custom composition for stairwells, double-height rooms and openings with character.",
    image: "/akshaya/images/arches.webp",
    alt: "Custom arched UPVC picture window in a villa stairwell",
    points: ["Template-led fabrication", "Fixed glass combinations", "Made around your architecture"],
    icon: Sparkles,
  },
];

const benefits = [
  { icon: ShieldCheck, title: "Built for Indian weather", body: "Sealed against rain, dust and daily heat without the upkeep of painted wood." },
  { icon: Wind, title: "A calmer room", body: "Multi-chamber profiles and the right glass help soften traffic and neighbourhood noise." },
  { icon: LockKeyhole, title: "Confidence at every close", body: "Strong reinforcement and secure hardware keep every opening feeling solid." },
  { icon: Sparkles, title: "A finish that stays fresh", body: "Crisp lines, clean glass and low-maintenance profiles keep your home looking considered." },
];

const process = [
  { number: "01", icon: Ruler, title: "Free measurement", body: "Share your location and requirements. We visit, assess the opening and measure carefully." },
  { number: "02", icon: Calculator, title: "Clear digital quote", body: "See an itemised recommendation with the opening style, glass and mesh options explained." },
  { number: "03", icon: Hammer, title: "Made to your opening", body: "Your frames are fabricated to the approved measurements and finish, not cut from a generic size." },
  { number: "04", icon: BadgeCheck, title: "Clean installation", body: "A planned installation closes the loop, with handover guidance and warranty documentation." },
];

export default function AkshayaMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brandName = cfg.companyName && cfg.companyName.toLowerCase() === "akshaya" ? "Akshaya" : (cfg.companyName || "Akshaya");
  const phone = cfg.companyContact || "";
  const email = cfg.companyEmail || "";
  const address = cfg.companyAddress || "Eedama temple Hno:1-72";
  const city = cityFromAddress(address);
  const whatsappNumber = digitsOnly(phone);
  const whatsappTarget = whatsappNumber.length === 10 ? "91" + whatsappNumber : whatsappNumber;
  const callTarget = whatsappNumber ? "tel:" + (whatsappNumber.length === 10 ? "+91" + whatsappNumber : "+" + whatsappNumber) : "#contact";
  const heroSubtitle = cfg.landingHeroSubtitle || "Thoughtfully made UPVC windows and doors for homes that deserve more light, more quiet and less maintenance.";

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [calcType, setCalcType] = useState<OpeningId>("sliding");
  const [calcWidth, setCalcWidth] = useState(5);
  const [calcHeight, setCalcHeight] = useState(4);
  const [calcGlass, setCalcGlass] = useState<GlassId>("clear");
  const [calcMesh, setCalcMesh] = useState(true);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formType, setFormType] = useState("Sliding windows");
  const [formSent, setFormSent] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/reviews/" + encodeURIComponent(client.id))
      .then((response) => response.ok ? response.json() : { reviews: [] })
      .then((data) => {
        if (active) setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      })
      .catch(() => {
        if (active) setReviews([]);
      })
      .finally(() => {
        if (active) setReviewsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [client.id]);

  const gallery = useMemo(() => {
    const configured = Array.isArray(cfg.landingGallery)
      ? cfg.landingGallery.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const generated = [
      "/akshaya/images/hero.webp",
      "/akshaya/images/sliding.webp",
      "/akshaya/images/casement.webp",
      "/akshaya/images/french-doors.webp",
      "/akshaya/images/villa.webp",
      "/akshaya/images/tilt-turn.webp",
    ];
    return Array.from(new Set([...configured, ...generated])).slice(0, 6);
  }, [cfg.landingGallery]);

  const sqft = Math.max(1, Math.round(calcWidth * calcHeight * 10) / 10);
  const baseRates: Record<OpeningId, number> = { sliding: 480, casement: 560, villa: 680, french: 620, tilt: 650, arch: 760 };
  const glassAdd: Record<GlassId, number> = { clear: 0, dgu: 140, tinted: 60 };
  const pricePerSqft = baseRates[calcType] + glassAdd[calcGlass] + (calcMesh ? 80 : 0);
  const minTotal = Math.round(sqft * pricePerSqft);
  const maxTotal = Math.round(sqft * (pricePerSqft + 90));
  const selectedProduct = productCatalog.find((product) => product.id === calcType) || productCatalog[0];
  const glassLabel = calcGlass === "dgu" ? "12mm DGU sound-control glass" : calcGlass === "tinted" ? "Sun-control tinted / frosted glass" : "5mm toughened clear glass";
  const WhatsAppLink = (message: string) => "https://wa.me/" + (whatsappTarget || "919999999999") + "?text=" + encodeURIComponent(message);
  const estimateMessage =
    "Hello " + brandName + "! I used your website estimate tool.\\n\\n" +
    "Opening: " + selectedProduct.title + "\\n" +
    "Dimensions: " + calcWidth + " ft x " + calcHeight + " ft (" + sqft + " sq.ft)\\n" +
    "Glass: " + glassLabel + "\\n" +
    "Mosquito mesh: " + (calcMesh ? "Included" : "Not required") + "\\n" +
    "Indicative range: Rs." + minTotal.toLocaleString("en-IN") + " - Rs." + maxTotal.toLocaleString("en-IN") + "\\n\\n" +
    "Please arrange a free site measurement and final quotation.";

  const handleLeadSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formPhone.trim()) return;
    const message =
      "Hi " + brandName + "! I would like a free site measurement.\\n\\n" +
      "Name: " + (formName || "Homeowner") + "\\n" +
      "Phone: " + formPhone + "\\n" +
      "Area: " + (formArea || city) + "\\n" +
      "Requirement: " + formType + "\\n\\n" +
      "Please let me know a convenient time.";
    window.open(WhatsAppLink(message), "_blank", "noopener,noreferrer");
    setFormSent(true);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="akshaya-root" id="top">
      <div className="ak-announcement">
        <div className="ak-container ak-announcement-inner">
          <span><Sparkles size={14} /> Signature windows for better everyday living</span>
          <span className="ak-announcement-right">
            <a href={callTarget}><Phone size={13} /> {phone || "Call for a consultation"}</a>
            <a href={"/" + slug + "/home"}>Client portal <ArrowRight size={13} /></a>
          </span>
        </div>
      </div>

      <header className={"ak-header " + (scrolled ? "is-scrolled" : "")}>
        <div className="ak-container ak-header-inner">
          <a href="#top" className="ak-brand" onClick={closeMenu}>
            <span className="ak-brand-mark" aria-hidden="true">A</span>
            <span><strong>{brandName}</strong><small>UPVC WINDOWS & DOORS</small></span>
          </a>
          <nav className={"ak-nav " + (menuOpen ? "is-open" : "")}>
            <a href="#products" onClick={closeMenu}>Products</a>
            <a href="#calculator" onClick={closeMenu}>Estimator</a>
            <a href="#comfort" onClick={closeMenu}>Why UPVC</a>
            <a href="#process" onClick={closeMenu}>Process</a>
            <a href="#lookbook" onClick={closeMenu}>Lookbook</a>
            <a href="#reviews" onClick={closeMenu}>Reviews</a>
            <a className="ak-nav-cta" href={WhatsAppLink("Hi " + brandName + "! I am exploring UPVC windows and doors for my home.")} target="_blank" rel="noreferrer" onClick={closeMenu}>
              WhatsApp us <ArrowRight size={15} />
            </a>
          </nav>
          <button type="button" className="ak-menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={22} /> : <span className="ak-menu-lines"><i /><i /></span>}
          </button>
        </div>
      </header>

      <section className="ak-hero" aria-labelledby="ak-hero-title">
        <div className="ak-hero-media" aria-hidden="true" />
        <div className="ak-hero-shade" aria-hidden="true" />
        <div className="ak-container ak-hero-grid">
          <div className="ak-hero-copy">
            <p className="ak-eyebrow"><span className="ak-eyebrow-line" /> A quieter way to come home</p>
            <h1 id="ak-hero-title">Open your home<br /><em>to more.</em></h1>
            <p className="ak-hero-intro">{heroSubtitle}</p>
            <div className="ak-hero-actions">
              <a className="ak-button ak-button-light" href="#calculator">Build your estimate <ArrowRight size={17} /></a>
              <a className="ak-button ak-button-ghost" href={callTarget}><Phone size={16} /> Talk to Akshaya</a>
            </div>
            <div className="ak-hero-note"><BadgeCheck size={17} /> Free measurement · clear pricing · made for your opening</div>
          </div>
          <div className="ak-hero-spec">
            <div className="ak-spec-top"><span>THE AKSHAYA STANDARD</span><span className="ak-live-dot">● READY TO DISCUSS</span></div>
            <div className="ak-spec-window"><span className="ak-window-pane pane-one" /><span className="ak-window-pane pane-two" /><span className="ak-window-handle" /></div>
            <div className="ak-spec-caption"><span>01 / 04</span><strong>Light, sealed in.</strong><small>Profiles and glass selected around how you live.</small></div>
            <div className="ak-spec-footer"><span>Window systems</span><span>Thoughtful by design <ArrowRight size={14} /></span></div>
          </div>
        </div>
      </section>

      <section className="ak-proof-rail" aria-label="Akshaya benefits">
        <div className="ak-container ak-proof-grid">
          <div><strong>10 yr</strong><span>profile warranty option</span></div>
          <div><strong>01</strong><span>clear digital estimate</span></div>
          <div><strong>0</strong><span>hidden measurement surprises</span></div>
          <div><strong>∞</strong><span>ways to make it yours</span></div>
        </div>
      </section>

      <section id="comfort" className="ak-section ak-comfort">
        <div className="ak-container">
          <div className="ak-section-heading ak-heading-split">
            <div><p className="ak-eyebrow ak-eyebrow-dark"><span className="ak-eyebrow-line" /> The everyday difference</p><h2>Quiet details.<br /><em>Big comfort.</em></h2></div>
            <p>Great windows do more than fill a wall. They change the way a room feels—cooler, calmer and easier to care for, day after day.</p>
          </div>
          <div className="ak-benefit-grid">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return <article className="ak-benefit-card" key={benefit.title}><span className="ak-card-index">0{index + 1}</span><Icon size={26} /><h3>{benefit.title}</h3><p>{benefit.body}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section id="products" className="ak-section ak-products">
        <div className="ak-container">
          <div className="ak-section-heading ak-heading-split ak-heading-light">
            <div><p className="ak-eyebrow"><span className="ak-eyebrow-line" /> The collection</p><h2>Made to frame<br /><em>your life.</em></h2></div>
            <p>From a compact bedroom window to a villa-scale opening, choose a system that feels right for your space, light and daily rhythm.</p>
          </div>
          <div className="ak-product-grid">
            {productCatalog.map((product, index) => {
              const Icon = product.icon;
              return <article className={"ak-product-card " + (index === 0 ? "is-featured" : "")} key={product.id}>
                <div className="ak-product-image"><img src={product.image} alt={product.alt} loading={index === 0 ? "eager" : "lazy"} /><span className="ak-product-number">0{index + 1}</span></div>
                <div className="ak-product-content"><div className="ak-product-meta"><span>{product.eyebrow}</span><Icon size={18} /></div><h3>{product.title}</h3><p>{product.description}</p><ul>{product.points.map((point) => <li key={point}><Check size={14} /> {point}</li>)}</ul><a href={WhatsAppLink("Hi " + brandName + ", I want to explore " + product.title + ". Please share the best options for my home.")} target="_blank" rel="noreferrer">Explore this system <ArrowRight size={15} /></a></div>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section id="calculator" className="ak-section ak-estimator">
        <div className="ak-container">
          <div className="ak-section-heading"><p className="ak-eyebrow ak-eyebrow-dark"><span className="ak-eyebrow-line" /> Your first conversation</p><h2>A useful number<br /><em>in 10 seconds.</em></h2><p>Use this as a starting point—not a sales trick. Your final quote follows a proper site measurement and the specification you approve.</p></div>
          <div className="ak-calc-card">
            <div className="ak-calc-controls">
              <div className="ak-calc-step"><span>01</span><div><small>OPENING STYLE</small><strong>What are you planning?</strong></div></div>
              <div className="ak-type-grid">
                {productCatalog.map((product) => {
                  const Icon = product.icon;
                  return <button type="button" key={product.id} className={"ak-type-button " + (calcType === product.id ? "is-active" : "")} onClick={() => setCalcType(product.id)}><Icon size={18} /><span>{product.title}</span></button>;
                })}
              </div>
              <div className="ak-calc-step"><span>02</span><div><small>OPENING SIZE</small><strong>{calcWidth} ft wide × {calcHeight} ft high</strong></div></div>
              <div className="ak-range-row">
                <label>Width <input type="range" min="2" max="14" step="0.5" value={calcWidth} onChange={(event) => setCalcWidth(Number(event.target.value))} /></label>
                <label>Height <input type="range" min="2" max="10" step="0.5" value={calcHeight} onChange={(event) => setCalcHeight(Number(event.target.value))} /></label>
              </div>
              <div className="ak-calc-step"><span>03</span><div><small>FINISHING TOUCHES</small><strong>Make it comfortable</strong></div></div>
              <div className="ak-select-row">
                <label>Glass<select value={calcGlass} onChange={(event) => setCalcGlass(event.target.value as GlassId)}><option value="clear">5mm toughened clear</option><option value="dgu">12mm DGU sound-control</option><option value="tinted">Sun-control tinted / frosted</option></select></label>
                <label>Mesh<select value={calcMesh ? "yes" : "no"} onChange={(event) => setCalcMesh(event.target.value === "yes")}><option value="yes">Include SS304 mesh</option><option value="no">Without mesh</option></select></label>
              </div>
            </div>
            <aside className="ak-calc-summary">
              <div className="ak-summary-kicker"><CircleGauge size={17} /> LIVE ESTIMATE</div>
              <p className="ak-summary-area">{sqft} <span>sq.ft</span></p>
              <dl><div><dt>Opening</dt><dd>{selectedProduct.title}</dd></div><div><dt>Glass</dt><dd>{calcGlass === "dgu" ? "DGU sound-control" : calcGlass === "tinted" ? "Sun-control" : "Toughened clear"}</dd></div><div><dt>Mesh</dt><dd>{calcMesh ? "Included" : "Not required"}</dd></div></dl>
              <div className="ak-price"><small>INDICATIVE RANGE</small><strong>₹{minTotal.toLocaleString("en-IN")} — ₹{maxTotal.toLocaleString("en-IN")}</strong><span>Fabrication and installation to be confirmed after measurement.</span></div>
              <a className="ak-button ak-button-teal" href={WhatsAppLink(estimateMessage)} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Send this to Akshaya <ArrowRight size={16} /></a>
            </aside>
          </div>
        </div>
      </section>

      <section id="acoustic" className="ak-section ak-acoustic">
        <div className="ak-container ak-acoustic-grid">
          <div><p className="ak-eyebrow"><span className="ak-eyebrow-line" /> Feel the difference</p><h2>Let the outside<br /><em>stay outside.</em></h2><p className="ak-muted-copy">Sound enters through gaps, glass and vibration. A considered UPVC system tackles all three, so the room gets back its calm.</p><a className="ak-text-link" href="#calculator">Choose sound-control glass <ArrowRight size={15} /></a></div>
          <div className="ak-sound-card">
            <div className="ak-sound-card-head"><span>ACOUSTIC LAYERS</span><span>DESIGNED TOGETHER</span></div>
            <div className="ak-sound-layers"><div className="ak-sound-row"><span className="ak-sound-icon">01</span><div><strong>Multi-chamber profile</strong><small>Air chambers break the path of vibration.</small></div><div className="ak-sound-bar"><i style={{ width: "44%" }} /></div></div><div className="ak-sound-row"><span className="ak-sound-icon">02</span><div><strong>Compression gaskets</strong><small>A tighter perimeter seal means fewer leaks.</small></div><div className="ak-sound-bar"><i style={{ width: "68%" }} /></div></div><div className="ak-sound-row"><span className="ak-sound-icon">03</span><div><strong>DGU sound-control glass</strong><small>Two panes and an air gap soften harsh noise.</small></div><div className="ak-sound-bar"><i style={{ width: "86%" }} /></div></div></div>
            <div className="ak-sound-foot"><span>Traffic, dust & heat</span><strong>→</strong><span>Better room comfort</span></div>
          </div>
        </div>
      </section>

      <section id="process" className="ak-section ak-process">
        <div className="ak-container"><div className="ak-section-heading"><p className="ak-eyebrow ak-eyebrow-dark"><span className="ak-eyebrow-line" /> No guesswork</p><h2>From first idea<br /><em>to final fit.</em></h2></div><div className="ak-process-grid">{process.map((step) => { const Icon = step.icon; return <article className="ak-process-card" key={step.number}><div className="ak-process-top"><span>{step.number}</span><Icon size={22} /></div><h3>{step.title}</h3><p>{step.body}</p></article>; })}</div></div>
      </section>

      <section id="lookbook" className="ak-section ak-lookbook">
        <div className="ak-container"><div className="ak-section-heading ak-heading-split ak-heading-light"><div><p className="ak-eyebrow"><span className="ak-eyebrow-line" /> A little inspiration</p><h2>See the room<br /><em>before the room.</em></h2></div><p>Explore a few ways our systems can sit inside modern Indian homes. Bring us your opening—we will help you make the right call.</p></div><div className="ak-gallery-grid">{gallery.map((image, index) => <figure className={"ak-gallery-item gallery-" + index} key={image}><img src={image} alt={"UPVC window and door design inspiration " + (index + 1)} loading="lazy" /><figcaption><span>LOOKBOOK / 0{index + 1}</span><strong>{index === 0 ? "A room with a view" : index === 1 ? "The everyday slider" : index === 2 ? "Open to the morning" : index === 3 ? "A doorway to outside" : index === 4 ? "Villa-scale calm" : "Your next opening"}</strong></figcaption></figure>)}</div></div>
      </section>

      <section id="reviews" className="ak-section ak-reviews">
        <div className="ak-container"><div className="ak-section-heading ak-heading-split"><div><p className="ak-eyebrow ak-eyebrow-dark"><span className="ak-eyebrow-line" /> Your experience matters</p><h2>Good work<br /><em>travels far.</em></h2></div><div><p>Every visible review below comes from Akshaya's approved customer feedback. No reviews yet? Tell us what you need and be the first conversation.</p><a className="ak-text-link" href={"/" + slug + "/review"}>Leave a review <ArrowRight size={15} /></a></div></div>{reviewsLoaded && reviews.length > 0 ? <div className="ak-review-grid">{reviews.slice(0, 3).map((review, index) => <article className="ak-review-card" key={review.id || index}><div className="ak-stars">{Array.from({ length: 5 }).map((_, starIndex) => <Star key={starIndex} size={15} fill={starIndex < Math.round(Number(review.rating) || 5) ? "currentColor" : "none"} />)}</div><p>“{review.review_text || "A customer shared feedback about their experience with Akshaya."}”</p><footer><strong>{review.customer_name || "Akshaya customer"}</strong><span>{review.role || review.source || "Verified feedback"}</span></footer></article>)}</div> : <div className="ak-review-empty"><div className="ak-review-empty-icon"><Star size={22} /></div><div><strong>Customer stories are being curated.</strong><p>Want to talk through your project first? We are ready when you are.</p></div><a href={WhatsAppLink("Hi " + brandName + "! I would like to discuss a window or door project.")} target="_blank" rel="noreferrer">Start a conversation <ArrowRight size={15} /></a></div>}</div>
      </section>

      <section id="contact" className="ak-contact">
        <div className="ak-container ak-contact-grid"><div className="ak-contact-copy"><p className="ak-eyebrow"><span className="ak-eyebrow-line" /> Your home, next</p><h2>Let’s make the<br /><em>opening count.</em></h2><p>Send us a few details. We will take it from there—with a real conversation, a careful measurement and a quote you can understand.</p><div className="ak-contact-facts"><a href={callTarget}><Phone size={18} /><span><small>Call</small><strong>{phone || "Talk to the team"}</strong></span></a><a href={WhatsAppLink("Hi " + brandName + "! I would like to plan a free site measurement.")} target="_blank" rel="noreferrer"><MessageCircle size={18} /><span><small>WhatsApp</small><strong>Message Akshaya</strong></span></a><div><MapPin size={18} /><span><small>Located at</small><strong>{address}</strong></span></div><div><Clock3 size={18} /><span><small>Best time to reach us</small><strong>We will coordinate a convenient visit</strong></span></div></div></div><div className="ak-form-card">{formSent ? <div className="ak-form-success"><div className="ak-success-icon"><Check size={26} /></div><h3>Message ready.</h3><p>Your WhatsApp conversation should be open. If it did not open, use the button below to try again.</p><a className="ak-button ak-button-teal" href={WhatsAppLink("Hi " + brandName + "! I would like a free site measurement.")} target="_blank" rel="noreferrer">Open WhatsApp <ArrowRight size={16} /></a></div> : <><div className="ak-form-kicker">FREE SITE MEASUREMENT</div><h3>Tell us what you are imagining.</h3><form onSubmit={handleLeadSubmit}><label>Name<input type="text" value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="Your name" /></label><label>Phone <span>*</span><input type="tel" value={formPhone} onChange={(event) => setFormPhone(event.target.value)} placeholder="10-digit mobile number" required /></label><label>Area / location<input type="text" value={formArea} onChange={(event) => setFormArea(event.target.value)} placeholder={city} /></label><label>What are you planning?<select value={formType} onChange={(event) => setFormType(event.target.value)}><option>Sliding windows</option><option>Casement windows</option><option>French & patio doors</option><option>Villa glazing</option><option>Not sure yet</option></select></label><button className="ak-button ak-button-teal" type="submit">Request my measurement <ArrowRight size={16} /></button><small className="ak-form-note">We use these details only to start your enquiry on WhatsApp.</small></form></>}</div></div>
      </section>

      <footer className="ak-footer"><div className="ak-container ak-footer-main"><div className="ak-footer-brand"><a href="#top" className="ak-brand"><span className="ak-brand-mark" aria-hidden="true">A</span><span><strong>{brandName}</strong><small>UPVC WINDOWS & DOORS</small></span></a><p>Thoughtful openings for homes that value light, quiet and lasting ease.</p><a className="ak-footer-portal" href={"/" + slug + "/home"}>Open client portal <ArrowRight size={15} /></a></div><div><h4>Explore</h4><a href="#products">Products</a><a href="#calculator">Estimator</a><a href="#comfort">Why UPVC</a><a href="#process">Process</a></div><div><h4>Start here</h4><a href="#contact">Free measurement</a><a href={WhatsAppLink("Hi " + brandName + "! I would like a window and door consultation.")} target="_blank" rel="noreferrer">WhatsApp us</a><a href={callTarget}>Call the team</a>{cfg.appDownloadUrl ? <a href={cfg.appDownloadUrl} target="_blank" rel="noreferrer">Open mobile app</a> : null}</div><div><h4>Contact</h4><span>{address}</span>{email ? <a href={"mailto:" + email}>{email}</a> : null}</div></div><div className="ak-container ak-footer-bottom"><span>© {new Date().getFullYear()} {brandName}. Crafted for better living.</span><span>UPVC WINDOWS · DOORS · COMFORT</span></div></footer>

      <a className="ak-floating-whatsapp" href={WhatsAppLink("Hi " + brandName + "! I am looking for UPVC windows and doors.")} target="_blank" rel="noreferrer" aria-label="Chat with Akshaya on WhatsApp"><MessageCircle size={18} /><span>Chat with Akshaya</span></a>
    </main>
  );
}
