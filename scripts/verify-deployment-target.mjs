#!/usr/bin/env node

/**
 * Fail-closed, secret-free deployment identity checks.
 * This checks the values supplied to a workflow; it never prints credentials.
 */

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
};

const deploymentEnv = required("DEPLOYMENT_ENV");
const expectedSupabaseRef = required("EXPECTED_SUPABASE_PROJECT_REF");
const expectedVercelTeam = required("EXPECTED_VERCEL_TEAM");
const expectedVercelTeamId = required("EXPECTED_VERCEL_TEAM_ID");
const expectedVercelProject = required("EXPECTED_VERCEL_PROJECT");
const supabaseUrl = required("SUPABASE_URL");
const vercelToken = required("VERCEL_TOKEN");
const gitBranch = process.env.GITHUB_REF_NAME?.trim();

if (!["staging", "production"].includes(deploymentEnv)) {
  throw new Error(`DEPLOYMENT_ENV must be staging or production, got ${deploymentEnv}`);
}

if (gitBranch) {
  const validBranches = deploymentEnv === "production"
    ? ["main"]
    : ["development-v1", "deployment-v1"];
  if (!validBranches.includes(gitBranch)) {
    throw new Error(
      `Branch/environment mismatch: ${gitBranch} cannot target ${deploymentEnv}`,
    );
  }
}

const supabaseHost = new URL(supabaseUrl).hostname;
if (supabaseHost !== `${expectedSupabaseRef}.supabase.co`) {
  throw new Error(
    `Supabase target mismatch: expected ${expectedSupabaseRef}.supabase.co, got ${supabaseHost}`,
  );
}

if (!vercelToken.trim()) throw new Error("VERCEL_TOKEN is missing");
if (!expectedVercelTeam.trim() || !expectedVercelProject.trim()) {
  throw new Error("Vercel team/project identity is incomplete");
}

const vercelResponse = await fetch(
  `https://api.vercel.com/v9/projects/${encodeURIComponent(expectedVercelProject)}?teamId=${encodeURIComponent(expectedVercelTeamId)}`,
  { headers: { Authorization: `Bearer ${vercelToken}` } },
);
if (!vercelResponse.ok) {
  throw new Error(`Vercel project lookup failed: HTTP ${vercelResponse.status}`);
}
const vercelProject = await vercelResponse.json();
if (vercelProject.accountId !== expectedVercelTeamId) {
  throw new Error(
    `Vercel team mismatch: expected ${expectedVercelTeamId}, got ${vercelProject.accountId ?? "unknown"}`,
  );
}
if (vercelProject.name !== expectedVercelProject) {
  throw new Error(
    `Vercel project mismatch: expected ${expectedVercelProject}, got ${vercelProject.name ?? "unknown"}`,
  );
}

console.log(
  `Deployment identity OK: environment=${deploymentEnv}, supabase=${expectedSupabaseRef}, vercel=${expectedVercelTeam}/${expectedVercelProject}`,
);
