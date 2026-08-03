"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import "./admin.css";

const API = "https://effxrwrbsjduvhmorvrq.supabase.co/rest/v1";
const KEY = "sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN";
const headers = {
  apikey: KEY,
  Authorization: "Bearer " + KEY,
  "Content-Type": "application/json",
};

interface ClientRow {
  id: string;
  config?: Record<string, any> | null;
  is_active?: boolean;
  trial_expires_at?: string | null;
}

interface FilePayload {
  data: string;
  mime: string;
}

interface EditorForm {
  id: string;
  logoUrl: string;
  companyName: string;
  appName: string;
  address: string;
  contact: string;
  email: string;
  portalPassword: string;
  tempPassword: string;
  sendWelcome: boolean;
  proprietor: string;
  gst: string;
  bankName: string;
  bankBranch: string;
  account: string;
  ifsc: string;
  prefix: string;
  trialDays: string;
  primaryColor: string;
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  services: string;
  aboutTitle: string;
  aboutText: string;
  gallery: string;
  mapUrl: string;
  testimonials: string;
  cta: string;
  footer: string;
  active: boolean;
}

function defaultForm(): EditorForm {
  return {
    id: "",
    logoUrl: "",
    companyName: "",
    appName: "",
    address: "",
    contact: "",
    email: "",
    portalPassword: "",
    tempPassword: "",
    sendWelcome: true,
    proprietor: "",
    gst: "",
    bankName: "",
    bankBranch: "",
    account: "",
    ifsc: "",
    prefix: "JVUPVC",
    trialDays: "0",
    primaryColor: "#6366f1",
    accentColor: "#ec4899",
    heroTitle: "",
    heroSubtitle: "",
    heroImage: "",
    services: "",
    aboutTitle: "",
    aboutText: "",
    gallery: "",
    mapUrl: "",
    testimonials: "",
    cta: "",
    footer: "",
    active: true,
  };
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function apiGet(path: string, params?: Record<string, string>) {
  const url = new URL(API + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const r = await fetch(url, { headers });
  if (!r.ok) {
    let msg: string = r.statusText;
    try {
      const e = await r.json();
      msg = e.message || msg;
    } catch {
      // keep statusText
    }
    throw new Error(msg);
  }
  return r.json();
}

function resizeImage(file: File, MAX: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const scale = MAX / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
            return;
          }
          const resizedFile = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", {
            type: "image/png",
          });
          URL.revokeObjectURL(objectUrl);
          resolve(resizedFile);
        },
        "image/png",
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image"));
    };
    img.src = objectUrl;
  });
}

function readFileAsBase64(file: File): Promise<FilePayload> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      resolve({ data: base64, mime: file.type });
    };
    reader.readAsDataURL(file);
  });
}

function ClientLinks({ id, config }: { id: string; config?: Record<string, any> | null }) {
  const cfg = config || {};
  const marketSlug = slugify(cfg.companyName) || slugify(id);
  const appSlug = slugify(cfg.appName) || slugify(id);
  const marketUrl = "https://app.vitharn.com/upvc/" + marketSlug;
  const appUrl = "https://app.vitharn.com/upvc/" + appSlug;
  return (
    <div className="client-links">
      <a href={marketUrl} target="_blank" rel="noreferrer">
        Market Page
      </a>
      <a href={appUrl} target="_blank" rel="noreferrer">
        App
      </a>
    </div>
  );
}

