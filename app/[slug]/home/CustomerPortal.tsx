"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow } from "@/lib/slug";
import { slugify } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import "./portal.css";
import { MarketPageSettings } from "./MarketPageSettings";

interface InfoField {
  label: string;
  value: string;
}

export default function CustomerPortal({ client }: { client: ClientRow; slug: string }) {
  const router = useRouter();
  const config = useMemo(() => parseClientConfig(client.config || {}, client.id), [client.config, client.id]);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "app" | "catalog" | "market" | "settings">("overview");

  const [brand, setBrand] = useState("Loading...");
  const [infoFields, setInfoFields] = useState<InfoField[]>([]);
  const [appUrl, setAppUrl] = useState("");
  const [marketUrl, setMarketUrl] = useState("");

  const [stats, setStats] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const deferredPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showA2hsModal, setShowA2hsModal] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
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
      router.replace("/login");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const authRes = await fetch("/api/portal_auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "session" }),
        });
        const authData = await authRes.json();
        if (cancelled) return;
        if (!authRes.ok || authData.role !== "customer" || authData.client_id !== clientId) {
          localStorage.clear();
          router.replace("/login");
          return;
        }

        const primaryColor = config.primaryColor
          ? "#" + config.primaryColor.toString(16).padStart(8, "0").slice(2)
          : "#6366f1";
        const accentColor = config.accentColor
          ? "#" + config.accentColor.toString(16).padStart(8, "0").slice(2)
          : "#ec4899";

        document.documentElement.style.setProperty("--primary", primaryColor);
        document.documentElement.style.setProperty("--accent", accentColor);
        document.documentElement.style.setProperty(
          "--primary-gradient",
          "linear-gradient(135deg, " + primaryColor + " 0%, " + accentColor + " 100%)",
        );

        setBrand(config.companyName || client.id);
        
        const appSlug = slugify(config.appName) || slugify(client.id);
        const marketSlug = slugify(config.companyName) || slugify(client.id);
        
        setAppUrl("/upvc/" + appSlug + "?client=" + encodeURIComponent(client.id) + "&auto_login=true");
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
          bankName: config.bankName || "",
          bankBranch: config.bankBranch || "",
          bankAccountNo: config.bankAccountNo || "",
          bankIfsc: config.bankIfsc || "",
          termsAndConditions: config.termsAndConditions || [],
          defaultGstPercentage: config.defaultGstPercentage || 0,
          cost_margin_percent: config.cost_margin_percent || 0,
          enablePricePresets: config.enablePricePresets || false,
          measuredPresets: config.measuredPresets || [],
          unmeasuredPresets: config.unmeasuredPresets || [],
        });

        // Fetch stats in parallel
        fetch("/api/portal_stats").then(r => r.json()).then(data => {
          if (!cancelled && !data.error) setStats(data);
        }).catch(e => console.error(e));

        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("Error: " + (e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, client, config]);

  const handleLogout = useCallback(async () => {
    localStorage.clear();
    await fetch("/api/portal_auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "logout" }),
    });
    router.replace("/login");
  }, [router]);
  
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/portal_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaveMessage("Settings saved successfully! Changes will reflect on app reload.");
    } catch (err: any) {
      setSaveMessage("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLiteMode = async () => {
    // Already running as an installed app → jump straight to the app.
    if (isStandalone) {
      if (appUrl) window.location.href = appUrl;
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
    // iOS Safari: no install prompt API → show "Add to Home Screen" steps.
    if (isIOS) {
      setShowA2hsModal(true);
      return;
    }
    // Fallback: open the app inside the portal.
    setActiveTab("app");
  };

  if (status === "error") {
    return (
      <div className="dashboard-layout" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="error">{errorMsg}</div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="dashboard-layout" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="loading">Loading your workspace...</div>
      </div>
    );
  }

  const tabTitles = {
    overview: "Business Overview",
    app: "Quotation Maker",
    catalog: "Product Catalog",
    market: "Market Page Preview",
    settings: "Business Settings"
  };

  return (
    <div className="portal-root">
      {/* Custom Theme Toast Notification */}
      {toast && (
        <div style={{
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
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      <div className="dashboard-layout">
      {/* Sidebar */}
      <div className={`mobile-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          {config.logoUrl && <img src={config.logoUrl} alt="Logo" />}
          <h2>{brand}</h2>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => { setActiveTab("overview"); setSidebarOpen(false); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Overview
          </button>
          <button 
            className={`nav-item ${activeTab === "app" ? "active" : ""}`}
            onClick={() => { setActiveTab("app"); setSidebarOpen(false); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Quotation App
          </button>
          <button 
            className={`nav-item ${activeTab === "catalog" ? "active" : ""}`}
            onClick={() => { setActiveTab("catalog"); setSidebarOpen(false); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Product Catalog
          </button>
          <button 
            className={`nav-item ${activeTab === "market" ? "active" : ""}`}
            onClick={() => { setActiveTab("market"); setSidebarOpen(false); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </nav>
        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Lite Mode: Instant Web App / PWA */}
          <button 
            onClick={handleLiteMode}
            className="btn-download" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '10px 14px', 
              color: 'var(--text)', 
              borderRadius: '10px', 
              border: '1px solid var(--border, #e2e8f0)',
              background: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <span>{isStandalone ? "Open App" : "App Lite Mode"}</span>
            </div>
            <span style={{ fontSize: '10px', background: (canInstall || isIOS) && !isStandalone ? '#dcfce7' : isStandalone ? '#ede9fe' : '#e0e7ff', color: (canInstall || isIOS) && !isStandalone ? '#166534' : isStandalone ? '#5b21b6' : '#3730a3', padding: '2px 6px', borderRadius: '10px' }}>{isStandalone ? 'Open' : canInstall || isIOS ? 'Install' : 'Instant'}</span>
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
                    btn.innerHTML = `<span style="font-size: 13px; font-weight: 600;">Triggering Build...</span>`;
                    btn.style.pointerEvents = 'none';
                    try {
                      const res = await fetch("/api/trigger_build", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          client_id: client.id,
                          app_name: config.appName
                        })
                      });
                      if (res.ok) {
                        showToast("Build successfully triggered! Your Pro Native APK is being generated in the cloud. Check back in 5-10 minutes.", "success");
                        // Force page reload to show 'Building' status
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
                className="btn-download" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '10px 14px', 
                  color: 'var(--text)', 
                  textDecoration: 'none', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border, #e2e8f0)',
                  background: isBuilding ? '#fef3c7' : config.appDownloadUrl ? '#f0fdf4' : '#f8fafc',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <span style={{ 
                  fontSize: '10px', 
                  background: isBuilding ? '#fde68a' : config.appDownloadUrl ? '#dcfce7' : '#f1f5f9', 
                  color: isBuilding ? '#92400e' : config.appDownloadUrl ? '#166534' : '#64748b', 
                  padding: '2px 6px', 
                  borderRadius: '10px' 
                }}>
                  {isBuilding ? `Building (~${buildMinutesRemaining}m left)` : config.appDownloadUrl ? 'APK Ready' : 'Request Build'}
                </span>
              </a>
            );
          })()}
          <button className="btn-logout" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="header-title">{tabTitles[activeTab]}</h1>
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
            
            {/* Greeting & Quick Action Banner */}
            <div className="info-card" style={{ 
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
              color: 'white', 
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>
                  Welcome back, {config.companyProprietor || config.companyName || "Partner"}! 👋
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                  Here is your real-time business summary. Keep closing orders!
                </p>
              </div>
              <button 
                onClick={() => setActiveTab("app")}
                style={{
                  background: 'var(--primary-gradient)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create New Quotation
              </button>
            </div>

            {/* Hero Stats */}
            {stats && (
              <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card" style={{ background: 'var(--primary-gradient)', color: 'white' }}>
                  <div className="label" style={{ color: 'rgba(255,255,255,0.8)' }}>Orders Won %</div>
                  <div className="value" style={{ fontSize: '32px' }}>{stats.winRate.toFixed(1)}%</div>
                  <div style={{ fontSize: '14px', marginTop: '4px', opacity: 0.9 }}>
                    {stats.wonCount} won out of {stats.totalCount} total quotes
                  </div>
                </div>

                <div className="stat-card">
                  <div className="label">Total Work Quoted</div>
                  <div className="value" style={{ fontSize: '24px' }}>₹ {stats.totalQuoted.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  {stats.monthChangePercent !== 0 && (
                    <div style={{ 
                      fontSize: '13px', 
                      marginTop: '6px', 
                      fontWeight: '600',
                      color: stats.monthChangePercent >= 0 ? '#10b981' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {stats.monthChangePercent >= 0 ? '↑' : '↓'} {Math.abs(stats.monthChangePercent).toFixed(1)}% vs last month
                    </div>
                  )}
                </div>

                <div className="stat-card">
                  <div className="label">Confirmed Orders (Revenue)</div>
                  <div className="value" style={{ fontSize: '24px', color: '#10b981' }}>₹ {stats.wonQuoted.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '6px' }}>
                    From {stats.wonCount} closed deal{stats.wonCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Charts */}
            {stats && (
              <div className="stats-grid" style={{ marginBottom: '32px' }}>
                {/* Status Summary Donut Chart */}
                <div className="info-card" style={{ flex: 1 }}>
                  <h3>Quote Status Summary</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                        {(() => {
                          const total = stats.totalCount;
                          if (total === 0) return <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="20" />;
                          
                          let currentAngle = 0;
                          const colors: Record<string, string> = { Draft: '#94a3b8', Sent: '#60a5fa', Won: '#22c55e', Lost: '#f87171' };
                          
                          return ['Draft', 'Sent', 'Won', 'Lost'].map(status => {
                            const count = stats.countsByStatus[status] || 0;
                            if (count === 0) return null;
                            const percentage = count / total;
                            const dasharray = `${percentage * 251.2} 251.2`;
                            const dashoffset = currentAngle * -251.2;
                            currentAngle += percentage;
                            return (
                              <circle key={status} cx="50" cy="50" r="40" fill="none"
                                stroke={colors[status]} strokeWidth="20"
                                strokeDasharray={dasharray} strokeDashoffset={dashoffset}
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.winRate.toFixed(0)}%</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>won</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { label: 'Draft', name: 'Being Prepared', color: '#94a3b8' },
                        { label: 'Sent', name: 'Delivered to Client', color: '#60a5fa' },
                        { label: 'Won', name: 'Order Confirmed ✅', color: '#22c55e' },
                        { label: 'Lost', name: 'Did Not Close ❌', color: '#f87171' }
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: s.color }} />
                            <span style={{ fontSize: '13px' }}>{s.name}</span>
                          </div>
                          <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{stats.countsByStatus[s.label] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weekly Bar Chart */}
                <div className="info-card" style={{ flex: 1 }}>
                  <h3>Weekly Work Trend</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '120px', gap: '8px', marginTop: '16px' }}>
                    {(() => {
                      const maxAmount = Math.max(...stats.weeklyBars.map((b: any) => b.amount), 1);
                      return stats.weeklyBars.map((b: any, i: number) => {
                        const height = (b.amount / maxAmount) * 100;
                        const isLast = i === stats.weeklyBars.length - 1;
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                            {b.amount > 0 && <span style={{ fontSize: '9px', color: 'var(--text-light)', marginBottom: '4px' }}>{b.amount >= 1000 ? (b.amount/1000).toFixed(0)+'k' : b.amount}</span>}
                            <div style={{ 
                              width: '100%', 
                              height: `${Math.max(height, 5)}%`, 
                              background: isLast ? 'var(--primary-gradient)' : '#e0e7ff', 
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.5s ease'
                            }} />
                            <span style={{ fontSize: '9px', color: 'var(--text-light)', marginTop: '4px', whiteSpace: 'nowrap' }}>{b.label.split(' ')[0]}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Pending Follow-ups Reminder Section */}
            {stats && stats.pendingFollowUps && stats.pendingFollowUps.length > 0 && (
              <div className="info-card" style={{ marginBottom: '24px', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🔔</span>
                    <h3 style={{ margin: 0, padding: 0, border: 'none' }}>Quotes Needing Follow-up ({stats.pendingFollowUps.length})</h3>
                  </div>
                  <span style={{ fontSize: '12px', background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>
                    High Conversion Opportunity
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {stats.pendingFollowUps.map((item: any) => (
                    <div key={item.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '12px 16px', 
                      background: 'var(--bg-light)', 
                      borderRadius: '12px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '15px' }}>{item.customer_name} ({item.quote_no})</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                          Value: ₹{item.total.toLocaleString('en-IN')} • Date: {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {item.contact_no && (
                          <a 
                            href={`tel:${item.contact_no}`} 
                            style={{ 
                              padding: '8px 14px', 
                              borderRadius: '8px', 
                              background: '#3b82f6', 
                              color: 'white', 
                              textDecoration: 'none', 
                              fontSize: '13px', 
                              fontWeight: '600' 
                            }}
                          >
                            📞 Call Client
                          </a>
                        )}
                        <button 
                          onClick={() => {
                            const newAppUrl = "/upvc/" + slugify(config.appName || client.id) + "?client=" + encodeURIComponent(client.id) + "&auto_login=true&open_quote=" + encodeURIComponent(item.id);
                            setAppUrl(newAppUrl);
                            setActiveTab("app");
                          }} 
                          style={{ 
                            padding: '8px 14px', 
                            borderRadius: '8px', 
                            background: 'white', 
                            border: '1px solid #cbd5e1', 
                            fontSize: '13px', 
                            fontWeight: '600',
                            cursor: 'pointer' 
                          }}
                        >
                          View Quote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Profile Info */}
            <div className="info-card">
              <h3>Business Profile Details</h3>
              <div className="info-grid">
                {infoFields.map((f) => (
                  <div className="info-item" key={f.label}>
                    <div className="label">{f.label}</div>
                    <div className="value">{f.value}</div>
                  </div>
                ))}
              </div>

              {/* Account Status Footer Note */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-light)' }}>
                <div>Account Status: <strong style={{ color: client.is_active ? '#10b981' : '#ef4444' }}>{client.is_active ? 'Active ✅' : 'Inactive'}</strong></div>
                <div>Plan Expiration: <strong>{client.trial_expires_at ? new Date(client.trial_expires_at).toLocaleDateString() : 'Lifetime Unlimited'}</strong></div>
              </div>
            </div>
          </div>

          {/* Settings Tab */}
          <div className={`tab-pane ${activeTab === "settings" ? "active" : ""}`}>
            <form onSubmit={handleSettingsSave} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Header Card */}
              <div className="info-card" style={{ background: 'var(--primary-gradient)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '24px' }}>Update Business Information</h2>
                  <p style={{ margin: '4px 0 0', opacity: 0.9 }}>Manage your profile, contact details, bank accounts, and profit margins.</p>
                </div>
                <button type="submit" disabled={isSaving} style={{ background: 'white', color: 'var(--primary)', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  {isSaving ? "Saving..." : "Save Changes"}
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

              {/* Bank Details */}
              <div className="info-card">
                <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', color: 'var(--primary)' }}>Bank Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Bank Name</label>
                    <input type="text" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Branch Name</label>
                    <input type="text" value={formData.bankBranch} onChange={e => setFormData({...formData, bankBranch: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Account Number</label>
                    <input type="text" value={formData.bankAccountNo} onChange={e => setFormData({...formData, bankAccountNo: e.target.value})} placeholder="A/C.NO: 123456" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>IFSC Code</label>
                    <input type="text" value={formData.bankIfsc} onChange={e => setFormData({...formData, bankIfsc: e.target.value})} placeholder="IFSC CODE: ABCD0123" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%' }} />
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
                      width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                      background: formData.enablePricePresets ? 'var(--primary, #2563eb)' : '#cbd5e1',
                      position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0,
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
                            >✕ Remove</button>
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
                            >✕ Remove</button>
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

          {/* iFrame Tabs for App and Market */}
          <div className={`iframe-container ${activeTab === "app" ? "active" : ""}`}>
            {appUrl && <iframe src={appUrl} className="tab-iframe" title="Quotation Maker" />}
          </div>

          <div className={`iframe-container ${activeTab === "market" ? "active" : ""}`}>
            {marketUrl && <iframe src={marketUrl} className="tab-iframe" title="Market Page" />}
            {activeTab === "market" && client.id.toLowerCase() === "kprupvc" && (
              <div style={{ marginTop: 24 }}>
                <MarketPageSettings clientId={client.id} />
              </div>
            )}
          </div>

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
                  >✕</button>
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
