"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const UMAMI_SRC = "https://umami.novamymentor.cloud/umami.js";
const WEBSITE_ID = "13fc779a-eb5b-4e48-9011-f7b7b985a03d";

interface UmamiTrackerProps {
  nonce?: string;
}

export default function UmamiTracker({ nonce }: UmamiTrackerProps) {
  const [enabled, setEnabled] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "app.vitharn.com") {
      setEnabled(true);
    }
  }, []);

  if (!enabled || scriptError) return null;

  return (
    <Script
      defer
      src={UMAMI_SRC}
      data-website-id={WEBSITE_ID}
      nonce={nonce}
      onError={() => {
        setScriptError(true);
        if (typeof window !== "undefined" && (window as any).umami) {
          delete (window as any).umami;
        }
      }}
      onLoad={() => {
        if (typeof window !== "undefined" && !(window as any).umami) {
          setScriptError(true);
        }
      }}
    />
  );
}
}