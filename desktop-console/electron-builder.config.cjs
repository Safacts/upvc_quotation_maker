const fs = require("node:fs");
const path = require("node:path");

let config = { clientSlug: "", companyName: "Vitharn" };
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(path.join(__dirname, "client-config.json"), "utf8")) };
} catch {
  // A generic build remains possible before a client is configured.
}

const safeSlug = String(config.clientSlug || "generic").toLowerCase().replace(/[^a-z0-9-]/g, "-");
const safeName = String(config.companyName || "Vitharn").trim();

module.exports = {
  appId: `com.vitharn.erp.console.${safeSlug}`,
  productName: `${safeName} Console`,
  files: ["main.cjs", "preload.cjs", "client-config.json"],
  directories: { output: "dist" },
  win: {
    target: ["nsis"],
    artifactName: `Vitharn-${safeSlug}-Console-\${version}-Setup.\${ext}`,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: `${safeName} Console`,
  },
};
