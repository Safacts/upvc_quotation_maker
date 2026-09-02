"use client";

import "./eshanya.css";
import { useState } from "react";
import { ArrowRight, Check, Globe2, Handshake, MapPin, MessageCircle, PackageCheck, Phone, Send, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { parseClientConfig } from "@/lib/types";

interface Props {
  client: any;
  slug: string;
}

const serviceCards = [
  { number: "01", icon: Globe2, title: "Source with reach", text: "Tell us the product, specification, or quantity you need. Eshanya helps turn a requirement into a practical trade path." },
  { number: "02", icon: ShieldCheck, title: "Trade with clarity", text: "Clear conversations, dependable follow-through, and the right information before you commit." },
  { number: "03", icon: Truck, title: "Move business forward", text: "From first enquiry to dispatch coordination, every step is designed to feel simple and accountable." },
];

const promiseCards = [
  ["01", "Responsive by default", "A real person, a clear next step, and no unnecessary runaround."],
  ["02", "Specification-led", "We start with what the business actually needs—not a one-size-fits-all catalogue."],
  ["03", "Built on trust", "The Eshanya promise: global connections, lasting trust."],
  ["04", "Made for repeat trade", "Reliable service that can grow from one requirement into a long-term relationship."],
];

export default function EshanyaMarketPage({ client, slug }: Props) {
  const cfg = parseClientConfig(client.config || {}, client.id);
  const brand = cfg.companyName || "Eshanya Trade Links";
  const phone = cfg.companyContact || "";
  const email = cfg.companyEmail || "";
  const address = cfg.companyAddress || "Coimbatore, Tamil Nadu";
  const proprietor = cfg.companyProprietor || "Eshanya Trade Links";
  const logo = cfg.logoUrl;
  const whatsapp = phone.replace(/\D/g, "");
  const whatsappNumber = whatsapp.length === 10 ? `91${whatsapp}` : whatsapp;
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", requirement: "" });
  const [sent, setSent] = useState(false);

  const enquire = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.phone || !whatsappNumber) return;
    const message = encodeURIComponent(`Hello ${proprietor}, I visited the Eshanya Trade Links website.\n\nName: ${form.name || "Not provided"}\nPhone: ${form.phone}\nRequirement: ${form.requirement || "I would like to discuss a trade requirement."}`);
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, "_blank", "noopener,noreferrer");
    setSent(true);
  };

  return (
    <div className="eshanya-root">
      <div className="eshanya-grain" />
      <header className="eshanya-header">
        <a className="eshanya-brand" href="#top" aria-label={`${brand} home`}>
          {logo ? <img src={logo} alt={`${brand} logo`} /> : <span className="eshanya-mark">ET</span>}
          <span><strong>ESHANYA</strong><small>TRADE LINKS</small></span>
        </a>
        <nav className={menuOpen ? "eshanya-nav open" : "eshanya-nav"} aria-label="Main navigation">
          <a href="#approach" onClick={() => setMenuOpen(false)}>Our approach</a>
          <a href="#services" onClick={() => setMenuOpen(false)}>What we do</a>
          <a href="#promise" onClick={() => setMenuOpen(false)}>Our promise</a>
          <a href="#contact" className="eshanya-nav-cta" onClick={() => setMenuOpen(false)}>Start a conversation <ArrowRight size={15} /></a>
        </nav>
        <button className="eshanya-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu" aria-expanded={menuOpen}><span /><span /></button>
      </header>

      <main id="top">
        <section className="eshanya-hero">
          <div className="eshanya-hero-copy">
            <div className="eshanya-eyebrow"><span /> Coimbatore · Tamil Nadu · India</div>
            <h1>Trade that<br /><em>moves with you.</em></h1>
            <p className="eshanya-lede">Eshanya Trade Links connects serious requirements with dependable trade pathways—through responsive service, clear communication, and lasting relationships.</p>
            <div className="eshanya-actions">
              <a className="eshanya-button primary" href="#contact">Discuss a requirement <ArrowRight size={17} /></a>
              <a className="eshanya-button quiet" href="#services">Discover the approach</a>
            </div>
            <div className="eshanya-proof-row"><div><strong>01</strong><span>Direct point<br />of contact</span></div><div><strong>360°</strong><span>Trade support<br />mindset</span></div><div><strong>∞</strong><span>Room to build<br />together</span></div></div>
          </div>
          <div className="eshanya-network" aria-hidden="true">
            <div className="network-orbit orbit-one" /><div className="network-orbit orbit-two" /><div className="network-orbit orbit-three" />
            <div className="network-core"><span>ET</span><small>TRADE<br />LINKS</small></div>
            <i className="node node-a" /><i className="node node-b" /><i className="node node-c" /><i className="node node-d" />
            <svg viewBox="0 0 600 600" role="presentation"><path d="M80 410 C175 110 420 100 535 280" /><path d="M78 410 C215 510 410 515 535 280" /><path d="M80 410 C225 360 330 155 535 280" /></svg>
            <p>REQUIREMENT<br /><b>→</b> RELATIONSHIP</p>
          </div>
        </section>

        <section className="eshanya-intro" id="approach"><div className="eshanya-section-label">A better way to trade <span>01</span></div><div className="eshanya-intro-grid"><h2>Not just a listing.<br /><em>A dependable link.</em></h2><div><p>Eshanya Trade Links is built around a simple idea: business moves faster when the connection is trustworthy. We bring a more considered, more human experience to sourcing and trade.</p><p className="muted">Whether you are exploring a new requirement or building a repeat supply relationship, start with a conversation.</p><a className="text-link" href="#contact">Talk to Eshanya <ArrowRight size={16} /></a></div></div></section>

        <section className="eshanya-services" id="services"><div className="eshanya-section-label">How we show up <span>02</span></div><div className="eshanya-services-head"><h2>Trade support<br /><em>with intention.</em></h2><p>Evidence-safe positioning for a new business: focused on how Eshanya works, without inventing a product catalogue before the owner confirms it.</p></div><div className="eshanya-service-grid">{serviceCards.map(({ number, icon: Icon, title, text }) => <article key={number}><div className="service-top"><span>{number}</span><Icon size={23} /></div><h3>{title}</h3><p>{text}</p><a href="#contact" aria-label={`Discuss ${title}`}>Explore <ArrowRight size={15} /></a></article>)}</div></section>

        <section className="eshanya-promise" id="promise"><div className="promise-visual"><div className="promise-stamp"><Sparkles size={17} /><span>GLOBAL<br />CONNECTIONS</span><b>LASTING TRUST</b></div><div className="promise-lines" /></div><div className="promise-copy"><div className="eshanya-section-label">The Eshanya standard <span>03</span></div><h2>Small details.<br /><em>Serious difference.</em></h2><div className="promise-grid">{promiseCards.map(([number, title, text]) => <div key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>

        <section className="eshanya-contact" id="contact"><div className="contact-copy"><div className="eshanya-section-label">Begin here <span>04</span></div><h2>Tell us what<br /><em>needs moving.</em></h2><p>Share a requirement, a category, or simply the kind of trade relationship you are looking for. We will take it from there.</p><div className="contact-details"><a href={phone ? `tel:${phone}` : undefined}><Phone size={16} /> {phone || "Phone number to be confirmed"}</a><span><MapPin size={16} /> {address}</span><a href={email ? `mailto:${email}` : undefined}><MessageCircle size={16} /> {email || "Email to be confirmed"}</a></div></div><div className="contact-form-wrap"><form onSubmit={enquire}><h3>Start a conversation</h3><label>Your name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" /></label><label>Phone number<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" /></label><label>What can we help with?<textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} placeholder="Tell us about your requirement" rows={4} /></label><button type="submit">Send via WhatsApp <Send size={16} /></button>{sent && <p className="sent-note"><Check size={15} /> WhatsApp opened with your enquiry.</p>}</form></div></section>
      </main>
      <footer className="eshanya-footer"><div><a className="eshanya-brand footer-brand" href="#top"><span className="eshanya-mark">ET</span><span><strong>ESHANYA</strong><small>TRADE LINKS</small></span></a><p>Global connections. Lasting trust.</p></div><div><span>Client portal</span><a href={`/${slug}/home`}>Open business portal <ArrowRight size={14} /></a></div><div><span>Established in</span><strong>Coimbatore, India</strong></div></footer>
    </div>
  );
}
