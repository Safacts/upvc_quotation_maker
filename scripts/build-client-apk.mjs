import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Usage: node scripts/build-client-apk.mjs --client=venkateshwara
const args = process.argv.slice(2);
let clientId = "";

for (const arg of args) {
  if (arg.startsWith("--client=")) {
    clientId = arg.split("=")[1];
  }
}

if (!clientId) {
  console.error("❌ Please specify a client ID. Example: node scripts/build-client-apk.mjs --client=venkateshwara");
  process.exit(1);
}

console.log(`🚀 Starting White-Labeled APK Build for Client: ${clientId}...`);

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "android", "app", "src", "main", "AndroidManifest.xml");
const outputsDir = path.join(rootDir, "public", "downloads");

if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Backup original manifest
const originalManifest = fs.readFileSync(manifestPath, "utf8");

try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://effxrwrbsjduvhmorvrq.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN";

  let appName = clientId.toUpperCase() + " UPVC Quote";
  
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${clientId}&select=config`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].config?.appName) {
      appName = data[0].config.appName;
    }
  } catch (e) {
    console.warn("⚠️ Could not fetch client config from Supabase, using fallback app name.");
  }

  console.log(`📱 Customizing App Title: "${appName}"`);

  // Patch AndroidManifest.xml
  let updatedManifest = originalManifest.replace(/android:label="[^"]*"/, `android:label="${appName}"`);
  fs.writeFileSync(manifestPath, updatedManifest, "utf8");

  // Run Flutter Build
  console.log("🔨 Executing Flutter release build...");
  execSync("flutter build apk --release", { stdio: "inherit" });

  const apkSource = path.join(rootDir, "build", "app", "outputs", "flutter-apk", "app-release.apk");
  const apkTarget = path.join(outputsDir, `${clientId}-upvc-quote.apk`);

  fs.copyFileSync(apkSource, apkTarget);
  console.log(`✅ Build complete! APK saved to: ${apkTarget}`);

  const downloadUrl = `/downloads/${clientId}-upvc-quote.apk`;
  console.log(`🔗 App Download URL ready: ${downloadUrl}`);
  console.log("🎉 Successfully completed Pro APK Build Process!");

} catch (err) {
  console.error("❌ Build failed:", err.message);
} finally {
  // Restore original manifest
  fs.writeFileSync(manifestPath, originalManifest, "utf8");
}
