"use client";

import "./market.css";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  Gauge,
  Hammer,
  Layers3,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Ruler,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wind,
  X,
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

type FormValues = {
  name: string;
  phone: string;
  area: string;
  product: string;
  message: string;
};

type Business = {
  name: string;
  logoUrl?: string;
  positioning: string;
  years: string;
  serviceArea: string;
  phone: string;
  whatsapp: string;
  address: string;
  workingHours: string;
  googleMapsEmbed: string;
};

type Product = { name: string; description: string };

const nav = ["Home", "Why uPVC", "Products", "Projects", "Process", "Contact"];

const DEFAULT_PRODUCTS: Product[] = [
  { name: "Sliding windows", description: "Space-efficient panels for balconies, bedrooms and everyday openings." },
  { name: "Casement windows", description: "Hinged openings designed for wide ventilation and a firm perimeter seal." },
  { name: "French doors", description: "Double-door configurations that create a broad, elegant opening." },
  { name: "Mesh solutions", description: "Integrated insect-screen options selected to suit the chosen opening style." },
];

const DEFAULT_BUSINESS_NAME = "uPVC";
const DEFAULT_POSITIONING = "Precisely fitted uPVC windows, doors and facade solutions";
const DEFAULT_SERVICE_AREA = "Hyderabad, Telangana";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

function firstPhoneDigits(contact: string): string {
  const matches = (contact || "").match(/\+?[\d][\d\s()-]*/g) || [];
  for (const m of matches) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }
  return "";
}

function toWhatsapp(phone: string): string {
  if (!phone) return "";
  if (phone.length === 10) return "91" + phone;
  if (phone.startsWith("91")) return phone;
  return "";
}

function serviceAreaFrom(address: string): string {
  const parts = (address || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pick = parts
    .slice(-2)
    .map((p) => p.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return pick.length ? pick.join(", ") : DEFAULT_SERVICE_AREA;
}

function buildProducts(services: string[]): Product[] {
  const names = services.length > 0 ? services : DEFAULT_PRODUCTS.map((p) => p.name);
  return names.slice(0, 6).map((name) => {
    const n = name.toLowerCase();
    let description = "Professionally fabricated and installed to suit your site.";
    if (n.includes("sliding")) description = "Space-efficient panels for balconies, bedrooms and everyday openings.";
    else if (n.includes("casement")) description = "Hinged openings designed for wide ventilation and a firm perimeter seal.";
    else if (n.includes("french")) description = "Double-door configurations that create a broad, elegant opening.";
    else if (n.includes("mesh")) description = "Integrated insect-screen options selected to suit the chosen opening style.";
    else if (n.includes("glass")) description = "Precision-cut glazing options to match the chosen opening.";
    return { name, description };
  });
}

function Brand({ business }: { business: Business }) {
  return (
    <a className="brand" href="#home" aria-label={`${business.name} home`}>
      {business.logoUrl ? (
        <img src={business.logoUrl} alt={`${business.name} Logo`} style={{ height: "40px", width: "auto", marginRight: "12px", objectFit: "contain", borderRadius: "4px" }} />
      ) : (
        <span className="brand-symbol"><span /></span>
      )}
      <span className="brand-copy"><strong>{business.name}</strong><small>WINDOWS · DOORS · FACADES</small></span>
    </a>
  );
}

function SessionLink({ slug, clientId }: { slug: string; clientId: string }) {
  const [isCustomer, setIsCustomer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLoggedIn =
      window.localStorage.getItem("portal_session") === "active" &&
      window.localStorage.getItem("portal_role") === "customer" &&
      window.localStorage.getItem("portal_client_id") === clientId;
    setIsCustomer(isLoggedIn);
  }, [clientId]);

  return <a href={isCustomer ? `/${slug}/home` : "/login"}>{isCustomer ? "Dashboard" : "Login"}</a>;
}

function Header({ business, slug, clientId }: { business: Business; slug: string; clientId: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={scrolled || open ? "site-header scrolled" : "site-header"}>
      <div className="header-inner">
        <Brand business={business} />
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((item) => <a href={`#${item.toLowerCase().replaceAll(" ", "-")}`} key={item}>{item}</a>)}
          <SessionLink slug={slug} clientId={clientId} />
        </nav>
        <a className="quote-pill" href="#contact">Get a free quote <ArrowRight size={16} /></a>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Open navigation">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav className="mobile-nav" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} aria-label="Mobile navigation">
            {nav.map((item, index) => (
              <motion.a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} onClick={() => setOpen(false)} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}>
                {item}<ChevronRight />
              </motion.a>
            ))}
            <SessionLink slug={slug} clientId={clientId} />
            <a className="mobile-quote" href="#contact" onClick={() => setOpen(false)}>Get a free quote</a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }} variants={fadeUp}>{children}</motion.div>;
}

