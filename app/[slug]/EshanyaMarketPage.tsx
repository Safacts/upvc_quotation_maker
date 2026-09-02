"use client";

import "./eshanya.css";
import { FormEvent, useState, useEffect } from "react";
import { ArrowRight, Check, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props { client: any; slug: string; }

const fallbackProducts = [
  ["Sliding Windows", "Smooth-moving systems for balconies, bedrooms, and compact homes."],
  ["Casement Windows", "Ventilation-focused windows with practical sealing and easy cleaning."],
  ["UPVC Doors", "Main, balcony, and utility door options for residential and commercial spaces."],
  ["Mosquito Mesh", "Mesh options that support airflow while helping keep interiors comfortable."],
  ["Glass Options", "Discuss glass choices for privacy, safety, heat control, and noise reduction."],
  ["Custom Fabrication", "Made-to-measure solutions based on the opening, design, and site requirement."],
];

const benefits = [
  ["Noise control", "Tight sealing and suitable glass choices can help make interiors quieter."],
  ["Weather ready", "Select systems suited to Indian sun, rain, wind, and everyday use."],
  ["Low maintenance", "UPVC profiles are easy to clean and do not need regular painting."],
  ["Practical design", "Plan profiles, glass, mesh, hardware, and installation around the project."],
];

const process = ["Consultation", "Site visit", "Measurement", "Design", "Quotation", "Supply", "Installation", "Support"];

export default function EshanyaMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brand = cfg.companyName || "Eshanya Trade Links";
  const proprietor = cfg.companyProprietor || brand;
  const phone = cfg.companyContact || "";
  const email = cfg.companyEmail || "";
  const address = cfg.companyAddress || "Coimbatore, Tamil Nadu";
  const phoneDigits = phone.replace(/\D/g, "");
  const whatsapp = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const heroImage = cfg.landingHeroImage || "/eshanya/assets/upvc-hero-premium.png";
  const gallery = cfg.landingGallery.filter(Boolean);
  const services = cfg.landingServices.filter(Boolean);
  const products = services.length ? services.slice(0, 6).map((name) => [name, `Discuss ${name.toLowerCase()} options for your project with Eshanya Trade Links.`]) : fallbackProducts;
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const enquire = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!whatsapp) return;
    const message = encodeURIComponent(`Hello ${proprietor}, I need a UPVC quotation.\nName: ${data.get("name") || "Not provided"}\nPhone: ${data.get("phone") || "Not provided"}\nRequirement: ${data.get("requirement") || "UPVC windows and doors"}\nMessage: ${data.get("message") || ""}`);
    window.open(`https://wa.me/${whatsapp}?text=${message}`, "_blank", "noopener,noreferrer");
    setSent(true);
  };

  useEffect(() => {
    const video = document.getElementById("heroScrubVideo") as HTMLVideoElement | null;
    const scrub = document.querySelector(".eshanya-hero-scrub") as HTMLElement | null;
    const stage = document.querySelector(".eshanya-hero-stage") as HTMLElement | null;
    if (!video || !scrub || !stage) return;

    const VIDEO_URL = "/eshanya/assets/hero-scroll.mp4";

    // Five gates from scrub-pipeline.md (CSS and JS must match exactly)
    const GATES = [
      "(max-width: 720px)",
      "(orientation: portrait) and (max-width: 1024px)",
      "(orientation: portrait) and (pointer: coarse)",
      "(orientation: landscape) and (pointer: coarse) and (max-height: 560px)",
      "(prefers-reduced-motion: reduce)",
    ];

    let scrubOn = false;
    let rafId: number | null = null;
    let lastTick = 0;
    let target = 0;
    let shown = 0;
    let seekBusy = false;
    let pendingTime: number | null = null;
    let heroOnScreen = true;

    const heroProgress = () => {
      const rect = scrub.getBoundingClientRect();
      const scrollRange = scrub.offsetHeight - window.innerHeight;
      if (scrollRange <= 0) return 0;
      const progress = -rect.top / scrollRange;
      return Math.min(1, Math.max(0, progress));
    };

    const requestSeek = (t: number) => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      if (seekBusy) {
        pendingTime = t;
        return;
      }
      seekBusy = true;
      try {
        video.currentTime = Math.min(Math.max(0, t), video.duration);
      } catch {
        seekBusy = false;
      }
    };

    video.addEventListener("seeked", () => {
      seekBusy = false;
      if (pendingTime !== null) {
        const t = pendingTime;
        pendingTime = null;
        requestSeek(t);
      }
    });
    video.addEventListener("error", () => {
      seekBusy = false;
      pendingTime = null;
      stage.classList.add("video-failed");
    });

    const tick = (now: number) => {
      const dt = Math.min(100, now - (lastTick || now));
      lastTick = now;
      const k = 0.16;
      shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
      if (Math.abs(target - shown) < 0.0005) {
        shown = target;
        rafId = null;
        lastTick = 0;
      } else {
        rafId = requestAnimationFrame(tick);
      }
      if (video.duration) requestSeek(shown * video.duration);
    };

    const onScroll = () => {
      target = heroProgress();
      if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
    };

    // IntersectionObserver to rest the loop when hero off-screen
    const io = new IntersectionObserver(
      (entries) => {
        heroOnScreen = entries[0]?.isIntersecting ?? true;
        if (heroOnScreen && Math.abs(target - shown) > 0.0005 && rafId === null && scrubOn) {
          rafId = requestAnimationFrame(tick);
        } else if (!heroOnScreen && rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      { threshold: 0 }
    );
    io.observe(scrub);

    let blobLoaded = false;
    async function loadBlob() {
      if (blobLoaded) return;
      blobLoaded = true;
      try {
        const res = await fetch(VIDEO_URL);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        video!.src = url;
        video!.load();
        video!.addEventListener(
          "loadedmetadata",
          () => {
            stage!.classList.add("video-ready");
            target = heroProgress();
            shown = target;
            if (video!.duration) video!.currentTime = target * video!.duration;
          },
          { once: true }
        );
        // Promote to compositor layer
        video!.style.willChange = "transform";
      } catch {
        stage!.classList.add("video-failed");
      }
    }

    const enableScrub = () => {
      if (scrubOn) return;
      scrubOn = true;
      stage!.classList.remove("video-failed");
      // fetch as blob for Range-safe scrub (works even where host lacks Range)
      loadBlob();
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };

    const disableScrub = () => {
      if (!scrubOn) return;
      scrubOn = false;
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // Fallback: poster + autoplay loop for static hero (phones / reduced-motion)
      if (!video!.src) {
        video!.src = VIDEO_URL;
        video!.loop = true;
        video!.autoplay = true;
        video!.muted = true;
        video!.playsInline = true as any;
        video!.load();
        video!.play().catch(() => {});
      }
    };

    const applyHeroMode = () => {
      if (GATES.some((q) => window.matchMedia(q).matches)) disableScrub();
      else enableScrub();
    };

    const mqls = GATES.map((q) => window.matchMedia(q));
    mqls.forEach((m) => m.addEventListener("change", applyHeroMode));
    applyHeroMode();

    return () => {
      mqls.forEach((m) => m.removeEventListener("change", applyHeroMode));
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="eshanya-site">
      <header className="eshanya-site-header">
        <a className="eshanya-site-brand" href="#home" aria-label={`${brand} home`}>
          {cfg.logoUrl ? <img src={cfg.logoUrl} alt={`${brand} logo`} /> : <span className="eshanya-site-mark">ET</span>}
          <span><strong>ESHANYA</strong><small>TRADE LINKS</small></span>
        </a>
        <nav className={menuOpen ? "eshanya-site-nav open" : "eshanya-site-nav"} aria-label="Main navigation">
          {[["about", "About"], ["products", "Products"], ["process", "Process"], ["contact", "Contact"]].map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a className="eshanya-site-cta" href="#contact" onClick={() => setMenuOpen(false)}>Get quote <ArrowRight size={15} /></a>
        </nav>
        <button className="eshanya-site-menu" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu" aria-expanded={menuOpen}><span /><span /></button>
      </header>

      <main>
        <div className="eshanya-hero-scrub">
          <section className="eshanya-hero-stage" id="home" style={{ "--eshanya-hero": `url(${JSON.stringify(heroImage)})` } as React.CSSProperties}>
            <video
              id="heroScrubVideo"
              className="eshanya-site-hero-video"
              muted
              playsInline
              preload="metadata"
              poster={heroImage}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className="eshanya-site-hero-overlay" aria-hidden="true" />
            <div className="eshanya-site-hero-copy">
              <p className="eshanya-site-kicker">{brand} · Coimbatore · Tamil Nadu</p>
              <h1>{cfg.landingHeroTitle || "Trusted direction."}<em>Quality trade.</em></h1>
              <p className="eshanya-site-lede">{cfg.landingHeroSubtitle || "UPVC windows, doors, and practical trade solutions for homes and commercial spaces."}</p>
              <div className="eshanya-site-actions"><a className="eshanya-site-button primary" href="#contact">Get a consultation <ArrowRight size={17} /></a><a className="eshanya-site-button secondary" href="#products">Explore solutions</a></div>
            </div>
            <div className="eshanya-site-hero-badge" aria-label="Eshanya Trade Links brand promise"><strong>ET</strong><span>Global connections<br />lasting trust</span></div>
          </section>
        </div>

        <section className="eshanya-site-section" id="about"><p className="eshanya-site-kicker">About Eshanya</p><div className="eshanya-site-two-col"><figure><img src={gallery[0] || "/eshanya/assets/about-upvc-premium.png"} alt="UPVC window and door solutions from Eshanya Trade Links" /><figcaption>UPVC solutions for residential and commercial spaces.</figcaption></figure><div><h2>{cfg.landingAboutTitle || "Reliable trade solutions with a considered finish."}</h2><p>{cfg.landingAboutText || `${brand} helps customers discuss suitable UPVC windows, doors, glass, mesh, hardware, measurement, and installation requirements.`}</p><p>From the first enquiry to the quotation and follow-through, the focus is clear communication and a practical next step for every project.</p></div></div></section>

        <section className="eshanya-site-stats" aria-label="Eshanya business information"><div><strong>UPVC</strong><span>Windows and doors</span></div><div><strong>01</strong><span>Direct point of contact</span></div><div><strong>Coimbatore</strong><span>Tamil Nadu service base</span></div><div><strong>ETL</strong><span>Quotation prefix</span></div></section>

        <section className="eshanya-site-section" id="products"><div className="eshanya-site-heading"><p className="eshanya-site-kicker">Product range</p><h2>Built around the opening, the space, and the requirement.</h2></div><div className="eshanya-site-feature"><img src={gallery[1] || "/eshanya/assets/upvc-products.png"} alt="UPVC product options including windows, doors, mesh, and glass" /><div><p className="eshanya-site-kicker">Discuss your requirement</p><h3>Make the right choice before installation begins.</h3><p>Ask about profile styles, glass, mesh, hardware, sizing, and installation for your home, villa, apartment, office, or shop.</p></div></div><div className="eshanya-site-grid products">{products.map(([title, text], index) => <article key={`${title}-${index}`}><div className="eshanya-site-thumb" style={{ backgroundPosition: `${(index % 3) * 50}% ${index > 2 ? "100%" : "0"}` }} /><h3>{title}</h3><p>{text}</p></article>)}</div></section>

        <section className="eshanya-site-visual"><div><p className="eshanya-site-kicker">Professional finish</p><h2>Clean profiles, careful choices, dependable follow-through.</h2><p>Eshanya Trade Links is based in Coimbatore and welcomes genuine enquiries for UPVC windows, doors, and related project requirements.</p></div><figure><img src={gallery[2] || "/eshanya/assets/premium-window.png"} alt="Premium UPVC window with clear glass" /><figcaption>Discuss a finish that fits your space.</figcaption></figure></section>

        <section className="eshanya-site-section"><div className="eshanya-site-heading"><p className="eshanya-site-kicker">Why choose Eshanya</p><h2>A clear, human process from enquiry to support.</h2></div><div className="eshanya-site-grid benefits">{benefits.map(([title, text], index) => <article key={title}><div className="eshanya-site-benefit-thumb" style={{ backgroundPosition: `${index * 33.333}% 0` }} /><h3>{title}</h3><p>{text}</p></article>)}</div></section>

        <section className="eshanya-site-process" id="process"><p className="eshanya-site-kicker">Process</p><h2>From enquiry to installation.</h2><div className="eshanya-site-timeline">{process.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></div>)}</div></section>

        <section className="eshanya-site-section eshanya-site-faq"><div><p className="eshanya-site-kicker">FAQ</p><h2>Common questions.</h2></div><div>{[["What does Eshanya Trade Links supply?", "Eshanya discusses UPVC window and door solutions, including suitable sizes, glass, mesh, hardware, and installation requirements."], ["Do you discuss site measurement before quotation?", "A site visit and measurement discussion can help confirm dimensions, design, hardware, glass, and installation requirements."], ["Where is Eshanya Trade Links located?", address], ["How do I request a quotation?", "Use the enquiry form below or contact Eshanya directly to start a conversation."]].map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

        <section className="eshanya-site-contact" id="contact"><div><p className="eshanya-site-kicker">Get in touch</p><h2>Request a UPVC quote.</h2><dl><div><dt>Contact person</dt><dd>{proprietor}</dd></div>{phone && <div><dt>Phone</dt><dd><a href={`tel:${phone}`}>{phone}</a></dd></div>}{email && <div><dt>Email</dt><dd><a href={`mailto:${email}`}>{email}</a></dd></div>}<div><dt>Address</dt><dd>{address}</dd></div></dl></div><form onSubmit={enquire}><img src={gallery[3] || "/eshanya/assets/upvc-projects.png"} alt="UPVC residential and commercial project reference" /><label>Full name<input name="name" required placeholder="Your name" /></label><label>Phone number<input name="phone" required type="tel" placeholder="+91" /></label><label>Requirement<select name="requirement"><option>UPVC Windows and Doors</option>{products.map(([title]) => <option key={title}>{title}</option>)}</select></label><label>Message<textarea name="message" placeholder="Tell us about your project" rows={4} /></label><button type="submit">Send enquiry <Send size={16} /></button>{sent && <p className="eshanya-site-sent"><Check size={15} /> WhatsApp opened with your enquiry.</p>}</form></section>
      </main>
      {whatsapp && <a className="eshanya-site-whatsapp" href={`https://wa.me/${whatsapp}`} aria-label={`Chat with ${brand} on WhatsApp`}><MessageCircle size={24} /></a>}
      <footer className="eshanya-site-footer"><div><strong>{brand}</strong><p>UPVC windows, doors, and trade conversations from Coimbatore.</p></div><div><span>Business portal</span><a href={`/${slug}/home`}>Open portal <ArrowRight size={14} /></a></div><p>© 2026 {brand}. All rights reserved.</p></footer>
    </div>
  );
}
