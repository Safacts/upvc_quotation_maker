import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};

const slug = valueFor("--slug").trim().toLowerCase();
const companyName = valueFor("--name").trim();
const baseUrl = (valueFor("--base-url") || "https://app.vitharn.com").replace(/\/$/, "");

if (!/^[a-z0-9_-]{2,80}$/.test(slug)) {
  throw new Error("Usage: npm run configure-client -- --slug <client-slug> --name \"Company Name\"");
}

if (!companyName) {
  throw new Error("--name is required so the installer can be branded for the client");
}

await writeFile(
  new URL("./client-config.json", import.meta.url),
  `${JSON.stringify({ baseUrl, clientSlug: slug, companyName }, null, 2)}\n`,
  "utf8",
);

console.log(`Configured desktop console for ${companyName} (${slug})`);
