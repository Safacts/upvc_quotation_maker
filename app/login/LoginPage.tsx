"use client";

import { useEffect, useRef, useState } from "react";
import "./login.css";

const GOOGLE_CLIENT_ID =
  "726482519803-od8lidratsv0du7jtaeopj29khmn6meb.apps.googleusercontent.com";

function slugify(s: string) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function browserSha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorColor, setErrorColor] = useState("#ef4444");
  const [loginLoading, setLoginLoading] = useState(false);

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpStage, setOtpStage] = useState<"email" | "otp">("email");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [targetEmail, setTargetEmail] = useState("");

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const googleDivRef = useRef<HTMLDivElement>(null);

  function showError(msg: string, color = "#ef4444") {
    setError(msg);
    setErrorColor(color);
  }

  async function redirectAfterAuth(data: any, emailFallback: string) {
    localStorage.setItem("portal_session", "active");
    localStorage.setItem("portal_email", data.email || emailFallback);
    localStorage.setItem("portal_auth", "password");
    localStorage.setItem("portal_role", data.role);

    if (data.role === "signup") {
      localStorage.removeItem("portal_client_id");
      window.location.href = "/signup";
      return;
    }

    if (data.role === "admin") {
      localStorage.removeItem("portal_client_id");
      window.location.href = "/admin";
      return;
    }

    localStorage.setItem("portal_client_id", data.client_id);
    window.location.href = "/" + slugify(data.client_id) + "/home";
  }

  async function handleLogin() {
    setError("");
    if (!email.trim() || !password) {
      showError("Please enter your email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch("/api/portal_auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "login", email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(
          data.error === "invalid email or password"
            ? "Invalid email or password."
            : data.error || "Login failed.",
        );
        return;
      }
      await redirectAfterAuth(data, email.trim());
    } catch {
      showError(
        "Unable to connect to the login portal. Please check your network connection and try again.",
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleGoogleCredential(response: any) {
    setError("");
    setLoginLoading(true);
    try {
      if (!response || typeof response !== "object") {
        throw new Error("no response from Google");
      }
      if (response.error) {
        throw new Error("Google denied the request: " + response.error);
      }
      if (!response.credential || typeof response.credential !== "string") {
        throw new Error("Google did not return a credential");
      }

      const parts = response.credential.split(".");
      if (parts.length < 2) {
        throw new Error("malformed credential");
      }
      let payload: any;
      try {
        payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
      } catch {
        throw new Error("could not read Google credential");
      }

      const gEmail = String(payload.email || "").trim();
      if (!gEmail || !payload.email_verified) {
        throw new Error("Google account email is not verified");
      }

      const res = await fetch("/api/portal_auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "google", email: gEmail, credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "not authorized");

      localStorage.setItem("portal_session", "active");
      localStorage.setItem("portal_email", data.email || gEmail);
      localStorage.setItem("portal_auth", "google");
      localStorage.setItem("portal_role", data.role);

      if (data.role === "signup") {
        localStorage.removeItem("portal_client_id");
        window.location.href = "/signup";
        return;
      }

      if (data.role === "admin") {
        localStorage.removeItem("portal_client_id");
        window.location.href = "/admin";
        return;
      }

      localStorage.setItem("portal_client_id", data.client_id);
      window.location.href = "/" + slugify(data.client_id) + "/home";
    } catch (err: any) {
      showError("Google sign-in failed: " + err.message);
      setLoginLoading(false);
    }
  }

  function initGoogleButton() {
    const w = window as any;
    if (w.google && w.google.accounts && googleDivRef.current) {
      w.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      w.google.accounts.id.renderButton(googleDivRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
      });
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    if (emailParam) {
      setEmail(emailParam);
      if (params.get("action") === "reset") {
        setTimeout(() => triggerForgotPassword(emailParam), 500);
      }
    }

    let interval: any;
    
    // Check if the script exists, if not create it
    if (!document.querySelector('script[data-gsi]')) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.gsi = "1";
      document.head.appendChild(script);
    }
    
    // Wait for the window.google object to be available
    interval = setInterval(() => {
      if ((window as any).google && (window as any).google.accounts) {
        clearInterval(interval);
        initGoogleButton();
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  function triggerForgotPassword(prefillEmail?: string) {
    const target = prefillEmail !== undefined ? prefillEmail : email.trim();
    if (!target) {
      showError("Please enter your email address first.");
      return;
    }
    setError("");
    setOtpEmail(target);
    setOtpStage("email");
    setOtpModalOpen(true);
  }

  async function sendOtp() {
    const target = otpEmail.trim();
    if (!target) {
      showError("Please enter your email address.");
      return;
    }
    setTargetEmail(target);
    showError("Sending OTP code to your registered email...", "#6366f1");
    try {
      const response = await fetch("/api/reset_client_password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const result = await response.json();
      if (!response.ok) {
        showError(result.error || "Unable to send OTP.");
        return;
      }
      setError("");
      setOtpStage("otp");
      setOtpInput("");
    } catch {
      showError("Unable to send OTP. Please check your network connection and try again.");
    }
  }

  function verifyOtp() {
    const inputOtp = otpInput.trim();
    if (!inputOtp) {
      showError("Please enter the OTP code.");
      return;
    }
    setForgotOtp(inputOtp);
    setOtpModalOpen(false);
    setResetModalOpen(true);
  }

  async function saveNewPassword() {
    if (newPass.length < 6) {
      showError("Password must be at least 6 characters.");
      return;
    }
    setResetLoading(true);
    try {
      const newHash = await browserSha256(newPass);
      const response = await fetch("/api/reset_client_password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail, otp: forgotOtp, new_hash: newHash }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Reset failed");
      showError("Password updated successfully!", "#10b981");
      setResetModalOpen(false);
    } catch {
      showError("Unable to save password. Please check your connection and try again.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      {/* ── LEFT: Brand panel ── */}
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-brand-logo">
            <img
              src="/logo.png"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/100"; }}
              alt="Vitharn ERP"
            />
            <span>Vitharn <em>ERP</em></span>
          </div>
          <h2>The platform<br /><span>control room.</span></h2>
          <p>
            Manage client accounts, billing, deployments and support —
            the internal Vitharn ERP Services console.
          </p>
          <ul className="login-brand-features">
            <li>Client &amp; account management</li>
            <li>Billing, invoices &amp; payments</li>
            <li>Platform-wide analytics</li>
            <li>White-label &amp; tier controls</li>
            <li>SSO into any client workspace</li>
          </ul>
        </div>
      </div>

      {/* ── RIGHT: Login form ── */}
      <div className="login-container">
        <div className="login-form-header">
          <h2>Welcome back</h2>
          <p>Sign in to the Vitharn ERP Console</p>
        </div>

        <div className="g-signin-wrap" style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <div ref={googleDivRef} id="gSignInDiv" style={{ opacity: loginLoading ? 0.5 : 1, pointerEvents: loginLoading ? 'none' : 'auto' }} />
          {loginLoading && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px', borderColor: 'var(--rust)', borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>

        <div className="divider">or sign in with email</div>

        <div className="input-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            placeholder="vitarn.dev@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
        </div>

        {error && (
          <div id="errorBox" className="error-msg" style={{ color: errorColor, display: "block" }}>
            {error}
          </div>
        )}

        <button onClick={handleLogin} id="loginBtn" disabled={loginLoading}>
          {loginLoading && <span className="spinner" id="loginSpinner" />}
          <span id="loginText">{loginLoading ? "Signing in..." : "Login"}</span>
        </button>
        <button className="forgot-link" onClick={() => triggerForgotPassword()}>
          Forgot Password?
        </button>

        <div className="login-privacy-note">
          By signing in, you agree to our{" "}
          <a href="/terms">Terms of Service</a> and{" "}
          <a href="/privacy">Privacy Policy</a>.
          We use Google Sign-In only for authentication — we never access your Google account data.
        </div>
      </div>

      {otpModalOpen && (
        <div className="modal" id="otpModal" style={{ display: "flex" }}>
          <div className="modal-content">
            <h3 id="otpModalTitle">{otpStage === "email" ? "Enter Email" : "Enter OTP"}</h3>
            <p id="otpModalDesc">
              {otpStage === "email"
                ? "We'll send an OTP to this email to reset your password."
                : `OTP sent to ${otpEmail}. Enter it below to verify.`}
            </p>
            {otpStage === "email" && (
              <div className="input-group" id="otpEmailGroup">
                <label htmlFor="otpEmail">Email Address</label>
                <input
                  type="email"
                  id="otpEmail"
                  placeholder="your@email.com"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                />
              </div>
            )}
            {otpStage === "otp" && (
              <div className="input-group" id="otpInputGroup">
                <label htmlFor="otpInput">OTP Code</label>
                <input
                  type="number"
                  id="otpInput"
                  placeholder="123456"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                />
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setOtpModalOpen(false)}>
                Cancel
              </button>
              {otpStage === "email" ? (
                <button id="otpSendBtn" onClick={sendOtp}>Send OTP</button>
              ) : (
                <button id="otpVerifyBtn" onClick={verifyOtp}>Verify</button>
              )}
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div className="modal" id="resetModal" style={{ display: "flex" }}>
          <div className="modal-content">
            <h3>Set New Password</h3>
            <p>Enter your new password below (minimum 6 characters).</p>
            <div className="input-group">
              <label htmlFor="newPassInput">New Password</label>
              <input
                type="password"
                id="newPassInput"
                placeholder="••••••••"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setResetModalOpen(false)}>
                Cancel
              </button>
              <button onClick={saveNewPassword} id="resetBtn" disabled={resetLoading}>
                {resetLoading && <span className="spinner" id="resetSpinner" />}
                <span>{resetLoading ? "Saving..." : "Save Password"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
