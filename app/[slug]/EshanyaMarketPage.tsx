"use client";

import "./eshanya.css";
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  DoorOpen,
  Grid2X2,
  Layers3,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Ruler,
  ShieldCheck,
  Star,
  SunMedium,
  Wind,
  X,
} from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props {
  client: any;
  slug: string;
}

interface Review {
  id: number | string;
  customer_name: string;
  role?: string | null;
  rating: number;
  review_text: string;
  source?: string | null;
  created_at?: string | null;
  quotation_no?: string | null;
}

const systems = [
  {
    eyebrow: "Wide views / easy movement",
    title: "Sliding systems",
    image: "/eshanya/assets/luftung-living-v2.png",
    description: "A space-conscious direction for balconies, living rooms, and wider openings where the view matters.",
    bestFor: "Balconies · apartments · wide openings",
    points: ["No inward swing space", "Large daylight area", "Simple everyday movement"],
  },
  {
    eyebrow: "Ventilation / tighter close",
    title: "Casement windows",
    image: "/eshanya/assets/luftung-window-v2.png",
    description: "A hinged opening style for rooms where fresh air, access to the glass, and a positive close matter.",
    bestFor: "Bedrooms · kitchens · workspaces",
    points: ["Focused ventilation", "Accessible glass surfaces", "Clear open-or-close control"],
  },
  {
    eyebrow: "Access / statement openings",
    title: "Doors & glazing",
    image: "/eshanya/assets/luftung-hero-v2.png",
    description: "Practical door and fixed-glass combinations shaped around movement, visibility, privacy, and the building.",
    bestFor: "Entrances · patios · commercial spaces",
    points: ["Planned around circulation", "Coordinated glass choices", "Residential or commercial use"],
  },
];

const specification = [
  {
    icon: Grid2X2,
    number: "01",
    title: "Opening style",
    text: "Sliding, casement, fixed, or door—the right movement starts with available space and daily use.",
  },
  {
    icon: Layers3,
    number: "02",
    title: "Glass choice",
    text: "Daylight, privacy, safety, heat, and outside noise all influence the glass worth discussing.",
  },
  {
    icon: LockKeyhole,
    number: "03",
    title: "Hardware",
    text: "Handles, locks, rollers, and hinges shape how secure, smooth, and reassuring the opening feels.",
  },
  {
    icon: Wind,
    number: "04",
    title: "Sealing & mesh",
    text: "Weather exposure, ventilation, and insect protection determine the finishing details around the frame.",
  },
];

const process = [
  ["01", "Understand", "Room, opening, purpose, priorities"],
  ["02", "Measure", "Dimensions and site conditions"],
  ["03", "Specify", "Opening, glass, hardware, finish"],
  ["04", "Complete", "Confirmed supply and fitting scope"],
];

const faqs = [
  ["Sliding or casement—which should I choose?", "Sliding systems save swing space and suit wider openings. Casement systems are worth considering when stronger ventilation and a positive hinged close are priorities. The right answer depends on the room and opening."],
  ["What should I share for a first discussion?", "A clear photo, rough width and height, room type, preferred opening direction, and the outcome you want are enough to begin. Final measurements should be confirmed before an order."],
  ["Can Luftung help with a site visit?", "Contact Luftung to confirm measurement or site-visit availability for your location and project schedule."],
  ["Are colours, mesh, glass, and hardware options available?", "Options can vary by system and project. Luftung can explain the relevant choices and confirm current availability during the quotation discussion."],
];

