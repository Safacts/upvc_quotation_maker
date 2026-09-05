"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientRow } from "@/lib/slug";
import { slugify } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import "./portal.css";
import "./portal-premium.css";
import { portalRequest } from "@/lib/portal-request";
import { MarketPageSettings } from "./MarketPageSettings";

interface InfoField {
  label: string;
  value: string;
}

export default function CustomerPortal({ client, slug }: { client: ClientRow; slug: string }) {
  const router = useRouter();
  const config = useMemo(() => parseClientConfig(client.config || {}, client.id), [client.config, client.id]);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationClose = useRef<HTMLButtonElement>(null);
  const followUps = useRef<HTMLDivElement>(null);
  const closeNavigation = useCallback(() => {
    setSidebarOpen(false);
    navigationToggle.current?.focus();
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    navigationClose.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNavigation();
      if (event.key === "Tab" && window.matchMedia("(max-width: 860px)").matches) {
        const items = Array.from(document.querySelectorAll<HTMLElement>(
          '#portal-navigation a[href], #portal-navigation button:not([disabled])'
        )).filter(item => item.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen, closeNavigation]);
  const [activeTab, setActiveTab] = useState<"overview" | "catalog" | "market" | "market-settings" | "settings">("overview");

  const [brand, setBrand] = useState("Loading...");
  const [infoFields, setInfoFields] = useState<InfoField[]>([]);
  const [marketUrl, setMarketUrl] = useState("");

  // The Flutter quotation app is NEVER iframed — it is opened in a new tab so it
  // gets its own full-screen browsing context (fixes PDF download / share / file
  // picker breakage that sandboxed iframes cause). Same-origin, so the HttpOnly
  // portal_auth cookie rides along and `auto_login=true` signs the user straight in.
  const appUrl = useMemo(() => {
    const appSlug = slugify(slug) || slugify(config.appName) || slugify(client.id);
    return "/upvc/" + appSlug + "?client=" + encodeURIComponent(client.id) + "&auto_login=true";
  }, [slug, config.appName, client.id]);

  const openApp = useCallback(
    (openQuoteId?: string) => {
      const url = openQuoteId ? appUrl + "&open_quote=" + encodeURIComponent(openQuoteId) : appUrl;
      window.open(url, "_blank", "noopener,noreferrer");
      setSidebarOpen(false);
    },
    [appUrl],
  );

  const [stats, setStats] = useState<any>(null);
  const [statsStatus, setStatsStatus] = useState<"loading" | "ready" | "error">("loading");
  const statsBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadStats = useCallback(async () => {
    if (statsBusy.current) return;
    statsBusy.current = true;
    setStatsStatus("loading");
    try {
      const data = await portalRequest("/api/portal_stats");
      if (mounted.current) { setStats(data); setStatsStatus("ready"); }
    } catch {
      if (mounted.current) setStatsStatus("error");
    } finally { statsBusy.current = false; }
  }, []);
  const settingsBusy = useRef(false);
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const deferredPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showA2hsModal, setShowA2hsModal] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const [estimatorType, setEstimatorType] = useState<"2-track" | "3-track" | "casement" | "fixed">("2-track");
  const [estimatorWidth, setEstimatorWidth] = useState<number>(5);
  const [estimatorHeight, setEstimatorHeight] = useState<number>(4);
  const [estimatorRate, setEstimatorRate] = useState<number>(480);

  const handleEstimatorTypeChange = (type: "2-track" | "3-track" | "casement" | "fixed") => {
    setEstimatorType(type);
    if (type === "2-track") setEstimatorRate(480);
    else if (type === "3-track") setEstimatorRate(620);
    else if (type === "casement") setEstimatorRate(580);
    else if (type === "fixed") setEstimatorRate(380);
  };

  const copyShowroomLink = async () => {
    const fullUrl = typeof window !== "undefined" ? window.location.origin + marketUrl : marketUrl;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(fullUrl);
      showToast("Showroom link copied to clipboard! Share with your clients.", "success");
    } catch {
      showToast("Couldn’t copy automatically. Select and copy the showroom address shown on this page.", "info");
    }
  };

  const shareShowroomWhatsApp = () => {
    const fullUrl = typeof window !== "undefined" ? window.location.origin + marketUrl : marketUrl;
    const text = `Explore ${brand}'s premium UPVC & Aluminium window and door collections, 3D architectural elevations, and completed projects: ${fullUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const sendWhatsAppFollowUp = (customerName: string, quoteNo: string, amount: number, contactNo: string) => {
    const cleanPhone = (contactNo || "").replace(/\D/g, "");
    const text = `Hello ${customerName}, this is ${config.companyProprietor || brand}. Following up regarding your UPVC window & door quotation #${quoteNo} (₹${amount.toLocaleString('en-IN')}). Please let us know if you would like to proceed or need any adjustments in the sizes or specifications!`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const standalone =
      (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    setIsIOS(iOS);
    setIsStandalone(standalone);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/pwa-sw.js").catch(() => {});
    }
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanInstall(true);
    };
    const onAppInstalled = () => {
      deferredPrompt.current = null;
      setCanInstall(false);
      setIsStandalone(true);
      showToast("App installed! Find it on your home screen.", "success");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const session = localStorage.getItem("portal_session");
    const role = localStorage.getItem("portal_role");
    const clientId = localStorage.getItem("portal_client_id");

    if (session !== "active" || role !== "customer" || !clientId) {
      router.replace("/upvc/login");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const authData = await portalRequest("/api/portal_auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "session" }),
        });
        if (cancelled) return;
        if (authData.role !== "customer" || authData.client_id !== clientId) {
          localStorage.clear();
          router.replace("/upvc/login");
          return;
        }

        const primaryColor = config.primaryColor
          ? "#" + config.primaryColor.toString(16).padStart(8, "0").slice(2)
          : "#d89b25";
        const accentColor = config.accentColor
          ? "#" + config.accentColor.toString(16).padStart(8, "0").slice(2)
          : "#101722";

        document.documentElement.style.setProperty("--primary", primaryColor);
        document.documentElement.style.setProperty("--accent", accentColor);
        document.documentElement.style.setProperty(
          "--primary-gradient",
          config.primaryColor
            ? "linear-gradient(135deg, " + primaryColor + " 0%, " + accentColor + " 100%)"
            : "linear-gradient(135deg, #d89b25 0%, #b26a00 100%)",
        );

        setBrand(config.companyName || client.id);
        const marketSlug = slugify(slug) || slugify(client.id);

        setMarketUrl("/" + marketSlug);

        setInfoFields(
          [
            { label: "Company Name", value: config.companyName },
            { label: "App Name", value: config.appName },
            { label: "Proprietor", value: config.companyProprietor },
            { label: "Contact", value: config.companyContact },
            { label: "Email", value: config.companyEmail },
            { label: "Address", value: config.companyAddress },
            { label: "GST Number", value: config.gstNumber },
            { label: "Client ID", value: client.id },
          ].filter((f) => f.value),
        );
        
        setFormData({
          companyName: config.companyName || "",
          companyProprietor: config.companyProprietor || "",
          companyContact: config.companyContact || "",
          companyEmail: config.companyEmail || "",
          companyAddress: config.companyAddress || "",
          gstNumber: config.gstNumber || "",
          panNumber: (config as any).panNumber || "",
          upiId: (config as any).upiId || "",
          secondaryContact: (config as any).secondaryContact || "",
          whatsappNumber: (config as any).whatsappNumber || config.companyContact || "",
          stateCode: (config as any).stateCode || "",
          hsnCode: (config as any).hsnCode || "3925",
          bankName: config.bankName || "",
          bankBranch: config.bankBranch || "",
          bankAccountNo: config.bankAccountNo || "",
          bankIfsc: config.bankIfsc || "",
          termsAndConditions: config.termsAndConditions || [],
          defaultGstPercentage: config.defaultGstPercentage ?? 18,
          cost_margin_percent: config.cost_margin_percent || 0,
          quoteValidityDays: (config as any).quoteValidityDays ?? 15,
          quoteNotes: (config as any).quoteNotes || "",
          authorizedSignatory: (config as any).authorizedSignatory || config.companyProprietor || "",
          placeOfSupply: (config as any).placeOfSupply || "",
          labourCostPerSqft: (config as any).labourCostPerSqft ?? 0,
          installationCostPerSqft: (config as any).installationCostPerSqft ?? 0,
          wastagePercent: (config as any).wastagePercent ?? 3,
          defaultTransportCost: (config as any).defaultTransportCost ?? 0,
          defaultAdvancePercent: (config as any).defaultAdvancePercent ?? 50,
          establishmentYear: (config as any).establishmentYear || "",
          businessHours: (config as any).businessHours || "Mon-Sat 9:30 AM - 7:30 PM",
          serviceAreas: (config as any).serviceAreas || [],
          facebookUrl: (config as any).facebookUrl || "",
          instagramUrl: (config as any).instagramUrl || "",
          googleMapsUrl: (config as any).googleMapsUrl || "",
          enablePricePresets: config.enablePricePresets || false,
          measuredPresets: config.measuredPresets || [],
          unmeasuredPresets: config.unmeasuredPresets || [],
          supplierCompanies: config.supplierCompanies || [],
        });

        // Keep the workspace usable while statistics load, with explicit recovery.
        void loadStats();

        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("We couldn’t verify your session. Check your connection and try again, or sign in again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, client, config, loadStats, authAttempt]);

  const handleLogout = useCallback(async () => {
    localStorage.clear();
    await fetch("/api/portal_auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "logout" }),
    });
    router.replace("/upvc/login");
  }, [router]);
  
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settingsBusy.current) return;
    settingsBusy.current = true;
    setIsSaving(true);
    setSaveMessage("");
    try {
      await portalRequest("/api/portal_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      setSaveMessage("Settings saved successfully! Changes will reflect on app reload.");
    } catch (err: any) {
      setSaveMessage("We couldn’t confirm the save. Your entries are still here. Check your connection and retry; if the connection dropped, the server may already have saved them.");
    } finally {
      settingsBusy.current = false;
      setIsSaving(false);
    }
  };

  const handleLiteMode = async () => {
    // Already running as an installed app -> jump straight to the app
    if (isStandalone) {
      window.location.href = appUrl;
      return;
    }
    // Android / desktop Chrome: show the native install prompt.
    if (deferredPrompt.current) {
      try {
        deferredPrompt.current.prompt();
        await deferredPrompt.current.userChoice;
      } catch (e) {
        // prompt can throw if it was already shown / dismissed
      } finally {
        deferredPrompt.current = null;
        setCanInstall(false);
      }
      return;
    }
    // iOS Safari: no install prompt API -> show "Add to Home Screen" steps.
    if (isIOS) {
      setShowA2hsModal(true);
      return;
    }
    // Fallback: open the app in a new tab.
    openApp();
  };

  if (status === "error") {
    return (
      <div className="portal-root"><div className="portal-recovery" role="alert">
        <h1>Let’s reconnect</h1><p>{errorMsg}</p>
        <button type="button" onClick={() => { setStatus("loading"); setAuthAttempt(value => value + 1); }}>Try again</button>
        <a href="/upvc/login">Back to sign in</a>
      </div></div>
    );
  }

  if (status === "loading") {
    return (
      <div className="dashboard-layout" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="loading" role="status">Opening your workspace…</div>
      </div>
    );
  }

  const tabTitles = {
    overview: "Business Overview",
    catalog: "Product Catalog",
    market: "Market Page Preview",
    "market-settings": "Market Page Settings",
    settings: "Business Settings"
  };

  return (
    <div className="portal-root">
      {/* Custom Theme Toast Notification */}
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 20px',
          borderRadius: '12px',
          background: toast.type === 'success' ? '#064e3b' : toast.type === 'error' ? '#7f1d1d' : '#1e1b4b',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#6366f1'}`,
          animation: 'slideIn 0.3s ease-out',
          maxWidth: '420px',
          fontSize: '14px',
          fontWeight: '500',
          lineHeight: '1.4'
        }}>
          <div style={{ flexShrink: 0 }}>
            {toast.type === 'success' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            )}
            {toast.type === 'error' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            )}
            {toast.type === 'info' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            )}
          </div>
          <div style={{ flex: 1 }}>{toast.message}</div>
          <button 
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      <div className="dashboard-layout">
      {/* Sidebar */}
      <div className={`mobile-overlay ${sidebarOpen ? "open" : ""}`} onClick={closeNavigation} />
      <aside id="portal-navigation" className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          {config.logoUrl && <img src={config.logoUrl} alt="Logo" />}
          <div className="sidebar-brand-meta">
            <h2>{brand}</h2>
            <span className="sidebar-badge">Verified Fabricator</span>
          </div>
        </div>
        <button ref={navigationClose} type="button" className="sidebar-close" onClick={closeNavigation} aria-label="Close navigation">Close menu <span aria-hidden="true">×</span></button>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <button 
            className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => { setActiveTab("overview"); setSidebarOpen(false); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Overview
          </button>
          <a
            className="nav-item"
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setSidebarOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Quotation App
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginLeft: "auto", opacity: 0.6 }}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button 
            className={`nav-item ${activeTab === "catalog" ? "active" : ""}`}
            onClick={() => { setActiveTab("catalog"); setSidebarOpen(false); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Product Catalog
          </button>
          <button 
            className={`nav-item ${activeTab === "market" ? "active" : ""}`}
            onClick={() => { setActiveTab("market"); setSidebarOpen(false); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Market Page
          </button>
          <button 
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => { setActiveTab("settings"); setSidebarOpen(false); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </nav>
        {/* Desktop Console — prominent shortcut to the Tally-style desktop workspace */}
        <div className="sidebar-console-wrap">
          <Link
            href={`/${slug}/console`}
            onClick={() => setSidebarOpen(false)}
            className="sidebar-console-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <span>Desktop Console</span>
            </div>
            <span className="console-tag">PRO</span>
          </Link>
        </div>
        <div className="sidebar-footer">
          {/* Lite Mode: Instant Web App / PWA */}
          <button 
            onClick={handleLiteMode}
            className="sidebar-tool-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <span>{isStandalone ? "Open App" : "App Lite Mode"}</span>
            </div>
            <span className="tool-badge tool-badge-green">{isStandalone ? 'Open' : canInstall || isIOS ? 'Install' : 'Instant'}</span>
          </button>

          {/* Pro Mode: Native APK */}
          {(() => {
            const lastTriggered = config.lastBuildTriggeredAt;
            const lastCompleted = config.lastBuildCompletedAt;
            let isBuilding = false;
            let buildMinutesRemaining = 0;
            if (lastTriggered) {
              const diffMinutes = (Date.now() - new Date(lastTriggered).getTime()) / 60000;
              const completedAfterTrigger = !!lastCompleted && new Date(lastCompleted).getTime() >= new Date(lastTriggered).getTime();
              if (diffMinutes < 10 && !completedAfterTrigger) {
                isBuilding = true;
                buildMinutesRemaining = Math.ceil(10 - diffMinutes);
              }
            }

            return (
              <a 
                href={isBuilding ? "#" : (config.appDownloadUrl || "#")} 
                target={config.appDownloadUrl && !isBuilding ? "_blank" : "_self"}
                rel="noopener noreferrer" 
                onClick={async (e) => {
                  if (isBuilding) {
                    e.preventDefault();
                    showToast(`A build is currently in progress. Please check back in ~${buildMinutesRemaining} minutes.`, "info");
                    return;
                  }
                  if (!config.appDownloadUrl) {
                    e.preventDefault();
                    const btn = e.currentTarget;
                    const originalText = btn.innerHTML;
                    btn.innerHTML = `<span style="font-size: 12px; font-weight: 600;">Triggering...</span>`;
                    btn.style.pointerEvents = 'none';
                    try {
                      const res = await fetch("/api/trigger_build", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          client_id: client.id,
                          app_name: config.appName,
                          version_name: config.appVersionName || undefined,
                          version_code: config.appVersionCode ?? undefined,
                        })
                      });
                      if (res.ok) {
                        showToast("Build successfully triggered! Your Pro Native APK is being generated in the cloud. Check back in 5-10 minutes.", "success");
                        setTimeout(() => window.location.reload(), 2000);
                      } else {
                        const err = await res.json();
                        showToast("Failed to trigger build: " + (err.error || "Unknown error"), "error");
                      }
                    } catch (err: any) {
                      showToast("Network error while triggering build.", "error");
                    } finally {
                      btn.innerHTML = originalText;
                      btn.style.pointerEvents = 'auto';
                    }
                  }
                }}
                className="sidebar-tool-btn"
                style={{ flexDirection: 'column', alignItems: 'stretch' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {isBuilding ? (
                        <>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </>
                      ) : (
                        <>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </>
                      )}
                    </svg>
                    <span>App Pro Mode</span>
                  </div>
                  <span className={`tool-badge ${isBuilding ? 'tool-badge-amber' : config.appDownloadUrl ? 'tool-badge-green' : 'tool-badge-blue'}`}>
                    {isBuilding ? `Building (~${buildMinutesRemaining}m)` : config.appDownloadUrl ? 'APK' : 'Build'}
                  </span>
                </div>
                {config.appDownloadUrl && config.lastBuildCompletedAt && (
                  <div style={{ fontSize: '11px', color: 'var(--portal-sidebar-muted, #64748b)', paddingLeft: '22px', marginTop: '2px' }}>
                    {(() => {
                      const d = new Date(config.lastBuildCompletedAt);
                      if (isNaN(d.getTime())) return null;
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `Updated: ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
                    })()}
                  </div>
                )}
              </a>
            );
          })()}
          <button className="btn-logout" onClick={handleLogout}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button ref={navigationToggle} className="mobile-toggle" aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="header-title">{tabTitles[activeTab]}</h1>
            {(activeTab === "market" || activeTab === "market-settings") && client.id.toLowerCase() === "kprupvc" && (
              <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
                <button
                  onClick={() => setActiveTab("market")}
                  style={{
                    padding: "4px 12px", borderRadius: 6, border: "1px solid " + (activeTab === "market" ? "#c08a1d" : "#dfe3e8"), cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: activeTab === "market" ? "#d89b25" : "#fbfcfd",
                    color: activeTab === "market" ? "#101722" : "#5b6673",
                  }}
                >
                  Preview
                </button>
                <button
                  onClick={() => setActiveTab("market-settings")}
                  style={{
                    padding: "4px 12px", borderRadius: 6, border: "1px solid " + (activeTab === "market-settings" ? "#c08a1d" : "#dfe3e8"), cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: activeTab === "market-settings" ? "#d89b25" : "#fbfcfd",
                    color: activeTab === "market-settings" ? "#101722" : "#5b6673",
                  }}
                >
                  Testimonials
                </button>
              </div>
            )}
          </div>
          <div className="header-user">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {config.companyName || "Admin"}
          </div>
        </header>

        <div className="dashboard-content">
          
          {/* Overview Tab */}
          <div className={`tab-pane ${activeTab === "overview" ? "active" : ""}`}>
            {/* Hero Sales & Attraction Banner */}
            <div className="hero-growth-banner">
              <div className="hero-copy">
                <div className="portal-eyebrow">YOUR BUSINESS, AT A GLANCE</div>
                <h2 className="hero-greeting">
                  Welcome back, <span className="hero-name">{(config.companyProprietor || config.companyName || "Partner").toLowerCase().split(' ')[0]}</span>.
                </h2>
                <div className="hero-sub">
                  <span>{stats ? `${stats.totalCount} proposals. One clear view of your business.` : brand}</span>
                </div>
              </div>
              <div className="hero-actions">
                <a
                  href={appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-hero-primary"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create New Quotation
                </a>
                <button
                  type="button"
                  onClick={copyShowroomLink}
                  className="btn-hero-secondary"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Showroom Link
                </button>
              </div>
            </div>

            {/* North Star Sales Metrics (4-Card Grid) */}
            {statsStatus !== "ready" && (
              <div className="portal-connection-note" role="status">
                <span>{statsStatus === "loading" ? "Loading your latest figures. You can keep using the workspace." : "Your figures couldn’t load. This doesn’t mean your quotations are missing."}</span>
                {statsStatus === "error" && <button type="button" onClick={loadStats}>Retry figures</button>}
              </div>
            )}
            {stats && (
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Quoted Deal Pipeline</span>
                    <div className="metric-icon-wrap amber">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                  </div>
                  <div className="metric-val">₹ {stats.totalQuoted.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <div className="metric-sub">
                    {Math.abs(stats.monthChangePercent) >= 99.9 ? (
                      <span className="metric-pill" style={{ background:'#f5f5f4', color:'#57534e', border:'1px solid #e7e5e4' }}>New pipeline</span>
                    ) : stats.monthChangePercent !== 0 ? (
                      <span className={`metric-pill ${stats.monthChangePercent >= 0 ? "metric-pill-up" : "metric-pill-down"}`}>
                        {stats.monthChangePercent >= 0 ? "↑" : "↓"} {Math.abs(stats.monthChangePercent).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="metric-pill" style={{ background:'#f5f5f4', color:'#57534e', border:'1px solid #e7e5e4' }}>Steady</span>
                    )}
                    <span>vs last month · {stats.totalCount} proposals</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Confirmed Orders Won</span>
                    <div className="metric-icon-wrap green">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                  </div>
                  <div className="metric-val" style={{ color: '#059669' }}>
                    ₹ {stats.wonQuoted.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="metric-sub">
                    <span style={{ color: '#059669', fontWeight: 700 }}>{stats.wonCount} closed projects</span>
                    <span>from accepted quotes</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Quotation Win Rate</span>
                    <div className="metric-icon-wrap blue">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                  </div>
                  <div className="metric-val">{stats.winRate.toFixed(1)}%</div>
                  <div className="metric-sub">
                    <span>{stats.wonCount} won of {stats.totalCount} total quotes</span>
                  </div>
                  <div className="metric-progress-track">
                    <div className="metric-progress-bar" style={{ width: `${Math.min(stats.winRate, 100)}%` }} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Quotes to follow up</span>
                    <div className="metric-icon-wrap amber">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                  </div>
                  <div className="metric-val">
                    {stats.pendingFollowUps?.length || 0} Quotes
                  </div>
                  <div className="metric-sub">
                    {(stats.pendingFollowUps?.length || 0) > 0 ? (
                      <button type="button" className="followup-shortcut" onClick={() => {
                        followUps.current?.focus({ preventScroll: true });
                        followUps.current?.scrollIntoView({ behavior: "auto", block: "start" });
                      }}>View follow-ups <span aria-hidden="true">↓</span></button>
                    ) : <span>No quotes waiting for a follow-up.</span>}
                  </div>
                </div>
              </div>
            )}

            {/* DUAL ACTION FEATURE: DIGITAL SHOWROOM SHARE + WALK-IN ESTIMATOR */}
            <div className="action-feature-grid">
              {/* Feature 1: Digital Showroom Showcase */}
              <div className="feature-card showroom-card">
                <div className="feature-card-header">
                  <span className="feature-card-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.7"><circle cx="12" cy="12" r="8"/><path d="M2 12h20"/><path d="M12 2a14 14 0 0 1 0 20 14 14 0 0 1 0-20z" opacity=".25"/></svg>
                    Showroom link
                  </span>
                  <span className="feature-badge">Public</span>
                </div>
                <div className="feature-desc">
                  Share your catalog and project gallery with clients.
                </div>
                <div className="showroom-preview">
                  <svg viewBox="0 0 72 72" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="12" y="10" width="48" height="52" rx="1" />
                    <path d="M17 15h38v42H17zM36 15v42M17 36h38M10 65h52M32 39v6M40 39v6" />
                  </svg>
                  <div><span className="showroom-preview-label">YOUR DIGITAL SHOWROOM</span><strong>{brand}</strong><span>Catalog · Projects · Contact</span></div>
                </div>
                <div className="showroom-url-bar">
                  <span className="showroom-url-text">
                    {typeof window !== "undefined" ? window.location.origin + marketUrl : marketUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyShowroomLink}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-primary)', padding: '2px', display: 'flex', alignItems: 'center' }}
                    title="Copy Link"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </div>
                <div className="showroom-btn-row">
                  <button type="button" onClick={copyShowroomLink} className="btn-card-action">
                    Copy link
                  </button>
                  <a href={marketUrl} target="_blank" rel="noopener noreferrer" className="btn-card-action">
                    Preview
                  </a>
                  <button type="button" onClick={shareShowroomWhatsApp} className="btn-card-action" aria-label="Share on WhatsApp" title="Share on WhatsApp" style={{ flex: '0 0 38px', padding: '9px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 21l1.7-5.1A8.3 8.3 0 0 1 11 3h.6A8.3 8.3 0 0 1 21 11.5v.5A8.3 8.3 0 0 1 12.7 20 8.3 8.3 0 0 1 8 18.7L3 21z"/><path d="M8.3 9.3c.2-.5.3-.5.6-.5h.6c.1 0 .3.1.4.2l.9 1.3c.1.1.1.3 0 .4l-.7.8c-.1.1-.1.2 0 .4.2.3.5.7.9 1.1.4.4.8.7 1.2.8.1 0 .2 0 .3-.1l.8-.8c.1-.1.2-.2.4-.1l1.3.6c.1.1.2.2.2.3v.6c0 .2 0 .4-.3.6-.3.2-.6.3-1 .3-.4 0-1.7-.6-2.9-1.8-1.2-1.2-1.8-2.4-1.8-2.8 0-.4.1-.7.3-1z"/></svg>
                  </button>
                </div>
              </div>

              {/* Feature 2: Quick Walk-in Estimator */}
              <div className="feature-card">
                <div className="feature-card-header">
                  <span className="feature-card-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
                    Quick estimator
                  </span>
                  <span className="feature-badge">Estimate</span>
                </div>
                <div className="estimator-type-pills">
                  {[
                    { id: "2-track", label: "2-Track" },
                    { id: "3-track", label: "3-Trk Mesh" },
                    { id: "casement", label: "Casement" },
                    { id: "fixed", label: "Fixed" },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`estimator-pill ${estimatorType === t.id ? "active" : ""}`}
                      aria-pressed={estimatorType === t.id}
                      onClick={() => handleEstimatorTypeChange(t.id as any)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="estimator-inputs-row">
                  <div className="estimator-input-wrap">
                    <label htmlFor="estimator-width">Width (Ft)</label>
                    <input
                      id="estimator-width"
                      type="number"
                      min="1"
                      value={estimatorWidth}
                      onChange={(e) => setEstimatorWidth(Math.max(1, parseFloat(e.target.value) || 1))}
                    />
                  </div>
                  <div className="estimator-input-wrap">
                    <label htmlFor="estimator-height">Height (Ft)</label>
                    <input
                      id="estimator-height"
                      type="number"
                      min="1"
                      value={estimatorHeight}
                      onChange={(e) => setEstimatorHeight(Math.max(1, parseFloat(e.target.value) || 1))}
                    />
                  </div>
                  <div className="estimator-input-wrap">
                    <label htmlFor="estimator-rate">Rate (₹/Sq.ft)</label>
                    <input
                      id="estimator-rate"
                      type="number"
                      min="50"
                      value={estimatorRate}
                      onChange={(e) => setEstimatorRate(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>
                <div className="estimator-result-box">
                  <div>
                    <div className="estimator-result-label">Approx {(estimatorWidth * estimatorHeight).toFixed(1)} Sq.Ft</div>
                    <div className="estimator-result-val">
                      ₹ {Math.round(estimatorWidth * estimatorHeight * estimatorRate).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openApp()}
                    className="btn-hero-primary"
                    style={{ padding: '8px 14px', fontSize: '12px' }}
                  >
                    Build Full Quote →
                  </button>
                </div>
              </div>
            </div>

            {/* High-Priority Follow-ups Action Center */}
            {stats && stats.pendingFollowUps && stats.pendingFollowUps.length > 0 && (
              <div ref={followUps} className="followup-card" tabIndex={-1} role="region" aria-label="Quotes to follow up">
                <div className="followup-header">
                  <div className="followup-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.7"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 8.1 2 2 0 0 1 4.1 6h3a2 2 0 0 1 2 1.7c.2.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1l-1.2 1.2a16 16 0 0 0 5 5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.7A2 2 0 0 1 22 16.9z"/></svg>
                    Follow-ups · {stats.pendingFollowUps.length}
                  </div>
                  <span style={{ fontSize: '11px', color: '#78716c' }}>{stats.pendingFollowUps.length} open</span>
                </div>
                <div className="followup-list">
                  {stats.pendingFollowUps.map((item: any) => (
                    <div key={item.id} className="followup-item-card">
                      <div>
                        <div className="followup-client-row">
                          <span className="followup-client-name">{item.customer_name}</span>
                          <span className="followup-quote-badge">{item.quote_no}</span>
                        </div>
                        <div className="followup-price">
                          ₹ {item.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="followup-meta">
                          Quoted on {new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div className="followup-btns-row">
                        {item.contact_no && (
                          <>
                            <a href={`tel:${item.contact_no}`} className="btn-followup-call" title="Call">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 8.1 2 2 0 0 1 4.1 6h3a2 2 0 0 1 2 1.7c.2.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1l-1.2 1.2a16 16 0 0 0 5 5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.7A2 2 0 0 1 22 16.9z"/></svg>
                              Call
                            </a>
                            <button
                              type="button"
                              onClick={() => sendWhatsAppFollowUp(item.customer_name, item.quote_no, item.total, item.contact_no)}
                              className="btn-followup-wa"
                              title="WhatsApp"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 21l1.7-5.1A8.3 8.3 0 0 1 11 3h.6A8.3 8.3 0 0 1 21 11.5v.5A8.3 8.3 0 0 1 12.7 20 8.3 8.3 0 0 1 8 18.7L3 21z"/><path d="M8.3 9.3c.2-.5.3-.5.6-.5h.6c.1 0 .3.1.4.2l.9 1.3c.1.1.1.3 0 .4l-.7.8c-.1.1-.1.2 0 .4.2.3.5.7.9 1.1.4.4.8.7 1.2.8.1 0 .2 0 .3-.1l.8-.8c.1-.1.2-.2.4-.1l1.3.6c.1.1.2.2.2.3v.6c0 .2 0 .4-.3.6-.3.2-.6.3-1 .3-.4 0-1.7-.6-2.9-1.8-1.2-1.2-1.8-2.4-1.8-2.8 0-.4.1-.7.3-1z"/></svg>
                              WhatsApp
                            </button>
                          </>
                        )}
                        <a
                          href={appUrl + "&open_quote=" + encodeURIComponent(item.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-followup-view"
                        >
                          View Quote ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visual Analytics */}
            {stats && (
              <div className="panel-grid">
                {/* Status Summary Donut Chart */}
                <div className="portal-panel">
                  <div className="portal-panel-head">
                    <span className="portal-panel-title">Pipeline</span>
                    <span style={{ fontSize: '11px', color: '#78716c', fontWeight: 600 }}>{stats.totalCount} quotes</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                    <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                        {(() => {
                          const total = stats.totalCount;
                          if (total === 0) return <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="18" />;
                          
                          let currentAngle = 0;
                          const colors: Record<string, string> = { Draft: '#d6d3cd', Sent: '#171412', Won: '#9f7a0e', Lost: '#a8a29e' };
                          
                          return ['Draft', 'Sent', 'Won', 'Lost'].map(status => {
                            const count = stats.countsByStatus[status] || 0;
                            if (count === 0) return null;
                            const percentage = count / total;
                            const dasharray = `${percentage * 251.2} 251.2`;
                            const dashoffset = currentAngle * -251.2;
                            currentAngle += percentage;
                            return (
                              <circle key={status} cx="50" cy="50" r="40" fill="none"
                                stroke={colors[status]} strokeWidth="11"
                                strokeDasharray={dasharray} strokeDashoffset={dashoffset}
                                strokeLinecap="round"
                                style={{ filter: status === 'Sent' ? 'drop-shadow(0 1px 2px rgba(23,20,18,.08))' : undefined }}
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--num)', letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>{stats.winRate.toFixed(0)}%</span>
                        <span style={{ fontSize: '9px', color: '#78716c', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.08em', marginTop: '1px' }}>Won</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { label: 'Draft', name: 'Being Prepared', color: '#d6d3cd' },
                        { label: 'Sent', name: 'Delivered', color: '#171412' },
                        { label: 'Won', name: 'Order Confirmed', color: '#9f7a0e' },
                        { label: 'Lost', name: 'Did Not Close', color: '#a8a29e' }
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color, border: s.label==='Sent' ? '1px solid #2b2926' : '1px solid rgba(0,0,0,.06)', flexShrink: 0, display:'inline-block' }} />
                            <span style={{ color: '#57534e', fontWeight: 500 }}>{s.name}</span>
                          </div>
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#171412' }}>{stats.countsByStatus[s.label] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weekly Bar Chart */}
                <div className="portal-panel">
                  <div className="portal-panel-head">
                    <span className="portal-panel-title">Revenue · 8w</span>
                    <span style={{ fontSize: '11px', color: '#78716c', fontWeight: 600 }}>₹ total quoted</span>
                  </div>
                  <div className="trend-bars-wrap">
                    {(() => {
                      const maxAmount = Math.max(...stats.weeklyBars.map((b: any) => b.amount), 1);
                      const formatInd = (v: number) => {
                        if (v >= 10000000) return "₹" + (v / 10000000).toFixed(1).replace(/\.0$/, "") + " Cr";
                        if (v >= 100000) return "₹" + (v / 100000).toFixed(1).replace(/\.0$/, "") + " L";
                        return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
                      };
                      return stats.weeklyBars.map((b: any, i: number) => {
                        const height = maxAmount ? (b.amount / maxAmount) * 100 : 0;
                        const isPeak = b.amount === maxAmount && b.amount > 0;
                        return (
                          <div key={i} className="trend-col">
                            <span className="trend-amount" style={{ visibility: b.amount > 0 ? 'visible' as const : 'hidden' as const, opacity: isPeak ? 1 : .72 }}>{formatInd(b.amount)}</span>
                            <div 
                              className={`trend-bar ${isPeak ? 'peak' : ''} ${b.amount===0 ? 'empty' : ''}`} 
                              style={{ height: `${b.amount===0 ? 4 : Math.max(height, 10)}%` }} 
                            />
                            <span className="trend-label">{b.label}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}
            
            {/* Business Profile & Trust Credentials */}
            <div className="portal-panel">
              <div className="portal-panel-head">
                <span className="portal-panel-title">Verified Business Profile</span>
                <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Active Verified Enterprise
                </span>
              </div>
              <div className="info-grid">
                {infoFields.map((f) => (
                  <div className="info-item" key={f.label}>
                    <div className="label">{f.label}</div>
                    <div className="value">{f.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--portal-border)', display: 'flex', gap: '24px', fontSize: '12.5px', color: 'var(--portal-text-muted)', flexWrap: 'wrap' }}>
                <div>Business Status: <strong style={{ color: client.is_active ? '#059669' : '#dc2626' }}>{client.is_active ? 'Active' : 'Inactive'}</strong></div>
                <div>Account Tier: <strong>{client.trial_expires_at ? new Date(client.trial_expires_at).toLocaleDateString() : 'Enterprise Lifetime'}</strong></div>
                <div>Customer Portal: <strong style={{ color: 'var(--portal-text)' }}>{brand} Official</strong></div>
              </div>
            </div>
          </div>

          {/* Settings Tab */}
          <div className={`tab-pane ${activeTab === "settings" ? "active" : ""}`}>
            <form onSubmit={handleSettingsSave} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Header Card — minimal system bar */}
              <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#111827', letterSpacing: '-.01em' }}>Update business information</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#6b7280' }}>Profile, contact, bank and margin settings.</p>
                </div>
                <button type="submit" disabled={isSaving} className="btn-save">
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
              
              {saveMessage && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: saveMessage.includes('Error') ? '#fee2e2' : '#d1fae5', color: saveMessage.includes('Error') ? '#ef4444' : '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saveMessage}
                </div>
              )}

              {/* Company Information */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Company Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Company Name</label>
                    <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Proprietor Name</label>
                    <input type="text" value={formData.companyProprietor} onChange={e => setFormData({...formData, companyProprietor: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Contact Number</label>
                    <input type="text" value={formData.companyContact} onChange={e => setFormData({...formData, companyContact: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Email Address</label>
                    <input type="email" value={formData.companyEmail} onChange={e => setFormData({...formData, companyEmail: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>GST Number</label>
                    <input type="text" value={formData.gstNumber} onChange={e => setFormData({...formData, gstNumber: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <label style={{ fontWeight: '600' }}>Company Address</label>
                    <textarea value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} rows={2} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Bank & Payments */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Bank & Payments</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Bank Name</label>
                    <input type="text" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Branch</label>
                    <input type="text" value={formData.bankBranch} onChange={e => setFormData({...formData, bankBranch: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Account No.</label>
                    <input type="text" value={formData.bankAccountNo} onChange={e => setFormData({...formData, bankAccountNo: e.target.value})} placeholder="1785xxxxxx" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>IFSC</label>
                    <input type="text" value={formData.bankIfsc} onChange={e => setFormData({...formData, bankIfsc: e.target.value})} placeholder="UBIN0xxxxx" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>UPI ID <span style={{ fontWeight:400, color:'#78716c', fontSize:'11px' }}>· for QR on invoices</span></label>
                    <input type="text" value={formData.upiId} onChange={e => setFormData({...formData, upiId: e.target.value})} placeholder="6304562779@nyes" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Tax & Compliance */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Tax & Compliance</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>PAN</label>
                    <input type="text" value={formData.panNumber} onChange={e => setFormData({...formData, panNumber: e.target.value.toUpperCase()})} placeholder="AAQFK269C" maxLength={10} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', textTransform:'uppercase' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>State Code</label>
                    <input type="text" value={formData.stateCode} onChange={e => setFormData({...formData, stateCode: e.target.value})} placeholder="36" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>HSN Code</label>
                    <input type="text" value={formData.hsnCode} onChange={e => setFormData({...formData, hsnCode: e.target.value})} placeholder="3925" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Secondary Contact</label>
                    <input type="text" value={formData.secondaryContact} onChange={e => setFormData({...formData, secondaryContact: e.target.value})} placeholder="98765 43210" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>WhatsApp Number <span style={{ fontWeight:400, color:'#0e7a5a', fontSize:'11px' }}>· for follow-ups</span></label>
                    <input type="text" value={formData.whatsappNumber} onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} placeholder="Same as primary if empty" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Quotation Defaults */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Quotation Defaults</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Validity (days)</label>
                    <input type="number" min={1} value={formData.quoteValidityDays} onChange={e => setFormData({...formData, quoteValidityDays: parseInt(e.target.value)||15})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Place of Supply</label>
                    <input type="text" value={formData.placeOfSupply} onChange={e => setFormData({...formData, placeOfSupply: e.target.value})} placeholder="Hyderabad" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Authorized Signatory</label>
                    <input type="text" value={formData.authorizedSignatory} onChange={e => setFormData({...formData, authorizedSignatory: e.target.value})} placeholder="Prabhakaar Reddi" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Advance %</label>
                    <input type="number" min={0} max={100} value={formData.defaultAdvancePercent} onChange={e => setFormData({...formData, defaultAdvancePercent: parseInt(e.target.value)||0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Transport (₹)</label>
                    <input type="number" min={0} value={formData.defaultTransportCost} onChange={e => setFormData({...formData, defaultTransportCost: parseInt(e.target.value)||0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Labour /sqft (₹)</label>
                    <input type="number" min={0} value={formData.labourCostPerSqft} onChange={e => setFormData({...formData, labourCostPerSqft: parseFloat(e.target.value)||0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Installation /sqft (₹)</label>
                    <input type="number" min={0} value={formData.installationCostPerSqft} onChange={e => setFormData({...formData, installationCostPerSqft: parseFloat(e.target.value)||0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Wastage %</label>
                    <input type="number" min={0} max={20} step={0.5} value={formData.wastagePercent} onChange={e => setFormData({...formData, wastagePercent: parseFloat(e.target.value)||0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <label style={{ fontWeight: '600' }}>Quote footer note <span style={{ fontWeight:400, color:'#78716c', fontSize:'11px' }}>· printed below every quote</span></label>
                    <textarea value={formData.quoteNotes} onChange={e => setFormData({...formData, quoteNotes: e.target.value})} rows={2} placeholder="Thank you for your inquiry..." style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Presence & Social */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Presence</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Est. Year</label>
                    <input type="text" value={formData.establishmentYear} onChange={e => setFormData({...formData, establishmentYear: e.target.value})} placeholder="2018" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Business Hours</label>
                    <input type="text" value={formData.businessHours} onChange={e => setFormData({...formData, businessHours: e.target.value})} placeholder="Mon-Sat 9:30 AM - 7:30 PM" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <label style={{ fontWeight: '600' }}>Service Areas <span style={{ fontWeight:400, color:'#78716c', fontSize:'11px' }}>· comma separated</span></label>
                    <input type="text" value={(formData.serviceAreas||[]).join(', ')} onChange={e => setFormData({...formData, serviceAreas: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} placeholder="Hastinapur, LB Nagar, Hayathnagar" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Google Maps URL</label>
                    <input type="url" value={formData.googleMapsUrl} onChange={e => setFormData({...formData, googleMapsUrl: e.target.value})} placeholder="https://maps.google.com/..." style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Facebook</label>
                    <input type="url" value={formData.facebookUrl} onChange={e => setFormData({...formData, facebookUrl: e.target.value})} placeholder="https://facebook.com/..." style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Instagram</label>
                    <input type="url" value={formData.instagramUrl} onChange={e => setFormData({...formData, instagramUrl: e.target.value})} placeholder="https://instagram.com/..." style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Billing & Terms */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Billing & Terms</h3>
                <div className="form-group" style={{ margin: 0, marginBottom: '20px' }}>
                  <label style={{ fontWeight: '600' }}>Default GST Percentage (%)</label>
                  <input type="number" value={formData.defaultGstPercentage} onChange={e => setFormData({...formData, defaultGstPercentage: parseFloat(e.target.value) || 0})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '300px' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600' }}>Terms & Conditions (Enter each on a new line)</label>
                  <textarea 
                    value={(formData.termsAndConditions || []).join('\n')} 
                    onChange={e => setFormData({...formData, termsAndConditions: e.target.value.split('\n')})} 
                    rows={6} 
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', lineHeight: '1.5' }}
                  />
                </div>
              </div>

              {/* Profit & Margin */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Profit & Margin</h3>
                <p style={{ color: 'var(--text-light)', fontSize: '14px', marginBottom: '16px' }}>What % of what you quote goes toward materials & labor?</p>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <input 
                      type="range" 
                      min="10" 
                      max="95" 
                      value={formData.cost_margin_percent} 
                      onChange={e => setFormData({...formData, cost_margin_percent: parseInt(e.target.value)})}
                      style={{ flex: 1, height: '6px', borderRadius: '3px', accentColor: 'var(--primary)' }}
                    />
                     <div style={{ width: '80px', textAlign: 'center', padding: '12px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                       <span style={{ fontWeight: '800', fontSize: '20px', color: 'var(--primary)' }}>{formData.cost_margin_percent}%</span>
                     </div>
                   </div>
                 </div>
               </div>

               {client.id === "kprupvc" && (
                 <div className="info-card">
                   <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Supplier Companies</h3>
                   <p style={{ color: 'var(--text-light)', fontSize: '14px', marginBottom: '16px' }}>Add the names of supplier/material companies you use (e.g. Baar). These will appear as a dropdown when creating quotations.</p>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                     {(formData.supplierCompanies || []).map((company: string, idx: number) => (
                       <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                         <span style={{ flex: 1, fontSize: '15px' }}>{company}</span>
                         <button type="button" onClick={() => {
                           const updated = [...formData.supplierCompanies];
                           updated.splice(idx, 1);
                           setFormData({...formData, supplierCompanies: updated});
                          }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}>×</button>
                       </div>
                     ))}
                   </div>
                   <div style={{ display: 'flex', gap: '12px' }}>
                     <input
                       type="text"
                       id="new-supplier"
                       placeholder="Enter company name"
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') {
                           e.preventDefault();
                           const input = e.target as HTMLInputElement;
                           const val = input.value.trim();
                           if (val && !(formData.supplierCompanies || []).includes(val)) {
                             setFormData({...formData, supplierCompanies: [...(formData.supplierCompanies || []), val]});
                             input.value = '';
                           }
                         }
                       }}
                       style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                     />
                     <button type="button" onClick={() => {
                       const input = document.getElementById('new-supplier') as HTMLInputElement;
                       const val = input.value.trim();
                       if (val && !(formData.supplierCompanies || []).includes(val)) {
                         setFormData({...formData, supplierCompanies: [...(formData.supplierCompanies || []), val]});
                         input.value = '';
                       }
                     }} style={{ padding: '10px 20px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
                   </div>
                 </div>
               )}
             </form>
          </div>

          {/* Catalog Tab */}
          <div className={`tab-pane ${activeTab === "catalog" ? "active" : ""}`}>
            <div className="info-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>Product & Pricing Presets</h3>
                  <p style={{ color: 'var(--text-light)', fontSize: '14px', marginTop: '4px' }}>
                    Configure standard products and rates to speed up quote creation.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.enablePricePresets || false}
                    aria-label="Enable Presets"
                    onClick={() => {
                      setFormData(prev => {
                        const next = !(prev.enablePricePresets || false);
                        if (next && (!prev.measuredPresets || prev.measuredPresets.length === 0) && (!prev.unmeasuredPresets || prev.unmeasuredPresets.length === 0)) {
                          return { 
                            ...prev, 
                            enablePricePresets: true, 
                            measuredPresets: [{ name: "Standard 2-Track Window", code: "2TRK", description: "UPVC 2-Track Sliding Window", glass: "Clear 5mm", width: "", height: "", rate: 450 }],
                            unmeasuredPresets: [{ name: "Mosquito Mesh", code: "MESH", description: "Fiberglass Mosquito Mesh", rate: 120 }]
                          };
                        }
                        return { ...prev, enablePricePresets: next };
                      });
                    }}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px', border: '1px solid ' + (formData.enablePricePresets ? '#b7790f' : '#d1d5db'), cursor: 'pointer',
                      background: formData.enablePricePresets ? '#b7790f' : '#e5e7eb',
                      position: 'relative', transition: 'background 0.12s', padding: 0, flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px', left: formData.enablePricePresets ? '22px' : '2px',
                      width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                  <span style={{ fontWeight: '600' }}>Enable Presets</span>
                </div>
              </div>

              {!formData.enablePricePresets && (
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e5e7eb', display: 'grid', placeItems: 'center', marginBottom: '12px', color: '#6b7280' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                  </div>
                  <div style={{ fontFamily: 'var(--portal-display)', fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>Presets are off</div>
                  <div style={{ fontSize: '13px', color: '#78716c', maxWidth: '440px', lineHeight: 1.5, marginBottom: '4px' }}>
                    Save types and rates once — create quotes without retyping.
                  </div>
                </div>
              )}
              {formData.enablePricePresets && (
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  
                  {/* Measured Presets Section */}
                  <div>
                    <h4 style={{ marginBottom: '12px', color: 'var(--primary)' }}>Measured Items</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {(formData.measuredPresets || []).map((preset: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-light)', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '600', fontSize: '14px' }}>Measured Item #{idx + 1}</span>
                            <button 
                              onClick={() => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets.splice(idx, 1);
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ padding: '4px 8px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >Remove</button>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <input type="text" placeholder="Preset Name (e.g. 2-Track Sliding)" value={preset.name || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].name = e.target.value;
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            <input type="text" placeholder="Code (e.g. 2TRK)" value={preset.code || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].code = e.target.value;
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ width: '120px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                          </div>
                          
                          <input type="text" placeholder="Full Description for Quote" value={preset.description || ''}
                            onChange={(e) => {
                              const newPresets = [...formData.measuredPresets];
                              newPresets[idx].description = e.target.value;
                              setFormData({...formData, measuredPresets: newPresets});
                            }}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <input type="text" placeholder="Glass Specification" value={preset.glass || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].glass = e.target.value;
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            <input type="number" placeholder="W (MM)" value={preset.width || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].width = parseFloat(e.target.value) || '';
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ width: '90px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            <input type="number" placeholder="H (MM)" value={preset.height || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].height = parseFloat(e.target.value) || '';
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ width: '90px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            <input type="number" placeholder="Rate (₹/sqft)" value={preset.rate || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.measuredPresets];
                                newPresets[idx].rate = parseFloat(e.target.value) || 0;
                                setFormData({...formData, measuredPresets: newPresets});
                              }}
                              style={{ width: '130px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => {
                        setFormData({
                          ...formData, 
                          measuredPresets: [...(formData.measuredPresets || []), { name: "", code: "", description: "", glass: "", width: "", height: "", rate: 0 }]
                        });
                      }}
                      style={{ marginTop: '16px', padding: '10px 16px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '8px', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', width: '100%' }}
                    >
                      + Add Measured Preset
                    </button>
                  </div>

                  {/* Unmeasured Presets Section */}
                  <div>
                    <h4 style={{ marginBottom: '12px', color: '#10b981' }}>Unmeasured Items</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {(formData.unmeasuredPresets || []).map((preset: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-light)', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '600', fontSize: '14px' }}>Unmeasured Item #{idx + 1}</span>
                            <button 
                              onClick={() => {
                                const newPresets = [...formData.unmeasuredPresets];
                                newPresets.splice(idx, 1);
                                setFormData({...formData, unmeasuredPresets: newPresets});
                              }}
                              style={{ padding: '4px 8px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >Remove</button>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <input type="text" placeholder="Preset Name (e.g. Mosquito Mesh)" value={preset.name || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.unmeasuredPresets];
                                newPresets[idx].name = e.target.value;
                                setFormData({...formData, unmeasuredPresets: newPresets});
                              }}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            <input type="text" placeholder="Code (e.g. MESH)" value={preset.code || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.unmeasuredPresets];
                                newPresets[idx].code = e.target.value;
                                setFormData({...formData, unmeasuredPresets: newPresets});
                              }}
                              style={{ width: '120px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                          </div>
                          
                          <input type="text" placeholder="Full Description for Quote" value={preset.description || ''}
                            onChange={(e) => {
                              const newPresets = [...formData.unmeasuredPresets];
                              newPresets[idx].description = e.target.value;
                              setFormData({...formData, unmeasuredPresets: newPresets});
                            }}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                            
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <input type="number" placeholder="Rate (₹/unit)" value={preset.rate || ''}
                              onChange={(e) => {
                                const newPresets = [...formData.unmeasuredPresets];
                                newPresets[idx].rate = parseFloat(e.target.value) || 0;
                                setFormData({...formData, unmeasuredPresets: newPresets});
                              }}
                              style={{ width: '150px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => {
                        setFormData({
                          ...formData, 
                          unmeasuredPresets: [...(formData.unmeasuredPresets || []), { name: "", code: "", description: "", rate: 0 }]
                        });
                      }}
                      style={{ marginTop: '16px', padding: '10px 16px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#10b981', fontWeight: '600', cursor: 'pointer', width: '100%' }}
                    >
                      + Add Unmeasured Preset
                    </button>
                  </div>
                  <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={handleSettingsSave} disabled={isSaving} className="btn-save">
                      {isSaving ? "Saving Presets..." : "Save All Changes"}
                    </button>
                    {saveMessage && <span className="save-message" style={{ color: saveMessage.includes('Error') ? '#ef4444' : '#10b981' }}>{saveMessage}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Market Page preview iframe */}
          <div className={`iframe-container ${activeTab === "market" ? "active" : ""}`} style={{ display: activeTab === "market" ? "flex" : "none", flexDirection: "column", height: "100%", width: "100%" }}>
            <div style={{ padding: "12px 24px", background: "white", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-light)" }}>
                <span>Public Web Page:</span>
                <a href={marketUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: "600", textDecoration: "none" }}>
                  {typeof window !== "undefined" ? window.location.origin + marketUrl : marketUrl}
                </a>
              </div>
              <a
                href={marketUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: "var(--bg-light)",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#334155",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>Open in New Tab</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
            {marketUrl && <iframe src={marketUrl} className="tab-iframe" title="Market Page" style={{ flex: 1, border: "none", width: "100%", height: "calc(100vh - 120px)" }} />}
          </div>

          {/* Market Settings Tab (Testimonials Management) */}
          {activeTab === "market-settings" && client.id.toLowerCase() === "kprupvc" && (
            <div style={{ padding: 24 }}>
              <MarketPageSettings clientId={client.id} />
            </div>
          )}

          {/* iOS "Add to Home Screen" instructions */}
          {showA2hsModal && (
            <div
              onClick={() => setShowA2hsModal(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'white', borderRadius: '16px', maxWidth: '380px', width: '100%', padding: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>Install on iPhone / iPad</h3>
                  <button
                    onClick={() => setShowA2hsModal(false)}
                    style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontWeight: '700', color: '#475569' }}
                  >×</button>
                </div>
                <ol style={{ margin: '0 0 12px', paddingLeft: '20px', color: '#334155', fontSize: '14px', lineHeight: 1.8 }}>
                  <li>Tap the <b>Share</b> icon in the Safari toolbar.</li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b> in the top-right corner.</li>
                </ol>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {brand} will appear on your home screen like a normal app.
                </p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
    </div>
  );
}
