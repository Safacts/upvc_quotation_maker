"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow } from "@/lib/slug";
import { slugify } from "@/lib/slug";
import { parseClientConfig } from "@/lib/types";
import "./portal.css";

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
  const [activeTab, setActiveTab] = useState<"overview" | "app" | "market" | "settings">("overview");

  const [brand, setBrand] = useState("Loading...");
  const [infoFields, setInfoFields] = useState<InfoField[]>([]);
  const [appUrl, setAppUrl] = useState("");
  const [marketUrl, setMarketUrl] = useState("");

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
        setAppUrl("/upvc/" + appSlug);
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
    market: "Market Page Preview",
    settings: "Business Settings"
  };

  return (
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
        <div className="sidebar-footer">
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
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Status</div>
                <div className="value" style={{ color: client.is_active ? '#10b981' : '#ef4444' }}>
                  {client.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div className="stat-card">
                <div className="label">Trial Expiration</div>
                <div className="value" style={{ fontSize: '18px' }}>
                  {client.trial_expires_at ? new Date(client.trial_expires_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>

            <div className="info-card">
              <h3>Business Profile</h3>
              <div className="info-grid">
                {infoFields.map((f) => (
                  <div className="info-item" key={f.label}>
                    <div className="label">{f.label}</div>
                    <div className="value">{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Settings Tab */}
          <div className={`tab-pane ${activeTab === "settings" ? "active" : ""}`}>
            <div className="info-card">
              <h3>Administrative Controls</h3>
              <p style={{ color: 'var(--text-light)', marginBottom: '24px' }}>
                To modify your colors, logo, or view all active customer quotations, you must access the Super Admin panel.
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <a 
                  href="/admin" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ background: 'var(--primary-gradient)', color: 'white', padding: '12px 24px', borderRadius: '12px', textDecoration: 'none', fontWeight: 600 }}
                >
                  Open Advanced Settings
                </a>
              </div>
            </div>
          </div>

          {/* iFrame Tabs for App and Market */}
          <div className={`iframe-container ${activeTab === "app" ? "active" : ""}`}>
            {appUrl && <iframe src={appUrl} className="tab-iframe" title="Quotation Maker" />}
          </div>

          <div className={`iframe-container ${activeTab === "market" ? "active" : ""}`}>
            {marketUrl && <iframe src={marketUrl} className="tab-iframe" title="Market Page" />}
          </div>

        </div>
      </main>
    </div>
  );
}
