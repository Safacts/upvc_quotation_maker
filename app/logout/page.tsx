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
    <div className="card">
      <h2>You have been logged out</h2>
      <p>Your session has ended. See you soon.</p>
      <a href="/">Back to Home</a>
    </div>
  );
}
