// Picks the backend from config.js: backend = "supabase" (default) or "dev" (local test server).
export async function loadBackend() {
  const mod = (globalThis.__BCM_CONFIG?.backend ?? "supabase") === "dev" ? await import("./dev.js") : await import("./supabase.js");
  return mod.backend;
}