function Hero({ business, heroImage }: { business: Business; heroImage: string }) {
  const reduced = useReducedMotion();
  return (
    <section id="home" className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-frame" aria-label="Project image placeholder">
        {heroImage ? (
          <img src={heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <div className="window-visual"><span /><span /><i /><b /></div>
            <p>REAL INSTALLED-PROJECT PHOTO<br />TO BE ADDED</p>
          </>
        )}
      </div>
      <motion.div className="hero-copy" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.09, delayChildren: 0.14 } } }}>
        <motion.div className="eyebrow" variants={fadeUp}><span /> Built for Hyderabad homes</motion.div>
        <h1>
          <motion.span variants={fadeUp}>Windows that</motion.span>
          <motion.span variants={fadeUp}>hold their <em>line.</em></motion.span>
        </h1>
        <motion.p variants={fadeUp}>{business.positioning}. Designed around your opening, measured on site, and installed by a specialist team.</motion.p>
        <motion.div className="hero-actions" variants={fadeUp}>
          <a className="button primary" href="#contact">Get a free quote <ArrowRight /></a>
          <a className="button secondary" href="#projects">View our work</a>
        </motion.div>
        <motion.div className="hero-trust" variants={fadeUp}>
          <span><strong>{business.years}</strong> years listed in Hyderabad</span>
          <span><strong>01</strong> site-measured solution</span>
          <span><strong>04</strong> clear project steps</span>
        </motion.div>
      </motion.div>
    </section>
  );
}

const benefits = [
  [Gauge, "Efficient by design", "Multi-chamber uPVC systems are designed to help limit unwanted heat transfer. Final performance depends on the selected profile and glass."],
  [Volume2, "Quieter interiors", "A correctly specified, glazed and installed system can reduce outside noise. Ask us to recommend the right build-up for your site."],
  [Sparkles, "Low upkeep", "No routine painting or polishing. Smooth frames are easy to wipe clean and do not rust."],
  [ShieldCheck, "Made for weather", "Sealed frames and purpose-selected hardware help manage rain, dust and daily exposure when properly installed."],
] as const;

