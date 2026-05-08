import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const cacheRoot = process.env.XDG_CACHE_HOME
  ? path.resolve(process.env.XDG_CACHE_HOME)
  : path.join(tmpdir(), "project-a-render-cache");
const npmCacheDir = path.join(cacheRoot, "npm");
const nextCacheDir = path.join(rootDir, "apps", "web", ".next", "cache");
const cachedNextDir = path.join(cacheRoot, "project-a", "apps-web-next-cache");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function restoreNextCache() {
  if (!existsSync(cachedNextDir)) {
    console.log("No cached Next.js build cache found.");
    return;
  }

  console.log(`Restoring Next.js build cache from ${cachedNextDir}`);
  await rm(nextCacheDir, { force: true, recursive: true });
  await mkdir(path.dirname(nextCacheDir), { recursive: true });
  await cp(cachedNextDir, nextCacheDir, { recursive: true });
}

async function saveNextCache() {
  if (!existsSync(nextCacheDir)) {
    console.log("No Next.js build cache produced.");
    return;
  }

  console.log(`Saving Next.js build cache to ${cachedNextDir}`);
  await rm(cachedNextDir, { force: true, recursive: true });
  await mkdir(path.dirname(cachedNextDir), { recursive: true });
  await cp(nextCacheDir, cachedNextDir, { recursive: true });
}

async function removeNextCacheFromArtifact() {
  if (!existsSync(nextCacheDir)) {
    return;
  }

  console.log(`Removing Next.js build cache from artifact at ${nextCacheDir}`);
  await rm(nextCacheDir, { force: true, recursive: true });
}

async function installDependencies() {
  await mkdir(npmCacheDir, { recursive: true });
  await run("npm", ["ci", "--prefer-offline", "--cache", npmCacheDir]);
}

async function buildWeb() {
  await restoreNextCache();
  await installDependencies();
  await run("npm", ["run", "build"]);
  await saveNextCache();
  await removeNextCacheFromArtifact();
}

async function buildCron() {
  await installDependencies();
  await run("npm", ["run", "db:generate"]);
}

if (mode === "web") {
  await buildWeb();
} else if (mode === "cron") {
  await buildCron();
} else {
  console.error("Usage: node scripts/render-build.mjs <web|cron>");
  process.exitCode = 1;
}
