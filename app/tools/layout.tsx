import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./tools.css";

export const metadata: Metadata = {
  title: "Free Tools Hub — uPVC, Glass, GST & More | Vitharn ERP",
  description:
    "Free online tools for UPVC fabricators, glass dealers, and Indian businesses: uPVC window price calculator, glass weight calculator, GST calculator, RF-SF converter, and UPI QR generator. No signup needed.",
  keywords: [
    "uPVC window calculator",
    "glass weight calculator",
    "GST calculator India",
    "RF to SF converter",
    "UPI QR generator",
    "uPVC price calculator",
    "free tools",
    "UPVC fabricator tools",
  ].join(", "),
  openGraph: {
    title: "Free Tools Hub — uPVC, Glass, GST & More | Vitharn ERP",
    description:
      "Free online calculators for UPVC fabricators and Indian businesses. No signup needed.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#6366f1",
};

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  function isActive(href: string) {
    return pathname === href ? "active" : "";
  }

  return (
    <>
        {/* Skip to content for accessibility */}
        <a href="#tools-main" className="skip-link">
          Skip to content
        </a>

        <header className="tools-header" id="tools-header">
          <Link href="/tools" className="brand">
            <img src="/logo.png" alt="Vitharn ERP" id="tools-brand-logo" />
            <span>Vitharn Tools</span>
          </Link>

          <nav className="header-nav" aria-label="Main navigation">
            <Link href="/tools" className={isActive("/tools")}>All Tools</Link>
            <Link href="/tools/upvc-calculator">uPVC</Link>
            <Link href="/tools/gst-calculator">GST</Link>
            <Link href="/tools/upi-qr">UPI QR</Link>
          <Link href="/upvc/pricing" className="btn-primary">Get ERP →</Link>
          </nav>

          <button
            className="hamburger"
            id="hamburger-btn"
            aria-label="Toggle menu"
            aria-expanded="false"
          >
            <span /><span /><span />
          </button>
        </header>

        <div className="mobile-nav" id="mobile-nav">
          <Link href="/tools">All Tools</Link>
          <Link href="/tools/upvc-calculator">uPVC Window Calculator</Link>
          <Link href="/tools/glass-weight">Glass Weight Calculator</Link>
          <Link href="/tools/gst-calculator">GST Calculator</Link>
          <Link href="/tools/rf-sf-converter">RF-SF Converter</Link>
          <Link href="/tools/upi-qr">UPI QR Generator</Link>
          <Link href="/upvc/pricing">Get Vitharn ERP →</Link>
        </div>

        <main id="tools-main" className="tools-main">
          {children}
        </main>

        <footer className="tools-footer">
          <div className="footer-links">
            <Link href="/">Home</Link>
            <Link href="/tools">Tools</Link>
            <Link href="/upvc/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/upvc/login">Portal Login</Link>
          </div>
          <p>© 2026 Vitharn ERP Services. Free tools for Indian businesses.</p>
          <p className="branding">
            Built with ❤️ by <Link href="/">Vitharn ERP</Link> — ₹10,000 one-time. No monthly fees.
          </p>
        </footer>

        {/* Mobile menu toggle + header scroll */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var logo = document.getElementById('tools-brand-logo');
                if (logo) {
                  logo.addEventListener('error', function() {
                    if (logo.dataset.fallbackApplied) return;
                    logo.dataset.fallbackApplied = '1';
                    logo.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%236366f1'/%3E%3Ctext x='50' y='60' text-anchor='middle' fill='white' font-size='36' font-weight='bold'%3EV%3C/text%3E%3C/svg%3E";
                  });
                }
                var hb = document.getElementById('hamburger-btn');
                var mn = document.getElementById('mobile-nav');
                var hdr = document.getElementById('tools-header');
                if (hb && mn) {
                  hb.addEventListener('click', function() {
                    var open = mn.classList.toggle('open');
                    hb.classList.toggle('open');
                    hb.setAttribute('aria-expanded', open);
                  });
                  mn.querySelectorAll('a').forEach(function(a) {
                    a.addEventListener('click', function() {
                      mn.classList.remove('open');
                      hb.classList.remove('open');
                      hb.setAttribute('aria-expanded', 'false');
                    });
                  });
                }
                if (hdr) {
                  window.addEventListener('scroll', function() {
                    hdr.classList.toggle('scrolled', window.scrollY > 10);
                  }, { passive: true });
                }
              })();
            `,
          }}
        />
    </>
  );
}
