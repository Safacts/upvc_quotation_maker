const { app, BrowserWindow, Menu, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const FALLBACK_CONFIG = {
  baseUrl: "https://app.vitharn.com",
  clientSlug: "",
  companyName: "Vitharn Desktop Console",
};

function loadConfig() {
  try {
    return { ...FALLBACK_CONFIG, ...JSON.parse(fs.readFileSync(path.join(__dirname, "client-config.json"), "utf8")) };
  } catch {
    return FALLBACK_CONFIG;
  }
}

const config = loadConfig();
const baseUrl = String(config.baseUrl).replace(/\/$/, "");
const consoleUrl = config.clientSlug
  ? `${baseUrl}/${encodeURIComponent(config.clientSlug)}/console`
  : `${baseUrl}/upvc/login`;
const trustedOrigin = new URL(baseUrl).origin;

function isTrustedUrl(url) {
  try {
    return new URL(url).origin === trustedOrigin;
  } catch {
    return false;
  }
}

function isHomeForConfiguredClient(url) {
  if (!config.clientSlug) return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === trustedOrigin && parsed.pathname === `/${config.clientSlug}/home`;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: `${config.companyName} | Vitharn Desktop Console`,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) {
      win.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });

  win.webContents.on("did-navigate", (_event, url) => {
    // The shared login page currently returns to /home. Return the desktop user
    // to the console without changing the cloud application or its login flow.
    if (isHomeForConfiguredClient(url)) win.loadURL(consoleUrl);
  });

  win.loadURL(consoleUrl);
  return win;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
