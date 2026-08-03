"use client";

import { useEffect, useState } from "react";

const SELECTOR =
  "a, button, [role=button], input[type=button], input[type=submit], select, summary";

function labelOf(el: Element): string {
  const text =
    (el.getAttribute("aria-label") || "").trim() ||
    (el.getAttribute("title") || "").trim() ||
    (el.getAttribute("value") || "").trim() ||
    (el.textContent || "").trim();
  return text.slice(0, 80);
}

export default function UmamiClickTracker() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.location.hostname !== "app.vitharn.com") return;
    setEnabled(true);

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const el = target.closest<HTMLElement>(SELECTOR);
      if (!el) return;

      const payload = {
        tag: el.tagName.toLowerCase(),
        text: labelOf(el),
        href: el.tagName.toLowerCase() === "a" ? (el as HTMLAnchorElement).href : "",
        page: window.location.pathname,
      };
      (window as any).umami?.track?.("click", payload);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!enabled) return null;

  return null;
}
