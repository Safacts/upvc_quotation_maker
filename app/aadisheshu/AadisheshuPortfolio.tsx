"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Download,
  Github,
  Layers,
  Linkedin,
  Mail,
  Moon,
  Phone,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Zap,
} from "lucide-react";
import "./portfolio.css";

/* ─────────────────────────────────────────────────
   DATA
───────────────────────────────────────────────── */

const TELEMETRY_SERVICES = [
  { name: "nova_backend_http", status: "ONLINE", uptime: "Up 4d" },
  { name: "rubix_llama (Gemma 4B)", status: "ONLINE", uptime: "Up 4d" },
  { name: "nidhi-live-data-plane", status: "ONLINE", uptime: "Up 4d" },
  { name: "nova_kokoro (TTS)", status: "ONLINE", uptime: "Up 4d" },
  { name: "vitharn-platform-disha_api", status: "ONLINE", uptime: "Up 28h" },
  { name: "nova_frontend", status: "ONLINE", uptime: "Up 4d" },
  { name: "rubix_web", status: "ONLINE", uptime: "Up 4d" },
  { name: "umami-analytics", status: "ONLINE", uptime: "Up 4d" },
];

const PROJECTS = [
  {
    num: "01",
    eyebrow: "Rubix · Self-Hosted AI Learning Platform",
    title: "Nova My Mentor",
    desc: "An AI-native learning platform that turns student behaviour and academic data into personalized explanations and parent intervention reports. Runs a self-hosted Gemma 4B LLM (4-bit quantized) via llama.cpp and a Kokoro TTS microservice — zero third-party API dependencies, completely owned infrastructure.",
    tags: ["Python / Django", "Local LLM (Gemma 4B)", "Kokoro TTS", "Docker", "Redis"],
    metricVal: "Live",
    metricLabel: "Production platform",
    href: "https://novamymentor.cloud/",
    accent: "tc-green",
  },
  {
    num: "02",
    eyebrow: "Lead Developer · Academic Management ERP",
    title: "Acharya Ecosystem",
    desc: "A full-scale institutional academic platform featuring 70+ secure REST APIs, automated attendance tracking completed in under 60 seconds, role-based workflows, and an integrated autonomous assistant. Actively serving 1,700+ registered students and 50+ faculty members.",
    tags: ["Django REST", "PostgreSQL", "React", "GitHub Actions", "GHCR / Watchtower"],
    metricVal: "1,700+",
    metricLabel: "Active users",
    href: "https://aacharya.vitharn.com/",
    accent: "tc-violet",
  },
  {
    num: "03",
    eyebrow: "Internal Platform · Zero-Touch DBaaS",
    title: "Nidhi DBaaS Control Plane",
    desc: "An internal Database-as-a-Service that provisions isolated PostgreSQL + MinIO instances for microservices in under 60 seconds. Designed with automated streaming standby replication, hourly liveness probes, encrypted secrets, and zero-touch crash recovery.",
    tags: ["PostgreSQL", "MinIO", "Docker Compose", "Nginx", "pgvector"],
    metricVal: "< 60s",
    metricLabel: "Provisioning time",
    href: "#systems",
    accent: "tc-amber",
  },
  {
    num: "04",
    eyebrow: "Founder · Vertical SaaS for Manufacturing",
    title: "Vitharn ERP Services",
    desc: "Industry-tailored ERP and quoting engine designed specifically for Indian UPVC fabricators. Features real-time BOM costing, branded customer portals, and multi-tenant mobile applications with automated CI/CD client APK builds.",
    tags: ["Next.js", "Flutter / Dart", "Supabase", "Vercel", "Multi-tenant"],
    metricVal: "Production",
    metricLabel: "Active customers",
    href: "https://app.vitharn.com/",
    accent: "tc-blue",
  },
];

