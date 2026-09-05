/** Bounded portal requests. Never retry writes automatically: the server may have saved them. */
export async function portalRequest(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error("Request could not be confirmed");
    return data;
  } finally {
    clearTimeout(timer);
  }
}
