"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import "./admin.css";

// Supabase project `gumpmnbjdtzajhysnnaz` (migrated 08-08-2026).
// This is the PUBLIC anon key — safe in client bundles; RLS is the boundary.
const API = "https://gumpmnbjdtzajhysnnaz.supabase.co/rest/v1";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bXBtbmJqZHR6YWpoeXNubmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNjI2NzgsImV4cCI6MjEwMTczODY3OH0.RbzuXFNDM0HXQhdL6Ex1q9s_t1SCejtKmBsYskBwUhs";
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
  invoiceTopLogoUrl: string;
  invoiceBackgroundLogoUrl: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
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
    invoiceTopLogoUrl: "",
    invoiceBackgroundLogoUrl: "",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
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

function signupStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "#f59e0b";
    case "submitted":
      return "#22c55e";
    case "approved":
      return "#3b82f6";
    case "rejected":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
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
  const marketUrl = window.location.origin + "/" + marketSlug;
  const appUrl = window.location.origin + "/upvc/" + appSlug;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState<EditorForm>(defaultForm());
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null);
  const [selectedInvoiceTopFile, setSelectedInvoiceTopFile] = useState<File | null>(null);
  const [selectedInvoiceBgFile, setSelectedInvoiceBgFile] = useState<File | null>(null);
  const [logoPreviewSrc, setLogoPreviewSrc] = useState<string | null>(null);
  const [heroPreviewSrc, setHeroPreviewSrc] = useState<string | null>(null);
  const [invoiceTopPreviewSrc, setInvoiceTopPreviewSrc] = useState<string | null>(null);
  const [invoiceBgPreviewSrc, setInvoiceBgPreviewSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [signupRequests, setSignupRequests] = useState<any[]>([]);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [composeMail, setComposeMail] = useState<{ req: any; to: string; subject: string; body: string } | null>(null);
  const [sendingMail, setSendingMail] = useState(false);
  const [signupView, setSignupView] = useState<"active" | "archived">("active");

  const logoFileRef = useRef<HTMLInputElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const invoiceTopFileRef = useRef<HTMLInputElement>(null);
  const invoiceBgFileRef = useRef<HTMLInputElement>(null);

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
        const authRes = await fetch("/api/portal_auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "session", email }),
        });
        const authData = await authRes.json();
        if (!authRes.ok || authData.role !== "admin") {
          router.push("/login");
          return;
        }
        if (cancelled) return;
        setCurrentUser(authData.email);
        setCurrentPasswordHash(authData.password_hash || "");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem("portal_role") !== "admin") return;
        const r = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "list" }),
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setSignupRequests(data || []);
      } catch (e) {
        console.warn("Failed to load signup requests:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      invoiceTopLogoUrl: config.invoiceTopLogoUrl || config.logoUrl || "",
      invoiceBackgroundLogoUrl: config.invoiceBackgroundLogoUrl || config.logoUrl || "",
      seoTitle: config.seoTitle || "",
      seoDescription: config.seoDescription || "",
      seoKeywords: config.seoKeywords || "",
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
    setSelectedHeroFile(null);
    setSelectedInvoiceTopFile(null);
    setSelectedInvoiceBgFile(null);
    setActiveTab(0);
    const config = client ? client.config || {} : {};
    setForm(formFromClient(client));
    setLogoPreviewSrc(config.logoUrl || null);
    setHeroPreviewSrc(config.landingHeroImage || null);
    setInvoiceTopPreviewSrc(config.invoiceTopLogoUrl || null);
    setInvoiceBgPreviewSrc(config.invoiceBackgroundLogoUrl || null);
    if (logoFileRef.current) logoFileRef.current.value = "";
    if (heroFileRef.current) heroFileRef.current.value = "";
    if (invoiceTopFileRef.current) invoiceTopFileRef.current.value = "";
    if (invoiceBgFileRef.current) invoiceBgFileRef.current.value = "";
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingClient(null);
  }

  function setF(key: keyof EditorForm, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function useSignupRequest(req: any) {
    const cfg = req.config || {};
    setShowSignupModal(false);
    openEditor(null);
    setF("companyName", cfg.companyName || "");
    setF("email", req.email || "");
    setF("contact", cfg.companyContact || req.phone || "");
    setF("address", cfg.companyAddress || "");
    setF("proprietor", cfg.companyProprietor || req.name || "");
    setF("gst", cfg.gstNumber || "");
    showToast("Loaded signup request into editor — set a temp password and save to create the account.", "success");
    setSignupRequests(null);
  }

  function openCompose(req: any) {
    const cfg = req.config || {};
    const company = cfg.companyName || req.name || "";
    setComposeMail({
      req,
      to: req.email || "",
      subject: "Your Vitharn UPVC account request",
      body:
        (company ? `Hi ${company},\n\n` : "Hi,\n\n") +
        "We received your UPVC business profile and our team is reviewing it. You will receive your login details by email once your account is approved.\n\n" +
        "If you have any questions, just reply to this email.\n\nThanks,\nVitharn UPVC Team",
    });
  }

  async function sendAdminMail() {
    if (!composeMail) return;
    setSendingMail(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "send",
          to: composeMail.to.trim(),
          subject: composeMail.subject.trim(),
          body: composeMail.body,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send email");
      showToast("Email sent to " + composeMail.to.trim(), "success");
      setComposeMail(null);
    } catch (e: any) {
      showToast("Failed to send email: " + e.message, "error");
    } finally {
      setSendingMail(false);
    }
  }

  async function archiveRequest(req: any) {
    const isRestore = !!req._restore;
    const newStatus = isRestore ? "pending" : "archived";
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "archive", id: req.id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed");
      setSignupRequests((prev: any[]) =>
        prev.map((r) => r.id === req.id ? { ...r, status: newStatus } : r)
      );
      showToast(isRestore ? "Restored to active requests" : "Archived — data is preserved", "success");
    } catch (e: any) {
      showToast("Failed: " + e.message, "error");
    }
  }

  async function deleteSignupRequest(req: any) {
    if (!window.confirm(`Permanently delete request from ${req.email}? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", id: req.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to delete");
      setSignupRequests((prev: any[]) => prev.filter((r) => r.id !== req.id));
      showToast("Permanently deleted", "success");
    } catch (e: any) {
      showToast("Failed to delete: " + e.message, "error");
    }
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

  async function handleInvoiceTopFileSelected(file: File) {
    const resized = await resizeImage(file, 512);
    setSelectedInvoiceTopFile(resized);
    const reader = new FileReader();
    reader.onload = (e) => {
      setInvoiceTopPreviewSrc(e.target?.result as string);
      setF("invoiceTopLogoUrl", "");
    };
    reader.readAsDataURL(resized);
  }

  function onInvoiceTopUrlChange(value: string) {
    const url = value.trim();
    setF("invoiceTopLogoUrl", value);
    if (url) {
      setInvoiceTopPreviewSrc(url);
      if (invoiceTopFileRef.current) invoiceTopFileRef.current.value = "";
      setSelectedInvoiceTopFile(null);
    } else {
      setInvoiceTopPreviewSrc(null);
    }
  }

  async function handleInvoiceBgFileSelected(file: File) {
    const resized = await resizeImage(file, 512);
    setSelectedInvoiceBgFile(resized);
    const reader = new FileReader();
    reader.onload = (e) => {
      setInvoiceBgPreviewSrc(e.target?.result as string);
      setF("invoiceBackgroundLogoUrl", "");
    };
    reader.readAsDataURL(resized);
  }

  function onInvoiceBgUrlChange(value: string) {
    const url = value.trim();
    setF("invoiceBackgroundLogoUrl", value);
    if (url) {
      setInvoiceBgPreviewSrc(url);
      if (invoiceBgFileRef.current) invoiceBgFileRef.current.value = "";
      setSelectedInvoiceBgFile(null);
    } else {
      setInvoiceBgPreviewSrc(null);
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

    const emailStr = form.email.trim();
    if (emailStr) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailStr)) {
        showToast("Please enter a valid email address", "error");
        return;
      }
    }

    const contactStr = form.contact.trim();
    if (contactStr && contactStr.length !== 10) {
      showToast("Contact number must be exactly 10 digits", "error");
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

    let invoiceTopFile: FilePayload | null = null;
    if (selectedInvoiceTopFile) {
      invoiceTopFile = await readFileAsBase64(selectedInvoiceTopFile);
    }

    let invoiceBgFile: FilePayload | null = null;
    if (selectedInvoiceBgFile) {
      invoiceBgFile = await readFileAsBase64(selectedInvoiceBgFile);
    }

    const config: Record<string, any> = {
      logoUrl,
      invoiceTopLogoUrl: form.invoiceTopLogoUrl.trim() || null,
      invoiceBackgroundLogoUrl: form.invoiceBackgroundLogoUrl.trim() || null,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      seoKeywords: form.seoKeywords.trim() || null,
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
      if (invoiceTopFile) body.invoiceTopLogoFile = invoiceTopFile;
      if (invoiceBgFile) body.invoiceBgLogoFile = invoiceBgFile;
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

  async function deleteClient(confirmedId?: string) {
    const id = confirmedId || (editingClient ? editingClient.id : form.id);
    if (!id) return;
    
    if (typeof confirmedId !== 'string') {
      setConfirmDialog({ id });
      return;
    }

    setConfirmDialog(null);

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
      showToast("Client deleted", "success");
      closeEditor();
      loadClients();
    } catch (err: any) {
      showToast("Error: " + (err?.message || String(err)), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return <div className="admin-loading">Loading admin panel...</div>;
  }

  const filteredClients = clients.filter((c) => {
    const statusOk =
      statusFilter === "all" || (statusFilter === "active") === !!c.is_active;
    if (!statusOk) return false;
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const name = (c.config?.companyName || c.id).toLowerCase();
    return name.includes(q) || c.id.toLowerCase().includes(q);
  });

  const activeCount = clients.filter((c) => c.is_active).length;
  const inactiveCount = clients.filter((c) => !c.is_active).length;

  const TABS = ["Company Info", "Auth & Security", "Billing", "Market Website", "System"];

  const selectedClientConfig = editingClient?.config || {};

  return (
    <>
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}

      <div className="admin-shell">
        {/* ─── SIDEBAR ─────────────────────────────────── */}
        <aside className="admin-sidebar">
          <div className="admin-sidebar-header">
            <div className="admin-brand">
              <img 
                src="/logo.png" 
                alt="Vitharn Logo" 
                className="admin-brand-icon" 
                style={{ objectFit: 'contain', background: 'transparent', boxShadow: 'none' }} 
              />
              <div className="admin-brand-text">
                <h2>vitharn upvc</h2>
                <span>Admin Panel</span>
              </div>
            </div>
            <div className="admin-search">
              <span className="admin-search-icon">⌕</span>
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="admin-status-filter">
              {(["active", "inactive", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={statusFilter === f ? "active" : ""}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === "active" ? "Active" : f === "inactive" ? "Inactive" : "All"}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-client-list">
            {clientsLoading && <div className="empty-list">Loading...</div>}
            {!clientsLoading && clientsError && <div className="empty-list" style={{ color: "#ef4444" }}>{clientsError}</div>}
            {!clientsLoading && !clientsError && filteredClients.length === 0 && (
              <div className="empty-list">No clients found.</div>
            )}
            {filteredClients.length > 0 && (
              <div className="client-list-section-label">
                {statusFilter === "active" ? "Active" : statusFilter === "inactive" ? "Inactive" : "All"} Clients ({filteredClients.length})
              </div>
            )}
            {filteredClients.map((client) => {
              const config = client.config || {};
              const isActive = client.is_active;
              const trialDate = client.trial_expires_at ? new Date(client.trial_expires_at) : null;
              const trialExpired = !!trialDate && new Date() > trialDate;
              const isSelected = editingClient?.id === client.id;
              const initials = (config.companyName || client.id).slice(0, 2).toUpperCase();
              return (
                <div
                  key={client.id}
                  className={`client-card${isSelected ? " active" : ""}`}
                  onClick={() => openEditor(client)}
                >
                  <div className="client-avatar">
                    {config.logoUrl
                      ? <img src={config.logoUrl} alt="" />
                      : initials
                    }
                  </div>
                  <div className="client-card-info">
                    <div className="client-card-name">{config.companyName || client.id}</div>
                    <div className="client-card-id">{client.id}</div>
                  </div>
                  <div className={`client-status-dot ${isActive ? (trialExpired ? "trial" : "active") : "inactive"}`} />
                </div>
              );
            })}
          </div>

          <div className="admin-sidebar-footer">
            {!isCustomer && (
              <>
                <button className="add-client-btn" onClick={() => openEditor(null)}>
                  <span>+</span> New Client
                </button>
                <div className="sidebar-action-row">
                  <button
                    className="sidebar-action-btn"
                    onClick={() => setShowSignupModal(true)}
                  >
                    Requests
                    {(signupRequests?.length ?? 0) > 0 && (
                      <span className="sidebar-badge">{signupRequests.length}</span>
                    )}
                  </button>
                  <button
                    className="sidebar-action-btn"
                    onClick={() => setComposeMail({ req: null, to: "", subject: "", body: "" })}
                  >
                    ✉ Compose
                  </button>
                </div>
              </>
            )}
            <div className="sidebar-meta">
              <span className="sidebar-user">{currentUser}{isCustomer ? " (customer)" : ""}</span>
              <button className="sidebar-logout" onClick={handleLogout}>Sign out</button>
            </div>
          </div>
        </aside>

        {/* ─── MAIN PANEL ──────────────────────────────── */}
        <main className="admin-main">
          {!editorOpen ? (
            <div className="admin-welcome">
              <div className="admin-welcome-icon">🏢</div>
              <h2>Welcome back!</h2>
              <p>Select a client from the sidebar to edit their configuration, or create a new client.</p>
              <div className="admin-stats">
                <div className="admin-stat-card">
                  <div className="num">{clients.length}</div>
                  <div className="lbl">Total Clients</div>
                </div>
                <div className="admin-stat-card">
                  <div className="num" style={{ color: "#22c55e" }}>{activeCount}</div>
                  <div className="lbl">Active</div>
                </div>
                <div className="admin-stat-card">
                  <div className="num" style={{ color: "#ef4444" }}>{inactiveCount}</div>
                  <div className="lbl">Inactive</div>
                </div>
              </div>
            </div>
          ) : (
            <form className="admin-editor" onSubmit={saveClient}>
              {/* Editor Header */}
              <div className="admin-editor-header">
                <div className="editor-client-info">
                  <div className="editor-client-logo">
                    {logoPreviewSrc
                      ? <img src={logoPreviewSrc} alt="" />
                      : (form.companyName || editingClient?.id || "N").slice(0, 1).toUpperCase()
                    }
                  </div>
                  <div className="editor-client-meta">
                    <h2>{form.companyName || (editingClient ? editingClient.id : "New Client")}</h2>
                    <div className="editor-client-desc">
                      {editingClient ? (
                        <>
                          {editingClient.id} &nbsp;·&nbsp;
                          <ClientLinks id={editingClient.id} config={editingClient.config} />
                        </>
                      ) : "Fill in the details below"}
                    </div>
                  </div>
                  <div className="editor-client-actions">
                    <span className={`badge ${form.active ? "active" : "inactive"}`}>
                      {form.active ? "Active" : "Inactive"}
                    </span>
                    <button type="button" className="btn-secondary" onClick={closeEditor} style={{ padding: "8px 14px", fontSize: 13 }}>✕ Close</button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="admin-tabs">
                  {TABS.map((tab, i) => (
                    <button
                      key={tab}
                      type="button"
                      className={`admin-tab${activeTab === i ? " active" : ""}`}
                      onClick={() => setActiveTab(i)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Bodies */}
              <div className="admin-editor-body">

                {/* ── TAB 0: Company Info ── */}
                {activeTab === 0 && (
                  <>
                    <div className="form-section">
                      <div className="form-section-title">Identity</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Client ID {editingClient && <span style={{ color: "#94a3b8", fontWeight: 400 }}>(cannot be changed)</span>}</label>
                        <input
                          type="text"
                          value={form.id}
                          disabled={!!editingClient}
                          placeholder="e.g. venkateshwara"
                          onChange={(e) => setF("id", e.target.value)}
                        />
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Company Name</label>
                          <input type="text" value={form.companyName} onChange={(e) => setF("companyName", e.target.value)} placeholder="e.g. Venkateshwara UPVC" />
                        </div>
                        <div className="form-group">
                          <label>App Name</label>
                          <input type="text" value={form.appName} onChange={(e) => setF("appName", e.target.value)} placeholder="e.g. Venkateshwara App" />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Address</label>
                        <input type="text" value={form.address} onChange={(e) => setF("address", e.target.value)} placeholder="Full business address" />
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Contact Number</label>
                          <input type="text" value={form.contact} onChange={(e) => setF("contact", e.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} placeholder="9876543210" />
                        </div>
                        <div className="form-group">
                          <label>Email Address</label>
                          <input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="owner@example.com" />
                        </div>
                      </div>
                    </div>

                    <div className="form-section">
                      <div className="form-section-title">Branding</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Company Logo</label>
                        <div className="upload-row">
                          <label className="upload-btn-label">
                            <span>📁</span> Upload Logo
                            <input
                              type="file"
                              accept="image/*"
                              ref={logoFileRef}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleLogoFileSelected(f);
                              }}
                            />
                          </label>
                          {logoPreviewSrc && <img className="upload-preview" src={logoPreviewSrc} alt="" />}
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Or paste Logo URL</label>
                        <input type="url" value={form.logoUrl} placeholder="https://example.com/logo.png" onChange={(e) => onLogoUrlChange(e.target.value)} />
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Primary Color</label>
                          <input type="color" value={form.primaryColor} onChange={(e) => setF("primaryColor", e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Accent Color</label>
                          <input type="color" value={form.accentColor} onChange={(e) => setF("accentColor", e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="form-section">
                      <div className="form-section-title">PDF / Invoice Branding</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Invoice Top Logo</label>
                        <div className="upload-row">
                          <label className="upload-btn-label">
                            <span>📁</span> Upload Top Logo
                            <input
                              type="file"
                              accept="image/*"
                              ref={invoiceTopFileRef}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleInvoiceTopFileSelected(f);
                              }}
                            />
                          </label>
                          {invoiceTopPreviewSrc && <img className="upload-preview" src={invoiceTopPreviewSrc} alt="" />}
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Or paste Invoice Top Logo URL</label>
                        <input type="url" value={form.invoiceTopLogoUrl} placeholder="https://example.com/invoice-top-logo.png" onChange={(e) => onInvoiceTopUrlChange(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Invoice Background Watermark Logo</label>
                        <div className="upload-row">
                          <label className="upload-btn-label">
                            <span>📁</span> Upload Background Logo
                            <input
                              type="file"
                              accept="image/*"
                              ref={invoiceBgFileRef}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleInvoiceBgFileSelected(f);
                              }}
                            />
                          </label>
                          {invoiceBgPreviewSrc && <img className="upload-preview" src={invoiceBgPreviewSrc} alt="" />}
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Or paste Invoice Background Logo URL</label>
                        <input type="url" value={form.invoiceBackgroundLogoUrl} placeholder="https://example.com/invoice-bg-logo.png" onChange={(e) => onInvoiceBgUrlChange(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                {/* ── TAB 1: Auth & Security ── */}
                {activeTab === 1 && (
                  <>
                    <div className="form-section">
                      <div className="form-section-title">Portal Access</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Portal Password <span style={{ color: "#94a3b8", fontWeight: 400 }}>(leave blank to keep current)</span></label>
                        <input
                          type="password"
                          value={form.portalPassword}
                          placeholder="Set a new password…"
                          autoComplete="new-password"
                          onChange={(e) => setF("portalPassword", e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Temporary Password for Welcome Email</label>
                        <input
                          type="password"
                          value={form.tempPassword}
                          placeholder="One-time password shown in welcome email"
                          autoComplete="new-password"
                          onChange={(e) => setF("tempPassword", e.target.value)}
                        />
                      </div>
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={form.sendWelcome}
                          onChange={(e) => setF("sendWelcome", e.target.checked)}
                        />
                        Send welcome email with login details &amp; portal links
                      </label>
                    </div>
                  </>
                )}

                {/* ── TAB 2: Billing ── */}
                {activeTab === 2 && (
                  <>
                    <div className="form-section">
                      <div className="form-section-title">Business Details</div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Proprietor Name</label>
                          <input type="text" value={form.proprietor} onChange={(e) => setF("proprietor", e.target.value)} placeholder="Owner full name" />
                        </div>
                        <div className="form-group">
                          <label>GST Number</label>
                          <input type="text" value={form.gst} onChange={(e) => setF("gst", e.target.value)} placeholder="36XXXXX0000X0XX" />
                        </div>
                      </div>
                    </div>
                    <div className="form-section">
                      <div className="form-section-title">Bank Details</div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Bank Name</label>
                          <input type="text" value={form.bankName} onChange={(e) => setF("bankName", e.target.value)} placeholder="e.g. Union Bank" />
                        </div>
                        <div className="form-group">
                          <label>Branch</label>
                          <input type="text" value={form.bankBranch} onChange={(e) => setF("bankBranch", e.target.value)} placeholder="e.g. Hastinapuram" />
                        </div>
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Account Number</label>
                          <input type="text" value={form.account} onChange={(e) => setF("account", e.target.value)} placeholder="178511100000061" />
                        </div>
                        <div className="form-group">
                          <label>IFSC Code</label>
                          <input type="text" value={form.ifsc} onChange={(e) => setF("ifsc", e.target.value)} placeholder="UBIN0817856" />
                        </div>
                      </div>
                    </div>
                    <div className="form-section">
                      <div className="form-section-title">Quotation Settings</div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Quote Prefix</label>
                          <input type="text" value={form.prefix} onChange={(e) => setF("prefix", e.target.value)} placeholder="e.g. JVUPVC" />
                        </div>
                        <div className="form-group">
                          <label>Trial Period (days, 0 = none)</label>
                          <input type="number" value={form.trialDays} onChange={(e) => setF("trialDays", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── TAB 3: Market Website ── */}
                {activeTab === 3 && (
                  <>
                    <div className="form-section">
                      <div className="form-section-title">Hero Section</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Business Name (Hero Title)</label>
                        <input type="text" value={form.heroTitle} placeholder="e.g. Venkateshwara UPVC Windows & Doors" onChange={(e) => setF("heroTitle", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Tagline (Hero Subtitle)</label>
                        <input type="text" value={form.heroSubtitle} placeholder="e.g. Quality UPVC solutions for your home" onChange={(e) => setF("heroSubtitle", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Hero Banner Image URL</label>
                        <input type="url" value={form.heroImage} placeholder="https://example.com/hero.jpg" onChange={(e) => onHeroImageUrlChange(e.target.value)} />
                      </div>
                      <label className="upload-btn-label" style={{ display: "inline-flex", marginBottom: 12 }}>
                        <span>📁</span> Upload Hero Image
                        <input
                          type="file"
                          accept="image/*"
                          ref={heroFileRef}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleHeroFileSelected(f);
                          }}
                        />
                      </label>
                      {heroPreviewSrc && <img className="upload-preview-hero" src={heroPreviewSrc} alt="" />}
                    </div>
                    <div className="form-section">
                      <div className="form-section-title">Content</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Services Offered <span style={{ color: "#94a3b8", fontWeight: 400 }}>(comma separated)</span></label>
                        <input type="text" value={form.services} placeholder="UPVC Windows, UPVC Doors, Glass Installation" onChange={(e) => setF("services", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>About Title</label>
                        <input type="text" value={form.aboutTitle} placeholder="e.g. About Venkateshwara UPVC" onChange={(e) => setF("aboutTitle", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>About Text</label>
                        <textarea value={form.aboutText} rows={4} placeholder="Tell customers about your business..." onChange={(e) => setF("aboutText", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Portfolio Images <span style={{ color: "#94a3b8", fontWeight: 400 }}>(comma-separated URLs)</span></label>
                        <textarea value={form.gallery} rows={3} placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg" onChange={(e) => setF("gallery", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Google Maps Embed URL</label>
                        <input type="url" value={form.mapUrl} placeholder="https://maps.google.com/maps?embed=..." onChange={(e) => setF("mapUrl", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Customer Reviews <span style={{ color: "#94a3b8", fontWeight: 400 }}>(JSON array)</span></label>
                        <textarea value={form.testimonials} rows={4} placeholder={JSON.stringify([{ name: "Customer", text: "Great service!", role: "Homeowner" }], null, 2)} onChange={(e) => setF("testimonials", e.target.value)} />
                      </div>
                    </div>
                    <div className="form-section">
                      <div className="form-section-title">Search Engine Optimization (SEO)</div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>SEO Meta Title</label>
                        <input type="text" value={form.seoTitle} placeholder="e.g. Best UPVC Windows in Hyderabad | Venkateshwara" onChange={(e) => setF("seoTitle", e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>SEO Meta Description</label>
                        <textarea value={form.seoDescription} rows={3} placeholder="A short description of your business to show on Google search results." onChange={(e) => setF("seoDescription", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>SEO Keywords <span style={{ color: "#94a3b8", fontWeight: 400 }}>(comma separated)</span></label>
                        <input type="text" value={form.seoKeywords} placeholder="upvc windows, upvc doors, interior" onChange={(e) => setF("seoKeywords", e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                {/* ── TAB 4: System ── */}
                {activeTab === 4 && (
                  <>
                    <div className="form-section">
                      <div className="form-section-title">Portal UI</div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Login Button Text</label>
                          <input type="text" value={form.cta} placeholder="e.g. Login" onChange={(e) => setF("cta", e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Footer Text</label>
                          <input type="text" value={form.footer} placeholder="e.g. Powered by Vitharn Technologies" onChange={(e) => setF("footer", e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div className="form-section">
                      <div className="form-section-title">Account Status</div>
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={form.active}
                          onChange={(e) => setF("active", e.target.checked)}
                        />
                        <span><strong>Account is Active</strong> — uncheck to disable this client's access</span>
                      </label>
                    </div>
                  </>
                )}

              </div>

              {/* Editor Footer */}
              <div className="editor-footer">
                <button type="submit" className="btn-primary" disabled={!!busy}>
                  {busy ? busy : "Save Changes"}
                </button>
                {editingClient && !isCustomer && (
                  <button type="button" className="btn-danger" onClick={() => deleteClient()}>
                    🗑 Delete Client
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button type="button" className="btn-secondary" onClick={closeEditor}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </main>
      </div>

      {confirmDialog && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <h3>Delete Client</h3>
            <p>Are you sure you want to delete client <strong>{confirmDialog.id}</strong>? This action cannot be undone.</p>
            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => deleteClient(confirmDialog.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showSignupModal && (
        <div className="modal" style={{ display: "flex" }}>
          <div className="modal-content" style={{ maxWidth: 600, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
            <h3>Signup Requests</h3>

            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              {(["active", "archived"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSignupView(v)}
                  style={{
                    padding: "6px 18px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: signupView === v ? "var(--primary)" : "var(--bg)",
                    borderColor: signupView === v ? "var(--primary)" : "var(--border)",
                    color: signupView === v ? "white" : "var(--text-mid)",
                  }}
                >
                  {v === "active" ? "Active" : "🗄 Archive"}
                </button>
              ))}
            </div>

            {(() => {
              const filtered = (signupRequests || []).filter((r: any) =>
                signupView === "archived" ? r.status === "archived" : r.status !== "archived"
              );
              if (filtered.length === 0) {
                return (
                  <p style={{ color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>
                    {signupView === "archived" ? "No archived requests." : "No active signup requests."}
                  </p>
                );
              }
              return filtered.map((req: any) => {
                const cfg = req.config || {};
                const statusColor = signupStatusColor(req.status);
                const isArchived = req.status === "archived";
                return (
                  <div key={req.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12, opacity: isArchived ? 0.8 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <strong>{req.email}</strong>
                        <div style={{ color: "#475569", fontSize: 13 }}>
                          {[req.name, req.phone].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span style={{ color: statusColor, fontWeight: 600, fontSize: 12, textTransform: "capitalize", flexShrink: 0 }}>
                        {req.status}
                      </span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                      Created {req.created_at ? new Date(req.created_at).toLocaleString() : ""}
                    </div>
                    {(cfg.companyName || cfg.city || cfg.gstNumber) && (
                      <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                        {[cfg.companyName, cfg.city, cfg.gstNumber ? "GST: " + cfg.gstNumber : ""].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="modal-actions" style={{ marginTop: 10, justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                      {!isArchived && (
                        <>
                          <button className="btn-secondary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => { setShowSignupModal(false); openCompose(req); }}>
                            Send Email
                          </button>
                          <button className="btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => useSignupRequest(req)}>
                            Use in Editor
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 13, padding: "8px 14px", marginLeft: "auto" }}
                            title="Move to archive — data is preserved"
                            onClick={() => archiveRequest(req)}
                          >
                            🗄 Archive
                          </button>
                        </>
                      )}
                      {isArchived && (
                        <button className="btn-secondary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => archiveRequest({ ...req, _restore: true })}>
                          ↩ Restore
                        </button>
                      )}
                      <button
                        className="btn-danger"
                        style={{ fontSize: 13, padding: "8px 14px" }}
                        title="Permanently delete — cannot be undone"
                        onClick={() => deleteSignupRequest(req)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                );
              });
            })()}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowSignupModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {composeMail && (
        <div className="modal" style={{ display: "flex" }}>
          <div className="modal-content" style={{ maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
            <h3>✉ Compose Email</h3>
            {composeMail.req && (
              <p className="modal-hint">
                Replying to <strong>{composeMail.req.email}</strong> — status: {composeMail.req.status}
              </p>
            )}
            <div className="modal-field">
              <label>To</label>
              <input
                type="email"
                value={composeMail.to}
                onChange={(e) => setComposeMail({ ...composeMail, to: e.target.value })}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="modal-field">
              <label>Subject</label>
              <input
                type="text"
                value={composeMail.subject}
                onChange={(e) => setComposeMail({ ...composeMail, subject: e.target.value })}
                placeholder="Email subject…"
              />
            </div>
            <div className="modal-field">
              <label>Message</label>
              <textarea
                value={composeMail.body}
                onChange={(e) => setComposeMail({ ...composeMail, body: e.target.value })}
                placeholder="Write your message here…"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setComposeMail(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={sendAdminMail}
                disabled={sendingMail || !composeMail.to.trim() || !composeMail.subject.trim() || !composeMail.body.trim()}
              >
                {sendingMail ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


