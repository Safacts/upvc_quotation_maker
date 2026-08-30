"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  Database,
  Download,
  Github,
  Linkedin,
  Mail,
  Phone,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import "./portfolio.css";

const PROJECTS = [
  {
    number: "01",
    eyebrow: "Rubix / AI education",
    title: "Nova My Mentor",
    description:
      "An AI-native learning platform that turns student behaviour and academic data into tailored explanations, intervention reports, and a more human learning loop.",
    details: ["Agentic analytics", "Local TTS microservices", "Automated parent escalations"],
    metric: "Production",
    metricLabel: "live platform",
    href: "https://novamymentor.cloud/",
    accent: "mint",
    icon: <BrainCircuit size={22} strokeWidth={1.7} />,
  },
  {
    number: "02",
    eyebrow: "Lead developer / production",
    title: "Acharya Ecosystem",
    description:
      "A production academic platform built around the messy reality of institutions: high-volume workflows, secure APIs, attendance automation, and an assistant that can actually take action.",
    details: ["1,700+ registered users", "50+ faculty", "70+ production REST APIs"],
    metric: "< 1 min",
    metricLabel: "attendance workflow",
    href: "https://aacharya.vitharn.com/",
    accent: "violet",
    icon: <Activity size={22} strokeWidth={1.7} />,
  },
  {
    number: "03",
    eyebrow: "Infrastructure / internal systems",
    title: "Nidhi",
    description:
      "A zero-touch DBaaS control plane that lets products self-register, provision isolated PostgreSQL and object storage, and recover without turning every deployment into a manual ritual.",
    details: ["PostgreSQL + MinIO", "Docker Compose + Nginx", "Delayed disaster recovery states"],
    metric: "< 1 min",
    metricLabel: "provisioning time",
    href: "#systems",
    accent: "amber",
    icon: <Database size={22} strokeWidth={1.7} />,
  },
  {
    number: "04",
    eyebrow: "Founder / vertical software",
    title: "Vitharn ERP Services",
    description:
      "Industry-specific business software for Indian fabricators — bringing quotations, customer portals, branded workflows, and reliability-first operations to small shops.",
    details: ["Multi-tenant product thinking", "Flutter + Next.js", "Recovery-first UX"],
    metric: "Real users",
    metricLabel: "real constraints",
    href: "https://app.vitharn.com/",
    accent: "blue",
    icon: <Server size={22} strokeWidth={1.7} />,
  },
];

const STACK = [
  "Python",
  "Django",
  "PostgreSQL",
  "Docker",
  "Linux",
  "React",
  "Next.js",
  "Flutter",
  "Local LLMs",
  "TTS",
  "MinIO",
  "GitHub Actions",
];

