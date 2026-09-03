"use client";

import "./eshanya.css";
import { FormEvent, useEffect, useState } from "react";
import { parseClientConfig } from "@/lib/types";

interface Props { client: any; slug: string; }

export default function EshanyaMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brand = cfg.companyName || "Eshanya Trade Links";
  const proprietor = cfg.companyProprietor || "Nithikrishna L.";
  const phone = cfg.companyContact || "9655091414";
  const email = cfg.companyEmail || "nithi.fc@gmail.com";
  const address = cfg.companyAddress || "28, KV Nagar Road, Vishweshwara Nagar, Villankurichi, Coimbatore - 641035, Tamil Nadu";
  const phoneDigits = phone.replace(/\D/g, "");
  const whatsapp = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const telHref = `tel:+${phoneDigits.startsWith("91") ? phoneDigits : `91${phoneDigits}`}`;
  // keep original static copy but inject tenant contact where it matters
  const heroImage = cfg.landingHeroImage || "/eshanya/assets/upvc-hero-premium.png";

  const products: [string, string][] = [
    ["Sliding Windows", "Smooth moving systems for balconies, bedrooms, and compact city homes."],
    ["Casement Windows", "Airtight profiles built for stronger sealing, ventilation, and easy cleaning."],
    ["UPVC Doors", "Elegant main, balcony, and utility doors with durable hardware choices."],
    ["Mosquito Mesh", "Integrated mesh options for airflow without compromising comfort."],
    ["Toughened Glass", "Glass combinations for safety, privacy, heat control, and noise reduction."],
    ["Custom Fabrication", "Made-to-measure solutions for villas, apartments, offices, and shops."],
  ];
  const benefits: [string, string][] = [
    ["Noise Control", "Multi-chambered profiles and tight sealing help create quieter interiors."],
    ["Weather Ready", "Designed for Indian sun, rain, wind, and daily temperature changes."],
    ["Low Maintenance", "No painting or polishing needed; easy to clean and built for long life."],
    ["Energy Efficient", "Better sealing reduces heat transfer and supports cooler indoor spaces."],
  ];
  const faqs: [string, string][] = [
    ["What does Eshanya Trade Links supply?", "Eshanya Trade Links focuses on UPVC window and door solutions for residential and commercial spaces, including custom sizes and glass options."],
    ["Do you visit the site before quotation?", "Yes. A site visit and measurement step helps confirm size, design, hardware, glass, and installation requirements."],
    ["Can I request a catalogue or product photos?", "Yes. Use the enquiry form or WhatsApp button to request product categories, profile options, and available finishes."],
    ["Where is the business located?", address],
  ];
  const [sent, setSent] = useState(false);
  const enquire = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = encodeURIComponent(`Hello Eshanya Trade Links, I need a UPVC quote.\nName: ${data.get("name") || ""}\nPhone: ${data.get("phone") || ""}\nRequirement: ${data.get("service") || ""}\nMessage: ${data.get("message") || ""}`);
    window.location.href = `https://wa.me/${whatsapp}?text=${message}`;
    setSent(true);
  };

  useEffect(() => {
    const reveals = document.querySelectorAll(".reveal");
    const ro = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            ro.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    reveals.forEach((el) => ro.observe(el));

    const hero = document.querySelector(".hero-section") as HTMLElement | null;
    const heroStage = document.querySelector(".hero-stage") as HTMLElement | null;
    const heroVideo = document.querySelector(".hero-video") as HTMLVideoElement | null;
    const loadRing = document.querySelector(".load-ring circle") as unknown as HTMLElement | null;
    const cursorLight = document.querySelector(".cursor-light") as HTMLElement | null;
    const siteHeader = document.querySelector(".site-header") as HTMLElement | null;
    if (!hero || !heroStage || !heroVideo) return;
    const VIDEO_URL = "/eshanya/assets/hero-scroll.mp4";
    const VIDEO_BYTES = 7561203;

    const updateHeader = () => siteHeader?.classList.toggle("is-scrolled", window.scrollY > 80);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    const onMouseMove = (event: MouseEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      if (cursorLight) cursorLight.style.transform = `translate(${event.clientX - 140}px, ${event.clientY - 140}px)`;
      if (heroStage && hero.matches(":hover")) {
        heroStage.style.setProperty("--move-x", `${x * 12}px`);
        heroStage.style.setProperty("--move-y", `${y * 10}px`);
      }
    };
    window.addEventListener("mousemove", onMouseMove);

    const staticHeroQueries = [
      "(max-width: 720px)",
      "(orientation: portrait) and (max-width: 1024px)",
      "(orientation: portrait) and (pointer: coarse)",
      "(orientation: landscape) and (pointer: coarse) and (max-height: 560px)",
      "(prefers-reduced-motion: reduce)",
    ];
    const mediaQueries = staticHeroQueries.map((q) => window.matchMedia(q));
    let scrubEnabled = false;
    let videoStarted = false;
    let targetProgress = 0;
    let shownProgress = 0;
    let rafId: number | null = null;
    let lastTick = 0;
    let seekBusy = false;
    let pendingTime: number | null = null;
    let heroVisible = true;
    let lastRequestedTime = -1;

    const heroProgress = () => {
      const rect = hero.getBoundingClientRect();
      const scrollable = Math.max(1, hero.offsetHeight - window.innerHeight);
      return Math.min(1, Math.max(0, -rect.top / scrollable));
    };

    heroVideo.addEventListener("error", () => {
      seekBusy = false;
      pendingTime = null;
      heroStage.classList.add("video-failed");
    });

    const requestSeek = (time: number) => {
      if (!heroVideo.duration || Number.isNaN(time)) return;
      const safeTime = Math.min(heroVideo.duration - 0.05, Math.max(0, time));
      if (Math.abs(safeTime - lastRequestedTime) < 0.055) return;
      lastRequestedTime = safeTime;
      if (seekBusy) {
        pendingTime = safeTime;
        return;
      }
      seekBusy = true;
      try {
        heroVideo.currentTime = safeTime;
      } catch {
        seekBusy = false;
      }
    };

    heroVideo.addEventListener("seeked", () => {
      seekBusy = false;
      if (pendingTime !== null) {
        const next = pendingTime;
        pendingTime = null;
        requestSeek(next);
      }
    });

    const tickScrub = (now: number) => {
      const delta = Math.min(100, now - (lastTick || now));
      lastTick = now;
      const smoothing = 0.12;
      shownProgress += (targetProgress - shownProgress) * (1 - Math.pow(1 - smoothing, delta / 16.667));
      heroStage.style.setProperty("--scroll-k", shownProgress.toFixed(3));
      requestSeek(shownProgress * heroVideo.duration);
      if (Math.abs(targetProgress - shownProgress) < 0.0012) {
        shownProgress = targetProgress;
        heroStage.style.setProperty("--scroll-k", shownProgress.toFixed(3));
        rafId = null;
        lastTick = 0;
        requestSeek(shownProgress * heroVideo.duration);
        return;
      }
      rafId = requestAnimationFrame(tickScrub);
    };

    const onScrubScroll = () => {
      targetProgress = heroProgress();
      if (scrubEnabled && heroVisible && rafId === null) rafId = requestAnimationFrame(tickScrub);
    };

    const loadHeroVideo = async () => {
      if (videoStarted) return;
      videoStarted = true;
      try {
        const response = await fetch(VIDEO_URL, { priority: "low" } as any);
        const total = Number(response.headers.get("Content-Length")) || VIDEO_BYTES;
        const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              const progress = Math.min(1, loaded / total);
              (loadRing as any)?.style?.setProperty("stroke-dashoffset", String(Math.round(126 * (1 - progress))));
            }
          }
          heroVideo.src = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "video/mp4" }));
        } else {
          const blob = await response.blob();
          heroVideo.src = URL.createObjectURL(blob);
        }
        heroVideo.load();
        heroVideo.addEventListener(
          "canplay",
          () => {
            heroStage.classList.add("video-ready");
            heroVideo.pause();
            targetProgress = heroProgress();
            shownProgress = targetProgress;
            heroStage.style.setProperty("--scroll-k", targetProgress.toFixed(3));
            requestSeek(targetProgress * heroVideo.duration);
            onScrubScroll();
          },
          { once: true }
        );
      } catch {
        heroStage.classList.add("video-failed");
      }
    };

    const enableScrub = () => {
      if (scrubEnabled) return;
      scrubEnabled = true;
      loadHeroVideo();
      window.addEventListener("scroll", onScrubScroll, { passive: true } as any);
      onScrubScroll();
    };
    const disableScrub = () => {
      scrubEnabled = false;
      window.removeEventListener("scroll", onScrubScroll as any);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      try {
        heroVideo.pause();
      } catch {}
    };
    const applyHeroMode = () => {
      if (mediaQueries.some((q) => q.matches)) disableScrub();
      else enableScrub();
    };

    const heroIO = new IntersectionObserver(
      ([entry]) => {
        heroVisible = !!entry?.isIntersecting;
        if (heroVisible) onScrubScroll();
        else
          try {
            heroVideo.pause();
          } catch {}
      },
      { threshold: 0 }
    );
    heroIO.observe(hero);
    mediaQueries.forEach((q) => q.addEventListener("change", applyHeroMode));
    applyHeroMode();

    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target as HTMLElement;
          const target = Number((item as any).dataset.count);
          const suffix = (item as any).dataset.suffix || "";
          const duration = target > 1000 ? 1400 : 900;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const value = Math.round(target * eased);
            item.textContent = `${value.toLocaleString("en-IN")}${p === 1 ? suffix : ""}`;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          countObserver.unobserve(item);
        });
      },
      { threshold: 0.7 }
    );
    document.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));

    return () => {
      ro.disconnect();
      heroIO.disconnect();
      countObserver.disconnect();
      window.removeEventListener("scroll", updateHeader as any);
      window.removeEventListener("scroll", onScrubScroll as any);
      window.removeEventListener("mousemove", onMouseMove as any);
      mediaQueries.forEach((q) => q.removeEventListener("change", applyHeroMode as any));
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <header className="site-header" aria-label="Main navigation">
        <a className="brand" href="#home" aria-label={`${brand} home`}>
          <img src="/eshanya/assets/eshanya-logo.jpeg" alt={`${brand} logo`} />
          <span>{brand.split(" ")[0]}</span>
        </a>
        <nav>
          <a href="#about">About</a>
          <a href="#products">Products</a>
          <a href="#process">Process</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="quote-link" href="#contact">Get Quote</a>
      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-stage">
            <div className="hero-poster" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(heroImage)})` }} />
            <video className="hero-video" preload="none" muted playsInline aria-hidden="true" tabIndex={-1} />
            <div className="hero-shade" />
            <svg className="load-ring" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth={3} strokeDasharray="126" style={{ strokeDashoffset: "var(--ld,126)" } as any} />
            </svg>
            <div className="hero-trust reveal" aria-label="Brand promise">
              <p className="hero-kicker">{brand}</p>
              <h1>
                <span className="hero-line">Trusted Direction.</span>
                <strong className="hero-line">Quality Trade.</strong>
              </h1>
              <p className="hero-caption">Premium UPVC windows, doors, and trade supply solutions for modern homes and commercial spaces.</p>
              <div className="hero-actions">
                <a className="primary-btn" href="#contact">Get Free Consultation</a>
                <a className="secondary-btn" href="#projects">Explore Projects</a>
              </div>
            </div>
            <div className="scroll-cue" aria-hidden="true">
              <span />
            </div>
          </div>
        </section>

        <section className="intro band" id="about">
          <div className="section-kicker">About Eshanya</div>
          <div className="intro-grid">
            <figure className="about-image reveal">
              <img src="/eshanya/assets/about-upvc-premium.png" alt="Premium UPVC sliding door and window installation with warm daylight" />
              <figcaption>Premium UPVC systems for modern homes and commercial spaces.</figcaption>
            </figure>
            <div className="about-copy reveal">
              <h2>Reliable UPVC trade solutions with a premium finish.</h2>
              <p>Eshanya Trade Links helps customers choose practical, good-looking UPVC windows and doors that suit local weather, daily use, budget, and architecture.</p>
              <p>From profile selection to glass, mesh, hardware, and measurement support, the focus is simple: clean design, durable performance, and a trusted buying experience.</p>
            </div>
          </div>
        </section>

        <section className="stats">
          <div><strong data-count="641035">0</strong><span>Coimbatore service area</span></div>
          <div><strong>UPVC</strong><span>Windows, doors, glazing</span></div>
          <div><strong data-count="10">0</strong><span>AM to 8 PM listed hours</span></div>
          <div><strong data-count="5" data-suffix=".0">0</strong><span>Online listing rating</span></div>
        </section>

        <section className="band" id="products">
          <div className="section-heading reveal">
            <p className="section-kicker">Product Range</p>
            <h2>Built for residential and commercial openings.</h2>
          </div>
          <div className="image-feature reveal">
            <img src="/eshanya/assets/upvc-products.png" alt="UPVC sliding door, casement window, mosquito mesh, and main door product examples" />
            <div>
              <p className="section-kicker">Category Visuals</p>
              <h3>Show customers the exact kind of systems you supply.</h3>
              <p>These visuals make the UPVC offering clearer at a glance: balcony sliding systems, casement ventilation, mesh protection, glass doors, and premium hardware details.</p>
            </div>
          </div>
          <div className="product-grid">
            {products.map(([title, body], index) => (
              <article key={title} className="product-card reveal" style={{ ["--panel" as any]: index }}>
                <div className="product-thumb" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="visual-band">
          <div className="visual-copy reveal">
            <p className="section-kicker">Professional Finish</p>
            <h2>Clean profiles, strong hardware, careful installation.</h2>
            <p>Use this section to showcase actual completed Eshanya projects once client photos are available. For now, the imagery presents the correct UPVC category and premium construction feel.</p>
          </div>
          <figure className="premium-window reveal">
            <img src="/eshanya/assets/premium-window.png" alt="Premium black framed UPVC window with clear glass and greenery outside" />
            <figcaption>Premium UPVC window systems with clean sightlines and strong sealing.</figcaption>
          </figure>
        </section>

        <section className="project-showcase band" id="projects">
          <div className="section-heading reveal">
            <p className="section-kicker">Project Types</p>
            <h2>Images for every place customers care about.</h2>
          </div>
          <div className="showcase-grid">
            <figure className="showcase-large reveal">
              <img src="/eshanya/assets/upvc-projects.png" alt="Residential balcony and commercial frontage with UPVC glazing" />
              <figcaption>Apartment balconies, villas, shops, offices, and frontage glazing.</figcaption>
            </figure>
            <figure className="showcase-card reveal">
              <img src="/eshanya/assets/upvc-hero.png" alt="Luxury villa with UPVC windows and doors" />
              <figcaption>Villa and independent house installations.</figcaption>
            </figure>
            <figure className="showcase-card reveal">
              <img src="/eshanya/assets/upvc-products.png" alt="Close views of UPVC sliding, casement, and door systems" />
              <figcaption>Product closeups for profile, mesh, glass, and handle choices.</figcaption>
            </figure>
          </div>
        </section>

        <section className="band">
          <div className="section-heading reveal">
            <p className="section-kicker">Why Choose Eshanya</p>
            <h2>Comfort details customers can feel every day.</h2>
          </div>
          <div className="benefit-grid">
            {benefits.map(([title, body]) => (
              <article key={title} className="benefit reveal">
                <div className="benefit-thumb" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="process-section" id="process">
          <p className="section-kicker">Process</p>
          <h2 className="reveal">From enquiry to installation.</h2>
          <div className="timeline">
            {["Consultation", "Site Visit", "Measurement", "Design", "Quotation", "Supply", "Installation", "Support"].map((step, index) => (
              <div key={step} className="timeline-item reveal" style={{ ["--i" as any]: index }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="faq band">
          <div>
            <p className="section-kicker">F.A.Q</p>
            <h2>Common questions.</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <details key={q} open={i === 0} className="reveal">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-info reveal">
            <p className="section-kicker">Get in Touch</p>
            <h2>Request a UPVC quote.</h2>
            <dl>
              <div><dt>Contact Person</dt><dd>{proprietor}</dd></div>
              <div><dt>Phone</dt><dd><a href={telHref}>{phone}</a></dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${email}`}>{email}</a></dd></div>
              <div><dt>Address</dt><dd>{address}</dd></div>
            </dl>
          </div>
          <form className="enquiry-form reveal" onSubmit={enquire}>
            <img className="form-image" src="/eshanya/assets/upvc-projects.png" alt="UPVC balcony and commercial glazing project reference" />
            <label>Full Name<input type="text" name="name" placeholder="Your name" /></label>
            <label>Phone Number<input type="tel" name="phone" placeholder="+91 90000 00000" /></label>
            <label>Requirement<select name="service"><option>UPVC Windows & Doors</option><option>Sliding Windows</option><option>UPVC Door</option><option>Site Measurement</option></select></label>
            <label>Message<textarea name="message" placeholder="Tell us about your project..." /></label>
            <button type="submit">Send Enquiry</button>
            {sent && <p style={{ color: "#0d777c", fontWeight: 700 }}>WhatsApp opened with your enquiry.</p>}
          </form>
        </section>
      </main>

      <a className="whatsapp" href={`https://wa.me/${whatsapp}`} aria-label="Chat with Eshanya Trade Links on WhatsApp"><span aria-hidden="true">◔</span></a>
      <div className="cursor-light" aria-hidden="true" />
      <footer>
        <div>
          <strong>{brand}</strong>
          <p>Dealer / Wholesaler for UPVC windows and doors.</p>
        </div>
        <p>© 2026 {brand}. All rights reserved.</p>
      </footer>
    </>
  );
}
