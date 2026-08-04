"use client";

import { useEffect } from "react";

// Registers the root-scope PWA service worker as early as possible on every
// page, so Chrome's installability criteria are met and beforeinstallprompt
// can fire (registration on the portal page alone was too late).
export default function PwaSwRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/pwa-sw.js").catch(() => {});
    }
  }, []);
  return null;
}
