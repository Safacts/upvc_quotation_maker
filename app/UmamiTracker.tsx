"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const UMAMI_SRC = "https://umami.novamymentor.cloud/umami.js";
const WEBSITE_ID = "13fc779a-eb5b-4e48-9011-f7b7b985a03d";

export default function UmamiTracker() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.location.hostname === "app.vitharn.com") {
      setEnabled(true);
    }
  }, []);

  if (!enabled) return null;

  return <Script defer src={UMAMI_SRC} data-website-id={WEBSITE_ID} />;
}