export default function AadisheshuPortfolio() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText("kongaaadisheshu@gmail.com");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.location.href = "mailto:kongaaadisheshu@gmail.com";
    }
  }

  return (
    <main className="portfolio-shell">
      <div className="portfolio-noise" aria-hidden="true" />
      <div className="portfolio-orb portfolio-orb-one" aria-hidden="true" />
      <div className="portfolio-orb portfolio-orb-two" aria-hidden="true" />

      <header className="portfolio-nav">
        <a className="portfolio-mark" href="#top" aria-label="Aadisheshu Konga home">
          <span>AK</span>
          <span className="portfolio-mark-name">Aadisheshu Konga</span>
        </a>
        <nav className="portfolio-nav-links" aria-label="Primary navigation">
          <a href="#work">Work</a>
          <a href="#systems">Systems</a>
          <a href="#about">About</a>
          <a className="portfolio-nav-contact" href="#contact">Let&apos;s talk <ArrowUpRight size={14} /></a>
        </nav>
      </header>

      <section className="portfolio-hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Software engineer · AI systems · platform infrastructure</div>
          <h1>
            I build the systems
            <span>behind ambitious products.</span>
          </h1>
          <p className="hero-lede">
            From a student insight becoming an intervention, to a shop owner sending a quote in seconds — I turn complex ideas into production software people can depend on.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#work">See selected work <ArrowDownRight size={17} /></a>
            <a className="button button-quiet" href="/aadisheshu-resume.pdf" target="_blank" rel="noreferrer">Download resume <Download size={16} /></a>
          </div>
          <div className="hero-proof">
            <span><Check size={15} /> Built end-to-end</span>
            <span><Check size={15} /> Operated in production</span>
            <span><Check size={15} /> Hyderabad, India</span>
          </div>
        </div>

        <div className="hero-console" aria-label="A live systems snapshot">
          <div className="console-topline"><span className="console-live"><i /> live / systems snapshot</span><span>AK—2026</span></div>
          <div className="console-visual">
            <div className="console-grid" />
            <div className="console-ring console-ring-large" />
            <div className="console-ring console-ring-small" />
            <div className="console-core"><Sparkles size={27} /><span>BUILD<br />WITH<br />CARE</span></div>
            <span className="console-node node-one">AI</span>
            <span className="console-node node-two">API</span>
            <span className="console-node node-three">OPS</span>
          </div>
          <div className="console-readout">
            <div><strong>04</strong><span>production<br />systems</span></div>
            <div><strong>∞</strong><span>curiosity<br />remaining</span></div>
            <div><strong>01</strong><span>reliable<br />next step</span></div>
          </div>
          <div className="console-footer"><Terminal size={14} /><span>ship useful things / keep them alive</span><span className="console-cursor">_</span></div>
        </div>
      </section>

      <div className="portfolio-ticker" aria-hidden="true">
        <div>Applied AI <b>✦</b> Production backends <b>✦</b> Resilient infrastructure <b>✦</b> Developer platforms <b>✦</b> Honest automation <b>✦</b> Applied AI <b>✦</b> Production backends <b>✦</b> Resilient infrastructure <b>✦</b></div>
      </div>

      <section className="portfolio-section work-section" id="work">
        <div className="section-heading">
          <div><span className="section-kicker">Selected work</span><h2>Useful software,<br /><em>not theatre.</em></h2></div>
          <p>Most of my favourite work sits where product ambition meets operational reality. These are the systems, workflows, and invisible foundations I&apos;ve helped make real.</p>
        </div>
        <div className="project-grid">
          {PROJECTS.map((project) => (
            <a className={`project-card project-${project.accent}`} href={project.href} key={project.title} target={project.href.startsWith("http") ? "_blank" : undefined} rel={project.href.startsWith("http") ? "noreferrer" : undefined}>
              <div className="project-card-top"><span className="project-number">{project.number}</span><span className="project-icon">{project.icon}</span></div>
              <span className="project-eyebrow">{project.eyebrow}</span>
              <h3>{project.title}<ArrowUpRight size={19} /></h3>
              <p>{project.description}</p>
              <div className="project-details">{project.details.map((detail) => <span key={detail}>{detail}</span>)}</div>
              <div className="project-bottom"><span><strong>{project.metric}</strong>{project.metricLabel}</span><span className="project-link">Open case <ArrowUpRight size={14} /></span></div>
            </a>
          ))}
        </div>
      </section>

      <section className="portfolio-section systems-section" id="systems">
        <div className="systems-panel">
          <div className="section-heading systems-heading">
            <div><span className="section-kicker">Under the hood</span><h2>My work is<br /><em>systems-shaped.</em></h2></div>
            <p>The fun is rarely just the feature. It&apos;s the data model, the failure mode, the deployment path, and what happens when the network disappears.</p>
          </div>
          <div className="systems-layout">
            <div className="systems-list">
              <div className="system-line"><span className="system-index">01</span><div><h3>Make the hard path boring</h3><p>Automate provisioning, testing, backups, release checks, and the small things that quietly decide whether a product is trustworthy.</p></div><ShieldCheck size={21} /></div>
              <div className="system-line"><span className="system-index">02</span><div><h3>Design for the real user</h3><p>Busy people, weak networks, wrong taps, interrupted sessions, and no patience for an error message that sounds like a server.</p></div><BrainCircuit size={21} /></div>
              <div className="system-line"><span className="system-index">03</span><div><h3>Keep the evidence honest</h3><p>A green build is not the same as a live feature. I care about the route, the browser, the bytes, and the experience at the end of the chain.</p></div><Activity size={21} /></div>
            </div>
            <div className="stack-card"><div className="stack-card-header"><span className="stack-pulse" /> working toolkit</div><div className="stack-tags">{STACK.map((item) => <span key={item}>{item}</span>)}</div><div className="stack-footer"><span>comfortable across the stack</span><ArrowUpRight size={16} /></div></div>
          </div>
        </div>
      </section>

      <section className="portfolio-section about-section" id="about">
        <div className="about-intro"><span className="section-kicker">A little context</span><h2>Builder by instinct.<br /><em>Engineer by habit.</em></h2></div>
        <div className="about-copy"><p>I&apos;m Aadisheshu — a software engineer working across applied AI, backend systems, and platform infrastructure. I like owning the whole loop: understand the problem, build the product, ship it, watch it, and make the next version calmer.</p><p>Currently a <strong>Founding Engineer at Rubix IT Solution Pvt Ltd</strong>, and the person behind products and internal systems spanning education, ERP, data infrastructure, and developer operations.</p><div className="about-meta"><div><span>Based in</span><strong>Hyderabad, India</strong></div><div><span>Education</span><strong>B.Tech · AI &amp; ML</strong></div><div><span>Operating mode</span><strong>End-to-end ownership</strong></div></div></div>
      </section>

      <section className="contact-section" id="contact">
        <div className="contact-glow" aria-hidden="true" />
        <div className="contact-copy"><span className="section-kicker">Open channel</span><h2>Have a hard problem<br /><em>worth building?</em></h2><p>I&apos;m always interested in thoughtful products, difficult systems, and work that leaves people with more time than it started with.</p></div>
        <div className="contact-actions"><button className="contact-email" onClick={copyEmail}>{copied ? <Check size={17} /> : <Mail size={17} />} {copied ? "Email copied" : "kongaaadisheshu@gmail.com"}</button><div className="contact-links"><a href="tel:+916304562779"><Phone size={15} /> Call</a><a href="https://www.linkedin.com/in/aadisheshu-konga" target="_blank" rel="noreferrer"><Linkedin size={15} /> LinkedIn</a><a href="https://github.com/Safacts" target="_blank" rel="noreferrer"><Github size={15} /> GitHub</a></div></div>
      </section>

      <footer className="portfolio-footer"><a className="portfolio-mark" href="#top"><span>AK</span><span className="portfolio-mark-name">Aadisheshu Konga</span></a><span>Built with intent · © 2026</span><a href="#top" className="back-top">Back to top <ArrowUpRight size={14} /></a></footer>
    </main>
  );
}