const EXPERIENCES = [
  {
    date: "2024 — Present",
    role: "Founding Engineer",
    company: "Rubix IT Solution Pvt. Ltd.",
    body: "First engineer. Architected and deployed the core Nova My Mentor platform (custom LLM inference pipeline, TTS microservice, student analytics), Acharya ERP (70+ REST endpoints, 1,700+ users), and Nidhi DBaaS. Maintain a production VPS fleet running 15+ containerized services.",
    tags: ["Full-Stack", "AI/LLM Infra", "DevOps & SRE", "Platform Engineering"],
  },
  {
    date: "2024 — Present",
    role: "Founder & Solo Engineer",
    company: "Vitharn ERP Services",
    body: "Bootstrapped and built a vertical ERP for UPVC fabricators. Designed multi-tenant architecture, created Flutter mobile applications with dynamic theming, and built the full Next.js cloud portal and database schema.",
    tags: ["Flutter", "Next.js", "Supabase", "Architecture"],
  },
  {
    date: "2022 — 2026",
    role: "B.Tech — Artificial Intelligence & Machine Learning",
    company: "Hyderabad, India",
    body: "Specialized in distributed AI systems, neural inference optimization, and systems engineering. Continuously applied academic concepts directly into production environments.",
    tags: ["AI/ML", "Applied Systems", "Distributed Computing"],
  },
];

const SKILLS = [
  "Python", "Django REST", "PostgreSQL", "pgvector", "Docker", "Linux / SRE",
  "Nginx", "GitHub Actions", "React", "Next.js", "Flutter", "Dart",
  "Local LLMs", "llama.cpp", "Kokoro TTS", "MinIO", "Redis", "Supabase", "Vercel", "Watchtower"
];

/* ─────────────────────────────────────────────────
   ANIMATED COUNT UP COMPONENT
───────────────────────────────────────────────── */
function CountUp({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isStarted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isStarted.current) {
          isStarted.current = true;
          const start = performance.now();
          const duration = 1400;

          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const easeOutQuad = 1 - (1 - progress) * (1 - progress);
            setCount(Math.floor(easeOutQuad * target));

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setCount(target);
            }
          };

          requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

