import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";

function getEncodedKey(): Uint8Array {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) throw new Error("JWT_SECRET environment variable is missing");
  return new TextEncoder().encode(secretKey);
}

export type SessionPayload = {
  role: "admin" | "customer" | "signup";
  email: string;
  client_id?: string;
  signup_request_id?: string;
  session_id: string;
  expiresAt: Date;
};

export type CreateSessionPayload = Omit<SessionPayload, "session_id" | "expiresAt">;

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getEncodedKey());
}

export async function decrypt(session: string | undefined = "") {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, getEncodedKey(), {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch (error) {
    return null;
  }
}

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-session" : "session";

export async function createSession(payload: CreateSessionPayload) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await encrypt({ ...payload, session_id: sessionId, expiresAt });
  
  const cookieStore = await cookies();
  // __Host- prefix in prod enforces Secure + Path=/ + no Domain (defense vs cookie shadowing)
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
  // Clear legacy name to avoid stale duplicate on rollout
  if (SESSION_COOKIE !== "session") {
    try { cookieStore.delete("session"); } catch {}
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  // Try __Host- first, fallback to legacy for rolling upgrade
  const session = cookieStore.get(SESSION_COOKIE)?.value || cookieStore.get("session")?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("session");
  try { cookieStore.delete("__Host-session"); } catch {}
}
