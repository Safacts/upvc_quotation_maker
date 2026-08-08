/**
 * Test setup for the desktop console UI (Phase 3) component tests.
 *
 * Runs before every test file in the `client` vitest project. Stubs the
 * browser globals the console expects but jsdom doesn't provide.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement matchMedia; several console components branch on it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom lacks scrollIntoView; the DataGrid calls it on keyboard navigation.
if (typeof window !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Reset the DOM between tests so a palette left open in one test doesn't leak
// into the next.
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
});