export default function EshanyaMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brand = (cfg as any).subBrandName || "Luftung";
  const tagline = (cfg as any).subBrandTagline || "YOUR WINDOW TO THE WORLD";
  const parentBrand = cfg.companyName || "Eshanya Trade Links";
  const phone = cfg.companyContact || "9655091414";
  const email = cfg.companyEmail || "nitish.fce@gmail.com";
  const address = cfg.companyAddress || "28, KV Nagar, Villankurichi, Coimbatore - 641035";
  const proprietor = cfg.companyProprietor || "Nitishkrishna";
  const logo = "/eshanya/assets/luftung-logo.jpg";
  const digits = phone.replace(/\D/g, "");
  const whatsapp = digits.length === 10 ? `91${digits}` : digits;

  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const reviewClientId = client.id || slug;

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".lf-page");
    const header = document.querySelector(".lf-header");
    let animationFrame = 0;
    const updateMotion = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        header?.classList.toggle("scrolled", scrollY > 48);
        page?.style.setProperty("--lf-page-progress", String(Math.min(1, scrollY / scrollable)));
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const parallax = !reduceMotion && window.innerWidth > 820 ? Math.min(54, scrollY * 0.07) : 0;
        page?.style.setProperty("--lf-hero-parallax", `${parallax}px`);
        animationFrame = 0;
      });
    };
    updateMotion();
    window.addEventListener("scroll", updateMotion, { passive: true });
    window.addEventListener("resize", updateMotion, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".lf-reveal").forEach((element) => observer.observe(element));
    return () => {
      window.removeEventListener("scroll", updateMotion);
      window.removeEventListener("resize", updateMotion);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setReviewsLoaded(false);
    fetch(`/api/reviews/${encodeURIComponent(reviewClientId)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Review feed unavailable");
        return response.json();
      })
      .then((data) => setReviews(Array.isArray(data.reviews) ? data.reviews.slice(0, 6) : []))
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setReviews([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReviewsLoaded(true);
      });
    return () => controller.abort();
  }, [reviewClientId]);

  const enquire = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = encodeURIComponent(
      `Hello ${proprietor}, I visited the ${brand} website.\n\nName: ${data.get("name") || "Not provided"}\nPhone: ${data.get("phone") || "Not provided"}\nOpening: ${data.get("opening") || "Not selected"}\nRequirement: ${data.get("message") || "I would like to discuss UPVC windows or doors."}`
    );
    window.open(`https://wa.me/${whatsapp}?text=${message}`, "_blank", "noopener,noreferrer");
    setSent(true);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="lf-page">
      <header className="lf-header">
        <a className="lf-logo" href="#home" aria-label={`${brand} home`}>
          <img src={logo} alt={`${brand} logo`} />
          <span><strong>{brand.toUpperCase()}</strong><small>UPVC WINDOWS &amp; DOORS</small></span>
        </a>
        <nav className={menuOpen ? "lf-nav open" : "lf-nav"} aria-label="Main navigation">
          <a href="#story" onClick={closeMenu}>Why Luftung</a>
          <a href="#systems" onClick={closeMenu}>Systems</a>
          <a href="#specification" onClick={closeMenu}>What to choose</a>
          <a href="#process" onClick={closeMenu}>Process</a>
          <a href="#reviews" onClick={closeMenu}>Reviews</a>
          <a className="lf-nav-cta" href="#contact" onClick={closeMenu}>Book a consultation <ArrowRight size={15} /></a>
        </nav>
        <button className="lf-menu" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu" aria-expanded={menuOpen}>
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
        <span className="lf-scroll-progress" aria-hidden="true" />
      </header>

      <main>
        <section className="lf-hero" id="home">
          <div className="lf-hero-image"><Image src="/eshanya/assets/luftung-hero-v2.png" alt="Contemporary home with large UPVC windows and a glazed sliding door" fill priority quality={88} sizes="100vw" /></div>
          <div className="lf-hero-shade" />
          <div className="lf-hero-content">
            <div className="lf-overline"><span /> {tagline}</div>
            <h1><span>Designed around</span><em>how your space</em><span>should feel.</span></h1>
            <p>{brand} brings a considered approach to UPVC windows and doors—beginning with light, airflow, comfort, movement, and the way you live every day.</p>
            <div className="lf-hero-actions">
              <a className="lf-btn primary" href="#systems">Explore the systems <ArrowRight size={17} /></a>
              <a className="lf-btn glass" href="#contact">Discuss your opening</a>
            </div>
          </div>
          <div className="lf-parent-note"><span>A focused UPVC brand by</span><strong>{parentBrand}</strong></div>
          <div className="lf-hero-facts">
            <div><SunMedium size={18} /><span><b>More daylight</b><small>Plan the view and glass area</small></span></div>
            <div><Wind size={18} /><span><b>Useful ventilation</b><small>Choose how the opening moves</small></span></div>
            <div><ShieldCheck size={18} /><span><b>Everyday confidence</b><small>Discuss sealing and hardware</small></span></div>
          </div>
          <a className="lf-scroll" href="#story" aria-label="Scroll to discover"><span>Discover</span><ChevronDown size={16} /></a>
        </section>

        <section className="lf-story lf-section" id="story">
          <div className="lf-section-index"><span>01</span><b>THE LUFTUNG POINT OF VIEW</b></div>
          <div className="lf-story-grid">
            <div className="lf-story-copy lf-reveal lf-reveal-left">
              <p className="lf-kicker">Premium is not decoration</p>
              <h2>It is how the opening <em>works for the room.</em></h2>
              <p className="lf-lede">A premium window or door should not begin with a catalogue. It should begin with what the space needs—better light, useful airflow, easier movement, privacy, or a calmer interior.</p>
              <div className="lf-story-points">
                <div><span>01</span><p><b>Purpose before product</b>Choose around the room and daily use.</p></div>
                <div><span>02</span><p><b>Specification made clear</b>Understand the choices before deciding.</p></div>
                <div><span>03</span><p><b>A relationship behind the frame</b>Supported by {parentBrand}.</p></div>
              </div>
            </div>
            <figure className="lf-story-image lf-reveal lf-reveal-right lf-image-reveal">
              <Image src="/eshanya/assets/luftung-window-v2.png" alt="White and charcoal window and door systems in a bright interior" fill quality={86} sizes="(max-width: 820px) 100vw, 54vw" />
              <figcaption><span>LIGHT / AIR / MATERIAL</span><b>Details you can see.<br />Comfort you can feel.</b></figcaption>
            </figure>
          </div>
        </section>

        <section className="lf-systems lf-section" id="systems">
          <div className="lf-section-index"><span>02</span><b>WINDOW &amp; DOOR DIRECTIONS</b></div>
          <div className="lf-section-heading lf-reveal">
            <p className="lf-kicker">Start with the opening</p>
            <h2>Three ways to shape<br /><em>the experience.</em></h2>
            <p>These are starting points—not a one-size-fits-all catalogue. Final system, dimensions, finish, and availability should be confirmed for the project.</p>
          </div>
          <div className="lf-system-grid">
            {systems.map((system, index) => (
              <article className="lf-system-card lf-reveal" key={system.title}>
                <div className="lf-system-image"><Image src={system.image} alt={`${system.title} architectural reference`} fill quality={84} sizes="(max-width: 560px) 100vw, (max-width: 820px) 45vw, 33vw" /><span>0{index + 1}</span></div>
                <div className="lf-system-body">
                  <small>{system.eyebrow}</small>
                  <h3>{system.title}</h3>
                  <p>{system.description}</p>
                  <ul>{system.points.map((point) => <li key={point}><Check size={13} />{point}</li>)}</ul>
                  <div className="lf-best"><span>BEST STARTING POINT FOR</span><b>{system.bestFor}</b></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lf-spec" id="specification">
          <div className="lf-spec-intro lf-reveal">
            <div className="lf-section-index light"><span>03</span><b>SPECIFICATION, EXPLAINED</b></div>
            <p className="lf-kicker">What changes the result</p>
            <h2>The frame is only<br /><em>the beginning.</em></h2>
            <p>Performance comes from the complete opening: how it moves, what glass is used, which hardware operates it, and how the frame is finished around the wall.</p>
            <a href="#contact">Ask about your specification <ArrowRight size={16} /></a>
          </div>
          <div className="lf-spec-grid">
            {specification.map(({ icon: Icon, number, title, text }) => (
              <article className="lf-reveal" key={number}><div><span>{number}</span><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
        </section>

        <section className="lf-compare lf-section">
          <div className="lf-section-index"><span>04</span><b>MAKE THE FIRST DECISION</b></div>
          <div className="lf-compare-grid">
            <figure className="lf-compare-image lf-reveal lf-reveal-left lf-image-reveal"><Image src="/eshanya/assets/luftung-living-v2.png" alt="Living room opening onto a balcony through a wide sliding door" width={1536} height={1024} quality={86} sizes="(max-width: 820px) 100vw, 54vw" /><figcaption>A wide sliding direction for view, access, and space-conscious movement.</figcaption></figure>
            <div className="lf-compare-copy lf-reveal lf-reveal-right">
              <p className="lf-kicker">Sliding or casement?</p>
              <h2>Choose movement<br /><em>before appearance.</em></h2>
              <div className="lf-choice">
                <div><span>SLIDING</span><h3>When floor space and wide views lead</h3><p>Panels move along a track, keeping the room clear of an inward or outward swing.</p></div>
                <div><span>CASEMENT</span><h3>When ventilation and a hinged close lead</h3><p>The sash opens on hinges, making it a strong direction to discuss for airflow-focused rooms.</p></div>
              </div>
              <p className="lf-caveat">The opening size, wind exposure, usage, glass, hardware, and available system should still be confirmed before quotation.</p>
            </div>
          </div>
        </section>

        <section className="lf-process lf-section" id="process">
          <div className="lf-section-index"><span>05</span><b>FROM SPACE TO SPECIFICATION</b></div>
          <div className="lf-process-head lf-reveal"><p className="lf-kicker">A clearer project journey</p><h2>Four conversations.<br /><em>One confident decision.</em></h2></div>
          <div className="lf-process-grid">
            {process.map(([number, title, text]) => <article className="lf-reveal" key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
          </div>
          <figure className="lf-installation lf-reveal lf-image-reveal"><Image src="/eshanya/assets/luftung-installation-v2.png" alt="UPVC window frame being checked carefully during installation" fill quality={86} sizes="100vw" /><figcaption><span>MEASURED WITH INTENT</span><b>Good outcomes begin<br />before the frame arrives.</b></figcaption></figure>
        </section>

        <section className="lf-reviews lf-section" id="reviews">
          <div className="lf-section-index light"><span>06</span><b>VERIFIED CUSTOMER EXPERIENCES</b></div>
          <div className="lf-reviews-head lf-reveal">
            <div>
              <p className="lf-kicker">Proof without placeholders</p>
              <h2>Real experiences.<br /><em>Published with confidence.</em></h2>
            </div>
            <p>{brand} feedback is connected to the project journey—not copied from a template. Published reviews appear here only after they are submitted and approved for display.</p>
          </div>

          {!reviewsLoaded ? (
            <div className="lf-review-loading" aria-live="polite">Loading customer experiences…</div>
          ) : reviews.length > 0 ? (
            <>
              <div className="lf-review-summary lf-reveal">
                <strong>{(reviews.reduce((total, review) => total + Math.min(5, Math.max(1, Number(review.rating) || 1)), 0) / reviews.length).toFixed(1)}</strong>
                <div>
                  <span>{reviews.length} published {reviews.length === 1 ? "experience" : "experiences"}</span>
                  <small>Current visible Luftung review feed</small>
                </div>
              </div>
              <div className="lf-review-grid">
                {reviews.map((review) => {
                  const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
                  const initials = review.customer_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
                  return (
                    <article className="lf-review-card lf-reveal" key={review.id}>
                      <div className="lf-review-stars" aria-label={`${rating} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < rating ? "currentColor" : "none"} />)}
                      </div>
                      <blockquote>“{review.review_text}”</blockquote>
                      <div className="lf-review-author">
                        <span>{initials || "LC"}</span>
                        <div><strong>{review.customer_name}</strong><small>{review.role || "Luftung customer"}</small></div>
                        {review.quotation_no && <b><BadgeCheck size={14} /> Quote linked</b>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="lf-review-empty lf-reveal">
              <div className="lf-review-empty-copy">
                <span><BadgeCheck size={16} /> Genuine feedback only</span>
                <h3>The Luftung review book is now open.</h3>
                <p>Already received a Luftung quotation or completed a project? Share your experience. Approved feedback will be displayed here without stock names or invented testimonials.</p>
                <a href={`/${slug}/review`}>Share your experience <ArrowRight size={16} /></a>
              </div>
              <div className="lf-review-assurance" aria-label="Review standards">
                <div><b>01</b><span>Submitted by a customer</span></div>
                <div><b>02</b><span>Checked before display</span></div>
                <div><b>03</b><span>Published without stock copy</span></div>
              </div>
            </div>
          )}
          {reviews.length > 0 && <a className="lf-review-cta" href={`/${slug}/review`}>Share your Luftung experience <ArrowRight size={16} /></a>}
        </section>

        <section className="lf-faq lf-section">
          <div className="lf-section-index"><span>07</span><b>QUESTIONS BEFORE A QUOTE</b></div>
          <div className="lf-faq-grid">
            <div className="lf-reveal"><p className="lf-kicker">Useful answers</p><h2>Know enough to<br /><em>ask better questions.</em></h2><p>You do not need technical vocabulary. A photo, approximate measurements, and the outcome you want are enough to start.</p></div>
            <div className="lf-faq-list">
              {faqs.map(([question, answer], index) => <details className="lf-reveal" key={question} open={index === 0}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="lf-contact" id="contact">
          <div className="lf-contact-copy">
            <div className="lf-section-index light"><span>08</span><b>BEGIN WITH YOUR SPACE</b></div>
            <p className="lf-kicker">A useful first conversation</p>
            <h2>Show us the opening.<br /><em>Tell us the outcome.</em></h2>
            <p>Share a photo, approximate size, room type, or simply the change you want to make. Luftung will help identify the next questions.</p>
            <div className="lf-contact-list">
              <a href={`tel:${phone}`}><Phone size={17} /><span><small>CALL</small><b>{phone}</b></span></a>
              <a href={`mailto:${email}`}><MessageCircle size={17} /><span><small>EMAIL</small><b>{email}</b></span></a>
              <div><MapPin size={17} /><span><small>VISIT / SERVICE BASE</small><b>{address}</b></span></div>
            </div>
          </div>
          <form className="lf-form" onSubmit={enquire}>
            <div className="lf-form-top"><span>PROJECT ENQUIRY</span><b>01 / 01</b></div>
            <h3>Tell us what you are planning.</h3>
            <label>Your name<input name="name" placeholder="Name" /></label>
            <label>Phone number<input name="phone" type="tel" required placeholder="+91" /></label>
            <label>Opening<select name="opening" defaultValue=""><option value="" disabled>Select an option</option><option>Windows</option><option>Doors</option><option>Windows and doors</option><option>Not sure yet</option></select></label>
            <label>What should we understand?<textarea name="message" rows={4} placeholder="Room, approximate size, location, or the result you want" /></label>
            <button type="submit">Continue on WhatsApp <ArrowRight size={17} /></button>
            {sent && <p className="lf-sent"><Check size={15} /> WhatsApp opened with your enquiry.</p>}
          </form>
        </section>
      </main>

      <footer className="lf-footer">
        <div className="lf-footer-brand"><img src={logo} alt={`${brand} logo`} /><div><strong>{brand.toUpperCase()}</strong><span>UPVC WINDOWS &amp; DOORS</span></div></div>
        <p>{tagline}</p>
        <div><span>A focused brand by</span><strong>{parentBrand}</strong><a href={`/${slug}/home`}>Business portal <ArrowRight size={13} /></a></div>
        <div><span>Based in</span><strong>Coimbatore, Tamil Nadu</strong></div>
      </footer>
    </div>
  );
}