/* ─────────────────────────────────────────────────
   ANIMATED PARTICLES CANVAS HOOK
───────────────────────────────────────────────── */
function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, theme: string) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    particles = Array.from({ length: 48 }, () => ({
      x: Math.random() * (canvas?.width || 800),
      y: Math.random() * (canvas?.height || 600),
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 1.5 + 0.8,
    }));

    const draw = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particleColor = theme === "dark" ? "rgba(184, 243, 151, 0.6)" : "rgba(0, 214, 104, 0.45)";
      const lineColorBase = theme === "dark" ? "184, 243, 151" : "0, 214, 104";

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 115) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const alpha = (1 - dist / 115) * 0.16;
            ctx.strokeStyle = `rgba(${lineColorBase}, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [theme, canvasRef]);
}

/* ─────────────────────────────────────────────────
   TYPEWRITER HOOK
───────────────────────────────────────────────── */
function useTypewriter(phrases: string[], speed = 60, pause = 2200) {
  const [display, setDisplay] = useState("");
  const stateRef = useRef({ index: 0, charIndex: 0, deleting: false });

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const step = () => {
      const { index, charIndex, deleting } = stateRef.current;
      const current = phrases[index];

      if (!deleting && charIndex < current.length) {
        setDisplay(current.slice(0, charIndex + 1));
        stateRef.current.charIndex++;
        timeout = setTimeout(step, speed);
      } else if (!deleting && charIndex === current.length) {
        stateRef.current.deleting = true;
        timeout = setTimeout(step, pause);
      } else if (deleting && charIndex > 0) {
        setDisplay(current.slice(0, charIndex - 1));
        stateRef.current.charIndex--;
        timeout = setTimeout(step, speed / 2);
      } else {
        stateRef.current.deleting = false;
        stateRef.current.index = (index + 1) % phrases.length;
        stateRef.current.charIndex = 0;
        timeout = setTimeout(step, 400);
      }
    };

    timeout = setTimeout(step, 600);
    return () => clearTimeout(timeout);
  }, [phrases, speed, pause]);

  return display;
}

/* ─────────────────────────────────────────────────
   MAIN PORTFOLIO COMPONENT
───────────────────────────────────────────────── */
export default function AadisheshuPortfolio() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [terminalTab, setTerminalTab] = useState<"docker" | "arch" | "specs">("docker");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Restore user theme preference
  useEffect(() => {
    const stored = localStorage.getItem("ak_theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ak_theme", next);
  };

  // Scroll reveal animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll(".ak-reveal");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  useParticleCanvas(canvasRef, theme);

  const typedRole = useTypewriter([
    "autonomous AI systems",
    "high-throughput backends",
    "zero-touch infrastructure",
    "reliable production software",
  ]);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText("kongaaadisheshu@gmail.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      window.location.href = "mailto:kongaaadisheshu@gmail.com";
    }
  };

  const tickerItems = [...TELEMETRY_SERVICES, ...TELEMETRY_SERVICES];

  return (
    <div className="ak-root" data-theme={theme} id="top">
      {/* ── LIVE TELEMETRY TICKER ── */}
      <div className="telemetry-ticker" aria-hidden="true">
        <div className="telemetry-track">
          {tickerItems.map((item, idx) => (
            <div className="telemetry-item" key={idx}>
              <span className="telemetry-pulse" />
              <span className="telemetry-name">{item.name}</span>
              <span>—</span>
              <span className="telemetry-stat">{item.uptime}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── HEADER NAVIGATION ── */}
      <header className="ak-nav">
        <div className="ak-nav-inner">
          <a href="#top" className="ak-brand" aria-label="Aadisheshu Konga Home">
            <div className="ak-logo">AK</div>
            <div className="ak-brand-text">
              <span className="ak-brand-name">Aadisheshu Konga</span>
              <span className="ak-brand-role">Founding Engineer · Rubix</span>
            </div>
          </a>

          <div className="ak-nav-actions">
            <nav className="ak-nav-links" aria-label="Primary Navigation">
              <a href="#work">Projects</a>
              <a href="#experience">Experience</a>
              <a href="#systems">Architecture</a>
              <a href="#contact">Contact</a>
            </nav>

            <button
              onClick={toggleTheme}
              className="ak-theme-btn"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <a href="#contact" className="ak-cta-btn">
              Get in touch <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="ak-hero">
        <canvas ref={canvasRef} className="ak-hero-canvas" aria-hidden="true" />
        <div className="ak-hero-grid-bg" aria-hidden="true" />

        <div className="ak-container">
          <div className="ak-hero-grid">
            {/* Left Hero Content */}
            <div className="ak-reveal is-visible">
              <div className="ak-hero-badge">
                <span className="ak-badge-dot" />
                <span>Founding Engineer · Systems Architect</span>
              </div>

              <h1 className="ak-hero-title">
                Architecting <span className="ak-gradient-text">resilient systems</span> &amp; applied AI.
              </h1>

              <p className="ak-hero-tagline">
                I build <span className="ak-typewriter-text">{typedRole}</span>
                <span className="ak-cursor" aria-hidden="true" />
                <br />
                From custom LLM microservices to automated ERP platforms — built end-to-end for real operational scale.
              </p>

              <div className="ak-hero-btns">
                <a href="#work" className="btn-primary">
                  Explore Architecture <ArrowUpRight size={16} />
                </a>
                <a
                  href="/aadisheshu-resume.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  <Download size={15} /> Resume (PDF)
                </a>
              </div>
            </div>

            {/* Right Live Production Terminal with Interactive Tabs */}
            <div className="ak-terminal-card ak-reveal is-visible" aria-label="Production Telemetry Console">
              <div className="ak-term-header">
                <div className="ak-term-dots">
                  <span className="ak-term-dot ak-dot-red" />
                  <span className="ak-term-dot ak-dot-yellow" />
                  <span className="ak-term-dot ak-dot-green" />
                </div>

                {/* Interactive Terminal Tabs */}
                <div className="ak-term-tabs">
                  <button
                    onClick={() => setTerminalTab("docker")}
                    className={`ak-term-tab ${terminalTab === "docker" ? "active" : ""}`}
                  >
                    docker ps
                  </button>
                  <button
                    onClick={() => setTerminalTab("arch")}
                    className={`ak-term-tab ${terminalTab === "arch" ? "active" : ""}`}
                  >
                    arch.json
                  </button>
                  <button
                    onClick={() => setTerminalTab("specs")}
                    className={`ak-term-tab ${terminalTab === "specs" ? "active" : ""}`}
                  >
                    specs.log
                  </button>
                </div>

                <div className="ak-term-status">
                  <span className="ak-badge-dot" /> LIVE
                </div>
              </div>

              {/* Terminal Body Content Based on Selected Tab */}
              <div className="ak-term-body">
                {terminalTab === "docker" && (
                  <>
                    <div className="term-row">
                      <span className="term-prompt">$</span>
                      <span className="term-cmd">docker ps --format &quot;table &#123;&#123;.Names&#125;&#125; \t &#123;&#123;.Status&#125;&#125;&quot;</span>
                    </div>
                    <div style={{ height: 8 }} />
                    <div className="term-container-row">
                      <span className="tc-name tc-green">nova_backend_http</span>
                      <span className="tc-uptime">Up 4 days (healthy)</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-green">nova_frontend</span>
                      <span className="tc-uptime">Up 4 days (healthy)</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-violet">rubix_llama (Gemma 4B)</span>
                      <span className="tc-uptime">Up 4 days (healthy)</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-violet">nova_kokoro (TTS engine)</span>
                      <span className="tc-uptime">Up 4 days (healthy)</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-amber">nidhi-live-data-plane</span>
                      <span className="tc-uptime">Up 4 days (healthy)</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-amber">nidhi-production-minio</span>
                      <span className="tc-uptime">Up 17 hours</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-blue">vitharn-platform-disha</span>
                      <span className="tc-uptime">Up 28 hours</span>
                    </div>
                    <div className="term-container-row">
                      <span className="tc-name tc-blue">rubix_web</span>
                      <span className="tc-uptime">Up 4 days</span>
                    </div>
                    <div style={{ height: 8 }} />
                    <div className="term-row">
                      <span className="term-prompt">$</span>
                      <span style={{ color: "var(--accent)" }}>✓ All 15+ microservices nominal</span>
                    </div>
                  </>
                )}

                {terminalTab === "arch" && (
                  <>
                    <div className="term-row">
                      <span className="term-prompt">$</span>
                      <span className="term-cmd">cat /etc/rubix/topology.json</span>
                    </div>
                    <div style={{ height: 8 }} />
                    <div style={{ color: "#a78bfa", fontSize: 11 }}>
                      &#123;<br />
                      &nbsp;&nbsp;&quot;cluster&quot;: &quot;proserver.vitharn.internal&quot;,<br />
                      &nbsp;&nbsp;&quot;llm_inference&quot;: &quot;llama.cpp (Gemma-4B-Instruct-Q4)&quot;,<br />
                      &nbsp;&nbsp;&quot;tts_engine&quot;: &quot;Kokoro-82M ONNX&quot;,<br />
                      &nbsp;&nbsp;&quot;storage&quot;: &quot;MinIO S3 + Postgres (Streaming Standby)&quot;,<br />
                      &nbsp;&nbsp;&quot;ci_cd&quot;: &quot;GHCR + Watchtower (~30s auto-deploy)&quot;<br />
                      &#125;
                    </div>
                  </>
                )}

                {terminalTab === "specs" && (
                  <>
                    <div className="term-row">
                      <span className="term-prompt">$</span>
                      <span className="term-cmd">neofetch --stdout</span>
                    </div>
                    <div style={{ height: 8 }} />
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.7 }}>
                      <span style={{ color: "var(--accent)" }}>OS:</span> Ubuntu 22.04 LTS x86_64<br />
                      <span style={{ color: "var(--accent)" }}>Uptime:</span> 4 days, 18 hours, 32 mins<br />
                      <span style={{ color: "var(--accent)" }}>Containers:</span> 15 (all running, 0 paused)<br />
                      <span style={{ color: "var(--accent)" }}>Reverse Proxy:</span> Nginx 1.24 SSL / HTTP/2<br />
                      <span style={{ color: "var(--accent)" }}>Memory Load:</span> 64% allocated / healthy
                    </div>
                  </>
                )}
              </div>

              <div className="ak-term-footer">
                <div className="ak-term-stat">
                  <div className="ak-term-stat-val">15+</div>
                  <div className="ak-term-stat-lbl">Containers</div>
                </div>
                <div className="ak-term-stat">
                  <div className="ak-term-stat-val">4d+</div>
                  <div className="ak-term-stat-lbl">Cluster Uptime</div>
                </div>
                <div className="ak-term-stat">
                  <div className="ak-term-stat-val">0</div>
                  <div className="ak-term-stat-lbl">Failed Probes</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRICS STRIP WITH COUNT-UP ANIMATION ── */}
      <section className="ak-stats-bar ak-reveal" aria-label="Core Metrics">
        <div className="ak-container">
          <div className="ak-stats-grid">
            <div className="ak-stat-item">
              <div className="ak-stat-num">
                <CountUp target={15} suffix="+" />
              </div>
              <div className="ak-stat-label">Live Production Containers</div>
            </div>
            <div className="ak-stat-item">
              <div className="ak-stat-num">
                <CountUp target={70} suffix="+" />
              </div>
              <div className="ak-stat-label">Production REST APIs Shipped</div>
            </div>
            <div className="ak-stat-item">
              <div className="ak-stat-num">
                <CountUp target={1700} suffix="+" />
              </div>
              <div className="ak-stat-label">Active Users on Acharya ERP</div>
            </div>
            <div className="ak-stat-item">
              <div className="ak-stat-num">
                <CountUp target={60} prefix="< " suffix="s" />
              </div>
              <div className="ak-stat-label">DBaaS Microservice Provisioning</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SELECTED WORK / PROJECTS ── */}
      <section className="ak-section" id="work">
        <div className="ak-container">
          <div className="ak-section-header ak-reveal">
            <div className="ak-section-tag">
              <Layers size={13} /> Selected Architecture
            </div>
            <h2 className="ak-section-title">Production Systems &amp; Platforms</h2>
            <p className="ak-section-subtitle">
              Systems designed, implemented, and maintained in live production — serving real users, handling actual load, and architected for high reliability.
            </p>
          </div>

          <div className="ak-projects-list">
            {PROJECTS.map((proj) => (
              <a
                key={proj.title}
                href={proj.href}
                target={proj.href.startsWith("http") ? "_blank" : undefined}
                rel={proj.href.startsWith("http") ? "noreferrer" : undefined}
                className="ak-project-card ak-reveal"
                aria-label={`View project: ${proj.title}`}
              >
                <div className="ak-proj-num">{proj.num}</div>

                <div>
                  <div className="ak-proj-eyebrow">{proj.eyebrow}</div>
                  <h3 className="ak-proj-title">{proj.title}</h3>
                  <p className="ak-proj-desc">{proj.desc}</p>
                  <div className="ak-proj-tags">
                    {proj.tags.map((tag) => (
                      <span key={tag} className="ak-tag">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="ak-proj-right">
                  <div className="ak-proj-metric-box">
                    <div className="ak-proj-metric-val">{proj.metricVal}</div>
                    <div className="ak-proj-metric-lbl">{proj.metricLabel}</div>
                  </div>
                  <div className="ak-proj-link-btn">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── EXPERIENCE TIMELINE ── */}
      <section className="ak-section" id="experience" style={{ background: "var(--bg-subtle)" }}>
        <div className="ak-container">
          <div className="ak-exp-grid">
            <div className="ak-exp-sticky ak-reveal">
              <div className="ak-section-tag">
                <Activity size={13} /> Trajectory
              </div>
              <h2 className="ak-section-title" style={{ fontSize: 36 }}>
                Engineering Experience
              </h2>
              <p className="ak-section-subtitle" style={{ fontSize: 14, marginTop: 16 }}>
                Full-cycle technical ownership: from architecture and protocol design to infrastructure management and production reliability.
              </p>
            </div>

            <div className="ak-exp-list">
              {EXPERIENCES.map((exp, idx) => (
                <div key={idx} className="ak-exp-item ak-reveal">
                  <div className="ak-exp-node" />
                  <div className="ak-exp-date">{exp.date}</div>
                  <h3 className="ak-exp-role">{exp.role}</h3>
                  <div className="ak-exp-company">{exp.company}</div>
                  <p className="ak-exp-body">{exp.body}</p>
                  <div className="ak-proj-tags">
                    {exp.tags.map((t) => (
                      <span key={t} className="ak-tag">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SYSTEMS PHILOSOPHY & TOOLKIT ── */}
      <section className="ak-section" id="systems">
        <div className="ak-container">
          <div className="ak-systems-card ak-reveal">
            <div className="ak-systems-grid">
              <div>
                <div className="ak-section-tag">
                  <ShieldCheck size={13} /> Engineering Principles
                </div>
                <h2 className="ak-section-title" style={{ fontSize: 36, marginBottom: 32 }}>
                  How I Build Software
                </h2>

                <div className="ak-sys-items">
                  <div className="ak-sys-item">
                    <span className="ak-sys-num">01</span>
                    <div>
                      <h4 className="ak-sys-title">Zero-Touch Automation</h4>
                      <p className="ak-sys-desc">
                        Infrastructure must heal and deploy itself. Watchtower triggers automated container updates in ~30s upon CI build completion, while Nidhi provisions databases without manual intervention.
                      </p>
                    </div>
                  </div>

                  <div className="ak-sys-item">
                    <span className="ak-sys-num">02</span>
                    <div>
                      <h4 className="ak-sys-title">Owned AI &amp; Local Inference</h4>
                      <p className="ak-sys-desc">
                        Rather than depending on costly external AI APIs with unpredictable latencies, I run local models (Gemma 4B via llama.cpp) and microservices (Kokoro TTS) directly on hardware.
                      </p>
                    </div>
                  </div>

                  <div className="ak-sys-item">
                    <span className="ak-sys-num">03</span>
                    <div>
                      <h4 className="ak-sys-title">End-to-End Accountability</h4>
                      <p className="ak-sys-desc">
                        Writing code is only 30% of the job. I monitor container memory thresholds, configure reverse proxies, manage streaming backups, and ensure uptime across all platform layers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="ak-stack-box">
                  <div className="ak-stack-title">
                    <TerminalIcon size={16} style={{ color: "var(--accent)" }} />
                    Core Tech Stack
                  </div>
                  <div className="ak-stack-pills">
                    {SKILLS.map((skill) => (
                      <span key={skill} className="ak-stack-pill">{skill}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="ak-section" id="contact">
        <div className="ak-container">
          <div className="ak-contact-card ak-reveal">
            <div>
              <div className="ak-section-tag">
                <Zap size={13} /> Connect
              </div>
              <h2 className="ak-contact-title">Let&apos;s build something impactful.</h2>
              <p className="ak-contact-desc">
                Available for engineering leadership, systems architecture discussions, and high-impact AI/platform collaborations.
              </p>
            </div>

            <div>
              <button
                onClick={copyEmail}
                className="ak-email-copy-btn"
                aria-label="Copy email address"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Mail size={16} style={{ color: "var(--accent)" }} />
                  <span>kongaaadisheshu@gmail.com</span>
                </div>
                {copied ? <Check size={16} style={{ color: "var(--accent)" }} /> : <Copy size={16} />}
              </button>

              <div className="ak-social-row">
                <a href="tel:+916304562779" className="ak-social-link">
                  <Phone size={14} /> +91 6304562779
                </a>
                <a
                  href="https://www.linkedin.com/in/aadisheshu-konga"
                  target="_blank"
                  rel="noreferrer"
                  className="ak-social-link"
                >
                  <Linkedin size={14} /> LinkedIn
                </a>
                <a
                  href="https://github.com/Safacts"
                  target="_blank"
                  rel="noreferrer"
                  className="ak-social-link"
                >
                  <Github size={14} /> GitHub
                </a>
                <a
                  href="/aadisheshu-resume.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="ak-social-link"
                >
                  <Download size={14} /> Resume
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="ak-footer">
        <div className="ak-container">
          <div className="ak-footer-inner">
            <span>© 2026 Aadisheshu Konga. All systems operational.</span>
            <a href="#top" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Back to top <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
