"use client";

import { useEffect } from "react";
import "./logout.css";

const KEYS = [
  "portal_session",
  "portal_email",
  "portal_role",
  "portal_client_id",
  "portal_auth",
  "portal_app_slug",
  "portal_auth_hash",
];

export default function LogoutPage() {
  useEffect(() => {
    KEYS.forEach((k) => localStorage.removeItem(k));
  }, []);

  return (
    <div className="logout-wrap">
      {/* ── LEFT: Brand panel ── */}
      <div className="logout-brand">
        <div className="logout-brand-inner">
          <div className="logout-brand-logo">
            <img
              src="/logo.png"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://placehold.co/100";
              }}
              alt="Vitharn UPVC"
            />
            <span>Vitharn <em>UPVC</em></span>
          </div>
          <h2>Signed out</h2>
          <p>
            You have been signed out. Your session has ended.
          </p>
        </div>
      </div>

      {/* ── RIGHT: Message panel ── */}
      <div className="logout-container">
        <div className="logout-form-header">
          <h2>See you soon!</h2>
          <p>Your session has ended. Ready to get back to work?</p>
        </div>

        <div className="logout-actions">
          <a href="/upvc/login" className="logout-btn-primary" id="logoutLoginBtn">
            Sign In Again
          </a>
          <a href="/upvc" className="logout-btn-secondary" id="ctaPricingBtn">
            View Pricing
          </a>
        </div>

        <ul className="logout-checks">
          <li><CheckCircle size={15} /> Session cleared</li>
          <li><CheckCircle size={15} /> Data secured</li>
          <li><CheckCircle size={15} /> Ready to go again</li>
        </ul>
        <p style={{ marginTop: 32, fontSize: 12, color: "#7A5030", textAlign: "center" }}>
          © 2026 Vitharn ERP Services — Sole Proprietorship, Hyderabad.
        </p>
      </div>
    </div>
  );
}

function CheckCircle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}