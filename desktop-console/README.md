# Vitharn Desktop Console

This is a separate Windows installer shell for the existing cloud console. It does not modify the Next.js console or duplicate the Supabase service-role logic.

## Build a client installer

From this directory:

```powershell
npm install
npm run configure-client -- --slug kprupvc --name "KPR UPVC"
```

The installer is written to `dist/` with a client-specific Windows application identity, product name, shortcut, and filename. The configured `client-config.json` is intentionally local and must not contain credentials.

## Important behavior

- Login, tenant authorization, APIs, PDFs, and data remain cloud-backed.
- The desktop shell persists the normal browser session securely through Electron's session storage.
- Only the configured Vitharn origin is allowed inside the window. Other links open in the system browser.
- The first release improves installation, branding, window behavior, and browser overhead. It is not an offline database.

## Local development

Use `npm start` after configuring a client. Do not put Supabase service-role keys or other secrets in this directory.
