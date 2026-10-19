// Vercel build: copies web/ to dist/ (without tests) and writes dist/config.js from environment variables.
// No dependencies. Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/build.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "web"), out, { recursive: true, filter: (src) => !/[\\/]web[\\/]tests([\\/]|$)/.test(src) && !src.endsWith("package.json") });

const url = process.env.SUPABASE_URL ?? "", key = process.env.SUPABASE_ANON_KEY ?? "";
if (!url || !key) {
  const msg = "SUPABASE_URL and SUPABASE_ANON_KEY are not set.";
  if (process.env.VERCEL) { console.error(`ERROR: ${msg} Add them in Vercel > Project > Settings > Environment Variables.`); process.exit(1); }
  console.warn(`WARNING: ${msg} The site will build but cannot sign in.`);
}
if (key.startsWith("sb_secret_") || /service_role/i.test(key) || (key.split(".")[1] && Buffer.from(key.split(".")[1], "base64url").toString().includes('"service_role"'))) {
  console.error("ERROR: that looks like the service_role key. Never publish it. Use the anon (public) key."); process.exit(1);
}
writeFileSync(join(out, "config.js"), `globalThis.__BCM_CONFIG = ${JSON.stringify({ backend: "supabase", supabaseUrl: url, supabaseAnonKey: key })};\n`);
console.log("built dist/ for", url || "(no supabase url)");
