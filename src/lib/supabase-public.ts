/**
 * Client-safe public Supabase config.
 *
 * Browser code cannot read server-only env (plain process.env is stripped in
 * client bundles), so the LIVE project (Mumbai, jqjxhhgfwdzckijnnede — live
 * since the 20-08-2026 Tokyo→Mumbai cutover) is baked in as fallback.
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY override at build.
 *
 * The anon key is PUBLIC by design (role=anon); RLS is the security boundary.
 * Never put a service_role key here.
 */
export const SUPABASE_PUBLIC_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jqjxhhgfwdzckijnnede.supabase.co";

export const SUPABASE_PUBLIC_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxanhoaGdmd2R6Y2tpam5uZWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NTY3MTYsImV4cCI6MjEwMzIzMjcxNn0.rOx-8Y_aT0pNVdvZMxRUx8feP2ZU1OBlF63oLH6nAnY";