function WhyUpvc() {
  return (
    <section id="why-upvc" className="section why-section">
      <div className="shell">
        <Reveal className="section-heading split">
          <div><span className="kicker">Why homeowners choose uPVC</span><h2>Comfort that works<br />quietly, every day.</h2></div>
          <p>Good windows are a system—not just a frame. Profile, reinforcement, glass, hardware, sealing and installation all matter.</p>
        </Reveal>
        <div className="benefit-grid">
          {benefits.map(([Icon, title, copy], index) => (
            <Reveal className="benefit-card" key={title}>
              <span className="index">0{index + 1}</span><Icon /><h3>{title}</h3><p>{copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Products({ products }: { products: Product[] }) {
  return (
    <section id="products" className="section products-section">
      <div className="shell">
        <Reveal className="section-heading split light">
          <div><span className="kicker">Product range</span><h2>One material.<br />Many ways to open.</h2></div>
          <p>Choose a starting point below. Exact sizes, configurations, glass and hardware are confirmed after a site visit.</p>
        </Reveal>
        <div className="product-grid">
          {products.map((product, index) => (
            <motion.article className="product-card" key={product.name} whileHover={{ y: -6 }} transition={{ duration: 0.25 }}>
              <div className={`product-diagram diagram-${index + 1}`} aria-hidden="true"><span /><i /><b /></div>
              <div className="product-copy"><span>0{index + 1}</span><h3>{product.name}</h3><p>{product.description}</p><a href="#contact">Enquire <ArrowRight /></a></div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Projects({ gallery }: { gallery: string[] }) {
  const placeholders = ["Sliding window installation", "French door installation", "Casement window installation", "Mesh screen detail"];
  return (
    <section id="projects" className="section projects-section">
      <div className="shell">
        <Reveal className="section-heading split">
          <div><span className="kicker">Completed projects</span><h2>Proof belongs<br />in the details.</h2></div>
          <p>Real installation photography has not been supplied yet. These clearly marked frames are ready for the client’s own project images.</p>
        </Reveal>
        <div className="project-grid">
          {placeholders.map((label, index) => {
            const url = gallery[index] || "";
            return (
              <motion.div className={`project-placeholder project-${index + 1}`} key={label} initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * 0.07 }}>
                {url ? (
                  <img src={url} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div className="mini-frame"><span /><i /></div>
                )}
                <small>PHOTO PLACEHOLDER</small><strong>{label}</strong>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const steps = [
  [MessageCircle, "Share your requirement", "Tell us the opening type, location and what you want to improve."],
  [Ruler, "Site measurement", "The team checks the opening, access and practical installation details."],
  [Layers3, "Clear quotation", "Configuration, glass, hardware, finish and scope are documented for review."],
  [Hammer, "Fabrication & installation", "The approved system is prepared and fitted, followed by a final walkthrough."],
] as const;

function Process() {
  return (
    <section id="process" className="section process-section">
      <div className="shell">
        <Reveal className="section-heading center"><span className="kicker">How a project moves</span><h2>Measured once. Managed clearly.</h2></Reveal>
        <div className="process-line">
          {steps.map(([Icon, title, copy], index) => (
            <Reveal className="step" key={title}><div><Icon /><span>{index + 1}</span></div><h3>{title}</h3><p>{copy}</p></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="trust-section">
      <div className="trust-copy">
        <Reveal><span className="kicker">What we will confirm with you</span><h2>A quote you can<br />actually compare.</h2><p>Before work begins, the proposed configuration should be clear—so you know what is included and what still needs a decision.</p></Reveal>
        <div className="check-list">{["Opening style and dimensions", "Profile and reinforcement", "Glass specification", "Hardware and locking", "Mesh requirement", "Installation scope"].map((item) => <span key={item}><CircleCheck />{item}</span>)}</div>
      </div>
      <div className="spec-card">
        <div className="spec-window"><span /><i /><b /></div>
        <div><small>SPECIFICATION FIRST</small><h3>Frame + glass + hardware + installation</h3><p>Every element plays a part. We help you choose them as one complete system.</p></div>
      </div>
    </section>
  );
}

function EnquiryForm({ business, products }: { business: Business; products: Product[] }) {
  const [status, setStatus] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();
  const onSubmit = (data: FormValues) => {
    const text = `Hi ${business.name}, I'd like a free quote for uPVC windows or doors.\n\nName: ${data.name}\nPhone: ${data.phone}\nArea: ${data.area}\nProduct: ${data.product}\nMessage: ${data.message || "Not provided"}`;
    if (!business.whatsapp) {
      setStatus("Your enquiry is ready. Add the confirmed WhatsApp number in src/config.ts to enable sending.");
      return;
    }
    setStatus("Opening WhatsApp with your enquiry…");
    window.open(`https://wa.me/${business.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <form className="quote-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-field"><label htmlFor="name">Name</label><input id="name" placeholder="Your name" {...register("name", { required: "Please enter your name" })} />{errors.name && <small>{errors.name.message}</small>}</div>
      <div className="form-field"><label htmlFor="phone">Phone</label><input id="phone" inputMode="tel" placeholder="Your mobile number" {...register("phone", { required: "Please enter your phone number", pattern: { value: /^[0-9+ ()-]{7,}$/, message: "Enter a valid phone number" } })} />{errors.phone && <small>{errors.phone.message}</small>}</div>
      <div className="form-field"><label htmlFor="area">City / area</label><input id="area" placeholder="e.g. Gachibowli" {...register("area", { required: "Please enter your area" })} />{errors.area && <small>{errors.area.message}</small>}</div>
      <div className="form-field"><label htmlFor="product">Interested in</label><select id="product" defaultValue="" {...register("product", { required: "Select a product" })}><option value="" disabled>Select a product</option>{products.map((product) => <option key={product.name}>{product.name}</option>)}</select>{errors.product && <small>{errors.product.message}</small>}</div>
      <div className="form-field full"><label htmlFor="message">Message</label><textarea id="message" rows={3} placeholder="Tell us about the openings or project" {...register("message")} /></div>
      <button type="submit">Prepare WhatsApp enquiry <ArrowRight /></button>
      {status && <p className="form-status" role="status">{status}</p>}
    </form>
  );
}

function Contact({ business, products }: { business: Business; products: Product[] }) {
  return (
    <section id="contact" className="contact-section">
      <div className="contact-copy">
        <Reveal><span className="kicker light-kicker">Start with your openings</span><h2>Tell us what<br />you’re planning.</h2><p>Share your area, product type and a short note. We’ll prepare a WhatsApp enquiry for review before anything is sent.</p></Reveal>
        <div className="contact-facts">
          <div><MapPin /><span>Service area<strong>{business.serviceArea}</strong></span></div>
          <div><Phone /><span>Phone<strong>{business.phone || "To be confirmed"}</strong></span></div>
          <div><Wind /><span>Speciality<strong>uPVC windows, doors & facade solutions</strong></span></div>
        </div>
      </div>
      <div className="form-panel"><span className="kicker">Request a quote</span><h3>Project details</h3><EnquiryForm business={business} products={products} /></div>
    </section>
  );
}

function Footer({ business }: { business: Business }) {
  return (
    <footer>
      <div className="footer-main"><div><Brand business={business} /><p>Precisely measured uPVC windows and doors for homes, renovations and building projects across Hyderabad.</p></div><div><h4>Explore</h4>{nav.slice(1).map((item) => <a href={`#${item.toLowerCase().replaceAll(" ", "-")}`} key={item}>{item}</a>)}</div><div><h4>Contact</h4><span>{business.serviceArea}</span><span>{business.phone || "Phone to be confirmed"}</span><a href="#contact">Request a quote</a></div></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} {business.name}</span><span>Business details, claims and project images require final client confirmation.</span><span>Powered by Vitharn ERP Services — Sole Proprietorship, Hyderabad.</span></div>
    </footer>
  );
}

function WhatsAppButton({ business }: { business: Business }) {
  const href = business.whatsapp ? `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(`Hi ${business.name}, I'd like a free quote for uPVC windows or doors.`)}` : "#contact";
  return <a className="floating-whatsapp" href={href} aria-label={business.whatsapp ? "Enquire on WhatsApp" : "Open quote form"}><MessageCircle /><span>{business.whatsapp ? "WhatsApp" : "Get quote"}</span></a>;
}

export default function MarketPage({ client, slug }: { client: any; slug: string }) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const phone = firstPhoneDigits(cfg.companyContact);
  const business: Business = {
    name: cfg.companyName || cfg.appName || DEFAULT_BUSINESS_NAME,
    logoUrl: cfg.logoUrl,
    positioning: cfg.landingHeroSubtitle || DEFAULT_POSITIONING,
    years: "7+",
    serviceArea: serviceAreaFrom(cfg.companyAddress),
    address: cfg.companyAddress,
    phone,
    whatsapp: toWhatsapp(phone),
    googleMapsEmbed: cfg.landingMapUrl,
    workingHours: "",
  };
  const products = buildProducts(cfg.landingServices);

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": business.name,
    "description": business.positioning,
    "url": `https://app.vitharn.com/${slug}`,
    "telephone": business.phone || "",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": cfg.companyAddress || "",
      "addressLocality": "Hyderabad",
      "addressRegion": "Telangana",
      "addressCountry": "IN"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 17.2444,
      "longitude": 78.9164
    },
    "areaServed": business.serviceArea,
    "serviceType": cfg.landingServices?.length > 0 ? cfg.landingServices : ["UPVC Windows", "UPVC Doors", "Structural Glazing", "Glass Facades"],
    "priceRange": "$$",
    "image": cfg.logoUrl || "",
    "sameAs": []
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <Header business={business} slug={slug} clientId={client.id} />
      <main>
        <Hero business={business} heroImage={cfg.landingHeroImage} />
        <WhyUpvc />
        <Products products={products} />
        <Projects gallery={cfg.landingGallery} />
        <Process />
        <Trust />
        <Contact business={business} products={products} />
      </main>
      <Footer business={business} />
      <WhatsAppButton business={business} />
    </>
  );
}