export default function PlatformAdmin() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [currentPasswordHash, setCurrentPasswordHash] = useState("");
  const [isCustomer, setIsCustomer] = useState(false);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [form, setForm] = useState<EditorForm>(defaultForm());
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null);
  const [logoPreviewSrc, setLogoPreviewSrc] = useState<string | null>(null);
  const [heroPreviewSrc, setHeroPreviewSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const logoFileRef = useRef<HTMLInputElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: string) {
    setToast({ msg, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError(null);
    try {
      const role = localStorage.getItem("portal_role");
      const clientId = localStorage.getItem("portal_client_id");
      let data;
      if (role === "customer" && clientId) {
        data = await apiGet("/client_public", { id: "eq." + clientId, select: "*" });
      } else {
        data = await apiGet("/client_public", { order: "created_at.desc", select: "*" });
      }
      setClients(data || []);
    } catch (e: any) {
      setClientsError(e?.message || String(e));
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = localStorage.getItem("portal_session");
        const role = localStorage.getItem("portal_role");
        if (session !== "active" || (role !== "admin" && role !== "customer")) {
          router.push("/login");
          return;
        }
        const email = localStorage.getItem("portal_email");
        if (!email) {
          router.push("/login");
          return;
        }
        if (role === "customer") {
          if (cancelled) return;
          setCurrentUser(email);
          setCurrentPasswordHash("");
          setIsCustomer(true);
          setReady(true);
          loadClients();
          return;
        }
        const storedHash = localStorage.getItem("portal_auth_hash") || "";
        if (!storedHash) {
          router.push("/login");
          return;
        }
        const authRes = await fetch("/api/portal_auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "session", email, hash: storedHash }),
        });
        const authData = await authRes.json();
        if (!authRes.ok || authData.role !== "admin") {
          router.push("/login");
          return;
        }
        if (cancelled) return;
        setCurrentUser(authData.email);
        setCurrentPasswordHash(authData.password_hash || storedHash);
        setReady(true);
        loadClients();
      } catch (e) {
        console.warn("Auto-login failed:", e);
        router.push("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, loadClients]);

  function handleLogout() {
    localStorage.removeItem("portal_session");
    localStorage.removeItem("portal_email");
    localStorage.removeItem("portal_role");
    localStorage.removeItem("portal_client_id");
    localStorage.removeItem("portal_auth");
    router.push("/login");
  }

  function formFromClient(client: ClientRow | null): EditorForm {
    const config = client ? client.config || {} : {};
    const trialDate = client && client.trial_expires_at ? new Date(client.trial_expires_at) : null;
    const daysRemaining = trialDate ? Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    return {
      id: client ? client.id : "",
      logoUrl: config.logoUrl || "",
      companyName: config.companyName || "",
      appName: config.appName || "",
      address: config.companyAddress || "",
      contact: config.companyContact || "",
      email: config.companyEmail || "",
      portalPassword: "",
      tempPassword: "",
      sendWelcome: true,
      proprietor: config.companyProprietor || "",
      gst: config.gstNumber || "",
      bankName: config.bankName || "",
      bankBranch: config.bankBranch || "",
      account: config.bankAccountNo || "",
      ifsc: config.bankIfsc || "",
      prefix: config.quotePrefix || "JVUPVC",
      trialDays: String(daysRemaining > 0 ? daysRemaining : 0),
      primaryColor: config.primaryColor
        ? "#" + config.primaryColor.toString(16).padStart(8, "0").slice(2)
        : "#6366f1",
      accentColor: config.accentColor
        ? "#" + config.accentColor.toString(16).padStart(8, "0").slice(2)
        : "#ec4899",
      heroTitle: config.landingHeroTitle || "",
      heroSubtitle: config.landingHeroSubtitle || "",
      heroImage: config.landingHeroImage || "",
      services: (config.landingServices || []).join(", "),
      aboutTitle: config.landingAboutTitle || "",
      aboutText: config.landingAboutText || "",
      gallery: (config.landingGallery || []).join(", "),
      mapUrl: config.landingMapUrl || "",
      testimonials: config.landingTestimonials ? JSON.stringify(config.landingTestimonials) : "",
      cta: config.landingCTA || "",
      footer: config.landingFooter || "",
      active: client ? !!client.is_active : true,
    };
  }

  function openEditor(client: ClientRow | null) {
    setEditorOpen(true);
    setEditingClient(client);
    setSelectedLogoFile(null);
    const config = client ? client.config || {} : {};
    setForm(formFromClient(client));
    setLogoPreviewSrc(config.logoUrl || null);
    setHeroPreviewSrc(config.landingHeroImage || null);
    if (logoFileRef.current) logoFileRef.current.value = "";
    if (heroFileRef.current) heroFileRef.current.value = "";
  }

  function closeEditor() {
    setEditorOpen(false);
  }

  function setF(key: keyof EditorForm, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleLogoFileSelected(file: File) {
    const resized = await resizeImage(file, 512);
    setSelectedLogoFile(resized);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreviewSrc(e.target?.result as string);
      setF("logoUrl", "");
    };
    reader.readAsDataURL(resized);
  }

  function onLogoUrlChange(value: string) {
    const url = value.trim();
    setF("logoUrl", value);
    if (url) {
      setLogoPreviewSrc(url);
      if (logoFileRef.current) logoFileRef.current.value = "";
      setSelectedLogoFile(null);
    } else {
      setLogoPreviewSrc(null);
    }
  }

  async function handleHeroFileSelected(file: File) {
    const resized = await resizeImage(file, 1024);
    setSelectedHeroFile(resized);
    const reader = new FileReader();
    reader.onload = (e) => {
      setHeroPreviewSrc(e.target?.result as string);
      setF("heroImage", "");
    };
    reader.readAsDataURL(resized);
  }

  function onHeroImageUrlChange(value: string) {
    const url = value.trim();
    setF("heroImage", value);
    if (url) {
      setHeroPreviewSrc(url);
      if (heroFileRef.current) heroFileRef.current.value = "";
      setSelectedHeroFile(null);
    } else {
      setHeroPreviewSrc(null);
    }
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = !!editingClient;
    const id = form.id.trim();
    if (!id) {
      showToast("Client ID is required", "error");
      return;
    }

    const logoUrl = form.logoUrl.trim() || null;
    let logoFile: FilePayload | null = null;
    if (selectedLogoFile) {
      logoFile = await readFileAsBase64(selectedLogoFile);
    }

    let heroFile: FilePayload | null = null;
    if (selectedHeroFile) {
      heroFile = await readFileAsBase64(selectedHeroFile);
    }

    const config: Record<string, any> = {
      logoUrl,
      appName: form.appName.trim(),
      companyName: form.companyName.trim(),
      companyAddress: form.address.trim(),
      companyContact: form.contact.trim(),
      companyEmail: form.email.trim(),
      companyProprietor: form.proprietor.trim(),
      gstNumber: form.gst.trim(),
      bankName: form.bankName.trim(),
      bankBranch: form.bankBranch.trim(),
      bankAccountNo: form.account.trim(),
      bankIfsc: form.ifsc.trim(),
      quotePrefix: form.prefix.trim(),
      defaultGstPercentage: 18.0,
      termsAndConditions: ["Term 1", "Term 2", "Term 3"],
      primaryColor: parseInt("ff" + form.primaryColor.slice(1), 16),
      accentColor: parseInt("ff" + form.accentColor.slice(1), 16),
      adminEmails: [form.email.trim()],
      landingHeroTitle: form.heroTitle.trim(),
      landingHeroSubtitle: form.heroSubtitle.trim(),
      landingHeroImage: form.heroImage.trim() || null,
      landingServices: form.services.split(",").map((s) => s.trim()).filter(Boolean),
      landingAboutTitle: form.aboutTitle.trim(),
      landingAboutText: form.aboutText.trim(),
      landingGallery: form.gallery.split(",").map((s) => s.trim()).filter(Boolean),
      landingMapUrl: form.mapUrl.trim() || null,
      landingTestimonials: (() => {
        try {
          return JSON.parse(form.testimonials) || [];
        } catch {
          return [];
        }
      })(),
      landingCTA: form.cta.trim(),
      landingFooter: form.footer.trim(),
    };

    const portalPassword = form.portalPassword;
    let tempPassword = form.tempPassword;
    if (!tempPassword && portalPassword) tempPassword = portalPassword;

    const loginPassword = portalPassword || (!isEdit ? tempPassword : "");
    let portalPasswordHash: string | null = null;
    if (loginPassword) {
      portalPasswordHash = await hashPassword(loginPassword);
    }

    const sendWelcome = form.sendWelcome && !!tempPassword;
    const trialDays = parseInt(form.trialDays) || 0;
    const trialExpiresAt = trialDays > 0 ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
    const isActive = form.active;

    setBusy("Saving...");

    try {
      const body: Record<string, any> = {
        admin_email: currentUser,
        admin_password_hash: currentPasswordHash,
        id,
        config,
        is_active: isActive,
      };
      if (trialExpiresAt) body.trial_expires_at = trialExpiresAt;
      if (portalPasswordHash) body.portal_password_hash = portalPasswordHash;
      if (logoFile) body.logoFile = logoFile;
      if (heroFile) body.heroFile = heroFile;
      if (sendWelcome) body.send_welcome = true;
      if (sendWelcome && tempPassword) body.temp_password = tempPassword;

      const r = await fetch("/api/save_client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Save failed");

      if (result.logoUrl) {
        config.logoUrl = result.logoUrl;
      }

      showToast("Client saved successfully!", "success");
      closeEditor();
      loadClients();

      if (result.welcomeEmail && result.welcomeEmail.error) {
        showToast("Client saved, but welcome email failed: " + result.welcomeEmail.error, "error");
      } else if (result.welcomeEmail && result.welcomeEmail.sent) {
        showToast("Welcome email sent to the client!", "success");
      }
    } catch (err: any) {
      showToast("Error: " + (err?.message || String(err)), "error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteClient() {
    const id = editingClient ? editingClient.id : form.id;
    if (!id) return;
    if (!window.confirm(`Delete client "${id}"? This cannot be undone.`)) return;

    setBusy("Deleting...");

    try {
      const r = await fetch("/api/save_client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_email: currentUser,
          admin_password_hash: currentPasswordHash,
          id,
          config: {},
          is_active: false,
          _delete: true,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Delete failed");
      showToast("Client deactivated", "success");
      closeEditor();
      loadClients();
    } catch (err: any) {
      showToast("Error: " + (err?.message || String(err)), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return <div id="loginView" className="hidden"></div>;
  }

  return (
    <>
      {toast && (
        <div id="toast" className={`toast ${toast.type}`} style={{ display: "block" }}>
          {toast.msg}
        </div>
      )}

      <div id="dashboardView">
        <div className="header">
          <h2>Admin Panel</h2>
          <div>
            <span id="adminEmail" style={{ color: "#64748b", fontSize: 14, marginRight: 16 }}>
              {currentUser}
              {isCustomer ? " (customer)" : ""}
            </span>
            <Link
              href="/dashboard"
              className="secondary"
              style={{
                textDecoration: "none",
                padding: "12px 24px",
                background: "#e2e8f0",
                color: "#475569",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Quotation Logs
            </Link>
            <button className="secondary" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className="admin-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 20 }}>Clients</h2>
            {!isCustomer && <button onClick={() => openEditor(null)}>+ Add Client</button>}
          </div>
          <div id="clientsList" className="card">
            {clientsLoading && <p style={{ color: "#94a3b8" }}>Loading...</p>}
            {!clientsLoading && clientsError && <p style={{ color: "#ef4444" }}>Error: {clientsError}</p>}
            {!clientsLoading && !clientsError && clients.length === 0 && (
              <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>
                No clients yet. Click &quot;+ Add Client&quot; to create one.
              </p>
            )}
            {clients.map((client) => {
              const config = client.config || {};
              const isActive = client.is_active;
              const trialDate = client.trial_expires_at ? new Date(client.trial_expires_at) : null;
              const trialExpired = !!trialDate && new Date() > trialDate;
              return (
                <div key={client.id} className="client-item" onClick={() => openEditor(client)}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {config.logoUrl && (
                        <img
                          src={config.logoUrl}
                          alt=""
                          style={{ height: 28, width: 28, borderRadius: 6, objectFit: "cover" }}
                        />
                      )}
                      <strong style={{ fontSize: 15 }}>{config.companyName || client.id}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      {client.id}
                      {config.appName ? " — " + config.appName : ""}
                    </div>
                    <ClientLinks id={client.id} config={client.config} />
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className={`badge ${isActive ? "active" : "inactive"}`}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                      {trialExpired && <span className="badge trial">Trial Expired</span>}
                    </div>
                  </div>
                  <span style={{ color: "#6366f1", fontSize: 13 }}>Edit →</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editorOpen && (
        <div
          className="modal"
          style={{ display: "block" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor();
          }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingClient ? "Edit Client" : "New Client"}</h3>
              <span className="close" onClick={closeEditor}>
                &times;
              </span>
            </div>
            <form onSubmit={saveClient}>
              <label>Client ID</label>
              <input
                type="text"
                value={form.id}
                disabled={!!editingClient}
                placeholder="e.g. client_b"
                onChange={(e) => setF("id", e.target.value)}
              />

              {editingClient && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <label style={{ marginBottom: 8 }}>Client Links</label>
                  <ClientLinks id={editingClient.id} config={editingClient.config} />
                </div>
              )}

              <label>Logo</label>
              <div className="upload-area">
                <input
                  type="file"
                  accept="image/*"
                  ref={logoFileRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoFileSelected(f);
                  }}
                />
                {logoPreviewSrc && <img className="logo-preview" src={logoPreviewSrc} alt="" />}
              </div>
              <label>Or Logo URL</label>
              <input
                type="text"
                value={form.logoUrl}
                placeholder="https://example.com/logo.png"
                onChange={(e) => onLogoUrlChange(e.target.value)}
              />

              <div className="grid-2">
                <div>
                  <label>Company Name</label>
                  <input type="text" value={form.companyName} onChange={(e) => setF("companyName", e.target.value)} />
                </div>
                <div>
                  <label>App Name</label>
                  <input type="text" value={form.appName} onChange={(e) => setF("appName", e.target.value)} />
                </div>
              </div>
              <label>Address</label>
              <input type="text" value={form.address} onChange={(e) => setF("address", e.target.value)} />
              <div className="grid-2">
                <div>
                  <label>Contact</label>
                  <input type="text" value={form.contact} onChange={(e) => setF("contact", e.target.value)} />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} />
                </div>
              </div>
              <label>Portal Password (for customer login)</label>
              <input
                type="password"
                value={form.portalPassword}
                placeholder="Leave blank to keep current"
                autoComplete="new-password"
                onChange={(e) => setF("portalPassword", e.target.value)}
              />
              <label>New Client Temporary Password</label>
              <input
                type="password"
                value={form.tempPassword}
                placeholder="Temporary password for welcome email (new clients)"
                autoComplete="new-password"
                onChange={(e) => setF("tempPassword", e.target.value)}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.sendWelcome}
                  style={{ width: "auto", margin: 0 }}
                  onChange={(e) => setF("sendWelcome", e.target.checked)}
                />
                Send welcome email with login details &amp; links
              </label>
              <div className="grid-2">
                <div>
                  <label>Proprietor</label>
                  <input type="text" value={form.proprietor} onChange={(e) => setF("proprietor", e.target.value)} />
                </div>
                <div>
                  <label>GST Number</label>
                  <input type="text" value={form.gst} onChange={(e) => setF("gst", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Bank Name</label>
                  <input type="text" value={form.bankName} onChange={(e) => setF("bankName", e.target.value)} />
                </div>
                <div>
                  <label>Branch</label>
                  <input type="text" value={form.bankBranch} onChange={(e) => setF("bankBranch", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Account No</label>
                  <input type="text" value={form.account} onChange={(e) => setF("account", e.target.value)} />
                </div>
                <div>
                  <label>IFSC Code</label>
                  <input type="text" value={form.ifsc} onChange={(e) => setF("ifsc", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Quote Prefix</label>
                  <input type="text" value={form.prefix} onChange={(e) => setF("prefix", e.target.value)} />
                </div>
                <div>
                  <label>Trial Days (0 = no trial)</label>
                  <input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) => setF("trialDays", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Primary Color</label>
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setF("primaryColor", e.target.value)}
                  />
                </div>
                <div>
                  <label>Accent Color</label>
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) => setF("accentColor", e.target.value)}
                  />
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "20px 0" }} />
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>
                Business Website (for the shop owner&apos;s customers)
              </h3>

              <label>Business Name</label>
              <input
                type="text"
                value={form.heroTitle}
                placeholder="e.g. Venkateshwara UPVC Windows & Doors"
                onChange={(e) => setF("heroTitle", e.target.value)}
              />
              <label>Tagline</label>
              <input
                type="text"
                value={form.heroSubtitle}
                placeholder="e.g. Quality UPVC solutions for your home"
                onChange={(e) => setF("heroSubtitle", e.target.value)}
              />
              <label>Hero Banner Image URL</label>
              <input
                type="text"
                value={form.heroImage}
                placeholder="https://example.com/hero.jpg"
                onChange={(e) => onHeroImageUrlChange(e.target.value)}
              />
              <div className="upload-area">
                <input
                  type="file"
                  accept="image/*"
                  ref={heroFileRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleHeroFileSelected(f);
                  }}
                />
                {heroPreviewSrc && (
                  <img className="logo-preview" src={heroPreviewSrc} alt="" style={{ maxHeight: 120 }} />
                )}
              </div>

              <label>Services Offered (comma-separated)</label>
              <input
                type="text"
                value={form.services}
                placeholder="e.g. UPVC Windows, UPVC Doors, Glass Installation, Repairs"
                onChange={(e) => setF("services", e.target.value)}
              />

              <label>About Section Title</label>
              <input
                type="text"
                value={form.aboutTitle}
                placeholder="e.g. About Venkateshwara UPVC"
                onChange={(e) => setF("aboutTitle", e.target.value)}
              />
              <label>About Section Text</label>
              <textarea
                rows={3}
                value={form.aboutText}
                placeholder="Tell customers about your business..."
                onChange={(e) => setF("aboutText", e.target.value)}
              />

              <label>Portfolio Images (URLs, comma-separated)</label>
              <input
                type="text"
                value={form.gallery}
                placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                onChange={(e) => setF("gallery", e.target.value)}
              />

              <label>Google Maps Embed URL</label>
              <input
                type="text"
                value={form.mapUrl}
                placeholder="https://maps.google.com/maps?embed=..."
                onChange={(e) => setF("mapUrl", e.target.value)}
              />

              <label>Customer Reviews (JSON array)</label>
              <textarea
                rows={3}
                value={form.testimonials}
                placeholder={JSON.stringify([{ name: "Customer", text: "Great service!", role: "Homeowner" }])}
                onChange={(e) => setF("testimonials", e.target.value)}
              />

              <label>Login Button Text</label>
              <input
                type="text"
                value={form.cta}
                placeholder="e.g. Login"
                onChange={(e) => setF("cta", e.target.value)}
              />

              <label>Footer Text</label>
              <input
                type="text"
                value={form.footer}
                placeholder="e.g. Powered by Vitharn Technologies"
                onChange={(e) => setF("footer", e.target.value)}
              />
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
                <label style={{ margin: 0 }}>Active:</label>
                <input
                  type="checkbox"
                  checked={form.active}
                  style={{ width: "auto", margin: 0 }}
                  onChange={(e) => setF("active", e.target.checked)}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" disabled={!!busy}>
                  {busy || "Save"}
                </button>
                <button type="button" className="secondary" onClick={closeEditor}>
                  Cancel
                </button>
                {editingClient && !isCustomer && (
                  <button type="button" className="danger" onClick={deleteClient}>
                    Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
