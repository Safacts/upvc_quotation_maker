"use client";

import { useEffect, useRef, useState } from "react";
import "./signup.css";

const EMPTY_CONFIG = {
  companyName: "",
  companyProprietor: "",
  companyContact: "",
  city: "",
  companyAddress: "",
  gstNumber: "",
  businessType: "",
  yearsInBusiness: "",
};

const BUSINESS_TYPES = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "dealer", label: "Dealer" },
  { value: "installer", label: "Installer" },
  { value: "manufacturer-and-dealer", label: "Manufacturer & Dealer" },
];

const YEARS_IN_BUSINESS = [
  { value: "<1 year", label: "<1 year" },
  { value: "1-3 years", label: "1-3 years" },
  { value: "3-10 years", label: "3-10 years" },
  { value: "10+ years", label: "10+ years" },
];

const SAVE_STATUS_TEXT: Record<string, string> = {
  saving: "Saving...",
  saved: "Saved just now",
  error: "Save failed — will retry",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({ ...EMPTY_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logoutLoading, setLogoutLoading] = useState(false);

  const dataRef = useRef({ name: "", phone: "", config: { ...EMPTY_CONFIG } });
  const saveTimerRef = useRef<any>(null);
  const dirtySinceRef = useRef<number | null>(null);

  async function fetchSignup() {
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "get" }),
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        window.location.href = "/upvc/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        window.location.href = "/upvc/login";
        return;
      }
      setEmail(String(data.email || ""));
      setStatus(String(data.status || "pending"));
      const cfg = { ...EMPTY_CONFIG, ...(data.config || {}) };
      setConfig(cfg);
      dataRef.current = {
        name: String(data.name ?? cfg.companyProprietor ?? ""),
        phone: String(data.phone ?? cfg.companyContact ?? ""),
        config: cfg,
      };
    } catch {
      window.location.href = "/upvc/login";
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSignup();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Zero-loss persistence: if the tab is closed, hidden, or navigated away
  // while edits are pending, push them with sendBeacon (survives unload).
  useEffect(() => {
    function flushNow() {
      if (dirtySinceRef.current === null) return;
      dirtySinceRef.current = null;
      try {
        const payload = JSON.stringify({
          mode: "save",
          name: dataRef.current.name,
          phone: dataRef.current.phone,
          config: dataRef.current.config,
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/signup", blob);
      } catch {
        // best-effort only — page is going away
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        if (dirtySinceRef.current !== null) {
          doSave();
        }
      }
    }
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function updateField(key: string, value: string) {
    setConfig((prev) => {
      const next = { ...prev, [key]: value } as typeof EMPTY_CONFIG;
      dataRef.current.config = next;
      return next;
    });
    if (key === "companyProprietor") dataRef.current.name = value;
    if (key === "companyContact") dataRef.current.phone = value;
    scheduleSave();
  }

  function scheduleSave() {
    setSaveState("saving");
    const now = Date.now();
    if (!dirtySinceRef.current) dirtySinceRef.current = now;
    // Max-wait: a user typing continuously never waits more than ~2.5s.
    if (now - dirtySinceRef.current >= 2500) {
      doSave();
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, 800);
  }

  async function doSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtySinceRef.current = null;
    try {
      const { name, phone, config: cfg } = dataRef.current;
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "save", name, phone, config: cfg }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handleSubmit() {
    setSubmitError("");
    const errors: Record<string, string> = {};
    if (!config.companyName.trim()) errors.companyName = "Company name is required.";
    if (!dataRef.current.name.trim()) errors.companyProprietor = "Owner name is required.";
    const digits = dataRef.current.phone.replace(/\D/g, "");
    if (!digits) {
      errors.companyContact = "Contact number is required.";
    } else if (digits.length < 10 || !/^[6-9]/.test(digits)) {
      errors.companyContact = "Enter a valid 10-digit Indian mobile number.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await doSave();
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "submit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      if (data.submitted) {
        setStatus("submitted");
      } else {
        setStatus(String(data.status || "submitted"));
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Submit failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setLogoutLoading(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await doSave();
    } catch {
      // never block sign-out on a save failure
    }
    dirtySinceRef.current = null;
    try {
      await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "logout" }),
      });
    } catch {
      // still clear local state and redirect
    }
    localStorage.removeItem("portal_session");
    localStorage.removeItem("portal_email");
    localStorage.removeItem("portal_role");
    localStorage.removeItem("portal_client_id");
    localStorage.removeItem("portal_auth");
    window.location.href = "/upvc/login";
  }

  if (loading) {
    return (
      <div className="signup-page">
        <div className="signup-card">
          <img
            className="signup-logo"
            src="/logo.png"
            onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/100"; }}
            alt="Vitharn UPVC"
          />
          <p className="signup-loading">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const isWaiting = status !== "pending";

  return (
    <div className="signup-page">
      <div className="signup-card">
        <img
          className="signup-logo"
          src="/logo.png"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/100"; }}
          alt="Vitharn UPVC"
        />

        {isWaiting ? (
          <div className="signup-waiting">
            <div className="signup-check" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2>We received your request</h2>
            <p className="signup-subtitle">
              Thanks — your signup is with our team. We&apos;ll review your details and set up
              your account soon. If you have questions, email us at
              {" "}
              <a href="mailto:vitarn.dev@gmail.com">vitarn.dev@gmail.com</a>.
            </p>
            {status === "rejected" && (
              <p className="signup-rejected-note">
                We noticed a few details that need attention — we&apos;ll reach out to you
                at your registered contact shortly.
              </p>
            )}
            {(config.companyName || dataRef.current.name || dataRef.current.phone) && (
              <div className="signup-summary">
                <div className="signup-summary-title">What you submitted</div>
                {config.companyName && (
                  <div className="signup-summary-row">
                    <span className="signup-summary-label">Company</span>
                    <span className="signup-summary-value">{config.companyName}</span>
                  </div>
                )}
                {dataRef.current.name && (
                  <div className="signup-summary-row">
                    <span className="signup-summary-label">Name</span>
                    <span className="signup-summary-value">{dataRef.current.name}</span>
                  </div>
                )}
                {dataRef.current.phone && (
                  <div className="signup-summary-row">
                    <span className="signup-summary-label">Contact</span>
                    <span className="signup-summary-value">{dataRef.current.phone}</span>
                  </div>
                )}
              </div>
            )}
            <button className="signup-logout" onClick={handleLogout} disabled={logoutLoading}>
              {logoutLoading ? "Signing out..." : "Sign out"}
            </button>
          </div>
        ) : (
          <>
            <h2>Welcome! Set up your UPVC business profile</h2>
            <p className="signup-subtitle">
              You&apos;re pre-registered with us. Fill in your business details below — we&apos;ll
              review your profile once you complete the form.
            </p>

            <form
              className="signup-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="signup-field">
                <label htmlFor="signupEmail">Email</label>
                <input
                  id="signupEmail"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                />
              </div>

              <div className="signup-field">
                <label htmlFor="signupCompanyName">
                  Business / Company Name <span className="signup-req">*</span>
                </label>
                <input
                  id="signupCompanyName"
                  type="text"
                  placeholder="e.g. Vitharn UPVC Windows"
                  value={config.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                />
                {fieldErrors.companyName && (
                  <p style={{ color: "#C44A10", fontSize: "12.5px", margin: "6px 0 0 0", fontWeight: 600 }}>
                    {fieldErrors.companyName}
                  </p>
                )}
              </div>

              <div className="signup-field">
                <label htmlFor="signupProprietor">
                  Owner / Proprietor Name <span className="signup-req">*</span>
                </label>
                <input
                  id="signupProprietor"
                  type="text"
                  placeholder="e.g. J. Venkatesh"
                  value={config.companyProprietor}
                  onChange={(e) => updateField("companyProprietor", e.target.value)}
                />
                {fieldErrors.companyProprietor && (
                  <p style={{ color: "#C44A10", fontSize: "12.5px", margin: "6px 0 0 0", fontWeight: 600 }}>
                    {fieldErrors.companyProprietor}
                  </p>
                )}
              </div>

              <div className="signup-field">
                <label htmlFor="signupContact">
                  Contact Number (WhatsApp) <span className="signup-req">*</span>
                </label>
                <input
                  id="signupContact"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={config.companyContact}
                  onChange={(e) => updateField("companyContact", e.target.value)}
                />
                {fieldErrors.companyContact && (
                  <p style={{ color: "#C44A10", fontSize: "12.5px", margin: "6px 0 0 0", fontWeight: 600 }}>
                    {fieldErrors.companyContact}
                  </p>
                )}
              </div>

              <div className="signup-field">
                <label htmlFor="signupCity">City / Area</label>
                <input
                  id="signupCity"
                  type="text"
                  placeholder="e.g. Chennai"
                  value={config.city}
                  onChange={(e) => updateField("city", e.target.value)}
                />
              </div>

              <div className="signup-field">
                <label htmlFor="signupAddress">Business Address</label>
                <textarea
                  id="signupAddress"
                  rows={3}
                  placeholder="Shop / office address"
                  value={config.companyAddress}
                  onChange={(e) => updateField("companyAddress", e.target.value)}
                />
              </div>

              <div className="signup-field">
                <label htmlFor="signupGst">GST Number</label>
                <input
                  id="signupGst"
                  type="text"
                  placeholder="Optional"
                  value={config.gstNumber}
                  onChange={(e) => updateField("gstNumber", e.target.value)}
                />
              </div>

              <div className="signup-field">
                <label htmlFor="signupBusinessType">Business Type</label>
                <select
                  id="signupBusinessType"
                  value={config.businessType}
                  onChange={(e) => updateField("businessType", e.target.value)}
                >
                  <option value="">Select business type</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="signup-field">
                <label htmlFor="signupYears">Years in Business</label>
                <select
                  id="signupYears"
                  value={config.yearsInBusiness}
                  onChange={(e) => updateField("yearsInBusiness", e.target.value)}
                >
                  <option value="">Select</option>
                  {YEARS_IN_BUSINESS.map((y) => (
                    <option key={y.value} value={y.value}>{y.label}</option>
                  ))}
                </select>
              </div>

              <div className="signup-save-status" aria-live="polite">
                {saveState !== "idle" && (
                  <span className={`signup-save-state signup-save-${saveState}`}>
                    {SAVE_STATUS_TEXT[saveState]}
                  </span>
                )}
              </div>

              {submitError && <div className="signup-error">{submitError}</div>}

              <button type="submit" className="signup-submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit for Review"}
              </button>
            </form>

            <button className="signup-logout" onClick={handleLogout} disabled={logoutLoading}>
              {logoutLoading ? "Signing out..." : "Sign out"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
