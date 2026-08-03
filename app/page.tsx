"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Globe, Ruler, Wallet } from "lucide-react";
import "./landing.css";

const APK_URL =
  "https://effxrwrbsjduvhmorvrq.supabase.co/storage/v1/object/public/app-releases/Venkateshwara_UPVC.apk";

export default function Home() {
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerHref, setCustomerHref] = useState("/login");
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  function slugify(s: string) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  useEffect(() => {
    const session = localStorage.getItem("portal_session");
    const role = localStorage.getItem("portal_role");

    // Redirect logged-in customers to their business portal
    if (session === "active" && role === "customer") {
      const clientId = localStorage.getItem("portal_client_id");
      if (clientId) {
        window.location.href = "/" + slugify(clientId) + "/home";
      } else {
        localStorage.clear();
      }
    }

    // Gate "Open Web App" to logged-in UPVC customers
    const clientId = localStorage.getItem("portal_client_id");
    const customer = session === "active" && role === "customer" && !!clientId;
    setIsCustomer(customer);

    if (customer) {
      const target =
        "/upvc/" +
        clientId!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      setCustomerHref(target);
      setLoggedIn(true);
    }
  }, []);

  // Add scrolled class to header on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        if (window.scrollY > 10) {
          headerRef.current.classList.add("scrolled");
        } else {
          headerRef.current.classList.remove("scrolled");
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("header") && !target.closest(".mobile-nav")) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header ref={headerRef}>
        <div className="logo-container">
          <img
            src="/logo.png"
            onError={(e) => {
              e.currentTarget.src = "https://placehold.co/100";
            }}
            alt="Vitharn UPVC Quotation Maker"
          />
          <span className="logo-text">Vitharn UPVC</span>
        </div>

        {/* Desktop Nav */}
        <nav>
          <a href="#features">Features</a>
          <a href="#docs">Documentation</a>
          {isCustomer && (
            <a
              href={customerHref}
              className="btn-nav-webapp"
              id="navWebAppBtn"
              style={{ display: "inline-flex" }}
            >
              Open Web App
            </a>
          )}
          <a
            href={loggedIn ? "/logout" : "/login"}
            className="btn-nav-login"
            id="navPortalLogin"
          >
            {loggedIn ? "Logout" : "Portal Login"}
          </a>
        </nav>

        {/* Hamburger Button */}
        <button
          className={`hamburger${mobileMenuOpen ? " open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* Mobile Nav Drawer */}
      <div className={`mobile-nav${mobileMenuOpen ? " open" : ""}`}>
        <a href="#features" onClick={closeMobileMenu}>Features</a>
        <a href="#docs" onClick={closeMobileMenu}>Documentation</a>
        {isCustomer && (
          <a
            href={customerHref}
            className="btn-nav-webapp"
            id="mobileWebAppBtn"
            onClick={closeMobileMenu}
          >
            Open Web App
          </a>
        )}
        <a
          href={loggedIn ? "/logout" : "/login"}
          className="btn-nav-login"
          id="mobilePortalLogin"
          onClick={closeMobileMenu}
        >
          {loggedIn ? "Logout" : "Portal Login"}
        </a>
      </div>

      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Vitharn UPVC
            <br />
            Quotation Maker
          </h1>
          <p className="hero-subtitle">
            A complete platform for UPVC window and door businesses to create,
            manage, and send professional quotations — on Android and the web.
          </p>
          <div className="btn-group">
            <a href={APK_URL} className="btn-download" id="downloadBtn">
              <Download size={20} /> Download Android App
            </a>
            {isCustomer && (
              <a
                href={customerHref}
                className="btn-webapp"
                id="heroWebAppBtn"
                style={{ display: "inline-flex" }}
              >
                <Globe size={20} /> Open Web App
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <h2 className="section-title">Premium Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <Ruler className="feature-icon-svg" />
            <h3 className="feature-title">Measured &amp; Custom Items</h3>
            <p>
              Input exact dimensions in millimeters (width, height) to
              auto-compute total Square Feet (SFT) and pricing instantly.
            </p>
          </div>
          <div className="feature-card">
            <Wallet className="feature-icon-svg" />
            <h3 className="feature-title">Real-Time Computations</h3>
            <p>
              Calculates item subtotal, transport charges, and computes 18% IGST
              automatically with amount-in-words translation.
            </p>
          </div>
          <div className="feature-card">
            <FileText className="feature-icon-svg" />
            <h3 className="feature-title">PDF Generation</h3>
            <p>
              Generate clean, branded PDF receipts with custom company details,
              terms, and bank details ready to send.
            </p>
          </div>
        </div>
      </section>

      <section className="docs" id="docs">
        <div className="docs-content">
          <h2 className="section-title">Application Documentation</h2>

          <div className="doc-step">
            <h3>Step 1: Installation</h3>
            <p>
              Click the download button above to retrieve the Android
              application package (APK) on your device. Enable &quot;Install from
              Unknown Sources&quot; in settings if prompted, then install the
              package.
            </p>
            <p style={{ marginTop: 10 }}>
              Alternatively, use the{" "}
              <a href={isCustomer ? customerHref : "/login"} id="docsWebAppLink">
                Web App
              </a>{" "}
              directly from your browser without any installation.
            </p>
          </div>

          <div className="doc-step">
            <h3>Step 2: Sign In</h3>
            <p>
              Sign in with your registered admin account to access the app main
              dashboard.
            </p>
          </div>

          <div className="doc-step">
            <h3>Step 3: Creating Quotations</h3>
            <p>
              Tap &quot;New Quotation&quot; on the dashboard. Add client details, items
              (with measurements or flat rate), add transport cost, and tap
              &quot;GENERATE PDF&quot;. The PDF is automatically created and ready to be
              printed or emailed.
            </p>
          </div>

          <div className="doc-step">
            <h3>Step 4: Developer Panel</h3>
            <p>
              For developer options, navigate to the &quot;About&quot; screen or the
              dashboard tagline, tap 7 times on the developer name, and enter
              code `533842` to clear logs or wipe the database.
            </p>
          </div>
        </div>
      </section>

      <footer>
        <p>© 2026 Vitharn UPVC Quotation Maker. Crafted by Aadi.</p>
      </footer>
    </>
  );
}
