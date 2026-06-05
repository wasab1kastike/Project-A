#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const BASE_URL = (
  process.env.SEASON_5_SMOKE_BASE_URL ?? "https://project-a.artobest.com"
).replace(/\/+$/, "");
const RENDER_API_BASE = "https://api.render.com/v1";
const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const REQUIRED_SERVICES = ["project-a-s5-web", "project-a-s5-game-tick"];
const REQUIRED_POSTGRES = "project-a-s5-db";
const REQUIRED_REGION = "frankfurt";
const REQUIRED_BRANCH = "codex/season-5";

let failureCount = 0;
let warningCount = 0;

function logResult(kind, message, detail) {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${kind} ${message}${suffix}`);
}

function pass(message, detail) {
  logResult("PASS", message, detail);
}

function warn(message, detail) {
  warningCount += 1;
  logResult("WARN", message, detail);
}

function fail(message, detail) {
  failureCount += 1;
  logResult("FAIL", message, detail);
}

function assertCheck(condition, message, detail) {
  if (condition) {
    pass(message, detail);
  } else {
    fail(message, detail);
  }
}

function extractRenderBlock(renderYaml, name, fromIndex = 0) {
  const nameIndex = renderYaml.indexOf(`name: ${name}`, fromIndex);
  if (nameIndex === -1) return null;

  const start = Math.max(0, renderYaml.lastIndexOf("\n  - ", nameIndex));
  const nextResource = renderYaml.indexOf("\n  - ", nameIndex + name.length);
  const databasesStart = renderYaml.indexOf("\ndatabases:", nameIndex);
  const candidates = [nextResource, databasesStart].filter((index) => index > -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : renderYaml.length;

  return renderYaml.slice(start, end);
}

function blockReferencesDatabase(block, databaseName) {
  return new RegExp(
    String.raw`key:\s+DATABASE_URL[\s\S]*?fromDatabase:\s*\n\s*name:\s+${databaseName}\b`
  ).test(block);
}

async function checkBlueprint() {
  const renderYaml = await readFile(join(ROOT, "render.yaml"), "utf8");
  const databasesIndex = renderYaml.indexOf("\ndatabases:");
  const webBlock = extractRenderBlock(renderYaml, "project-a-s5-web");
  const cronBlock = extractRenderBlock(renderYaml, "project-a-s5-game-tick");
  const dbBlock = extractRenderBlock(
    renderYaml,
    "project-a-s5-db",
    databasesIndex > -1 ? databasesIndex : 0
  );

  assertCheck(Boolean(webBlock), "Blueprint defines project-a-s5-web");
  assertCheck(Boolean(cronBlock), "Blueprint defines project-a-s5-game-tick");
  assertCheck(Boolean(dbBlock), "Blueprint defines project-a-s5-db");

  if (webBlock) {
    assertCheck(webBlock.includes("type: web"), "S5 web is a web service");
    assertCheck(
      webBlock.includes(`region: ${REQUIRED_REGION}`),
      "S5 web region is Frankfurt"
    );
    assertCheck(
      webBlock.includes(`branch: ${REQUIRED_BRANCH}`),
      "S5 web deploys from codex/season-5"
    );
    assertCheck(
      webBlock.includes("healthCheckPath: /api/health"),
      "S5 web has health check path"
    );
    assertCheck(
      webBlock.includes("project-a.artobest.com"),
      "S5 web declares custom domain"
    );
    assertCheck(
      blockReferencesDatabase(webBlock, REQUIRED_POSTGRES),
      "S5 web DATABASE_URL uses project-a-s5-db"
    );
    assertCheck(
      !blockReferencesDatabase(webBlock, "project-a-db"),
      "S5 web does not use Season 4 database"
    );
    assertCheck(
      /key:\s+SEASON_5_PREVIEW_ENABLED[\s\S]*?value:\s+"true"/.test(webBlock),
      "S5 web enables Season 5 preview"
    );
    assertCheck(
      /key:\s+AUTH_URL[\s\S]*?value:\s+https:\/\/project-a\.artobest\.com/.test(
        webBlock
      ),
      "S5 web AUTH_URL uses custom domain"
    );
    assertCheck(
      /key:\s+NEXT_PUBLIC_APP_URL[\s\S]*?value:\s+https:\/\/project-a\.artobest\.com/.test(
        webBlock
      ),
      "S5 web public app URL uses custom domain"
    );
    assertCheck(
      /key:\s+ALLOWED_ORIGINS[\s\S]*?value:\s+https:\/\/project-a\.artobest\.com/.test(
        webBlock
      ),
      "S5 web allowed origins use custom domain"
    );
  }

  if (cronBlock) {
    assertCheck(cronBlock.includes("type: cron"), "S5 tick is a cron service");
    assertCheck(
      cronBlock.includes(`region: ${REQUIRED_REGION}`),
      "S5 tick region is Frankfurt"
    );
    assertCheck(
      cronBlock.includes(`branch: ${REQUIRED_BRANCH}`),
      "S5 tick deploys from codex/season-5"
    );
    assertCheck(
      cronBlock.includes("startCommand: npm run game:tick"),
      "S5 tick runs game tick command"
    );
    assertCheck(
      cronBlock.includes('schedule: "* * * * *"'),
      "S5 tick runs every minute"
    );
    assertCheck(
      blockReferencesDatabase(cronBlock, REQUIRED_POSTGRES),
      "S5 tick DATABASE_URL uses project-a-s5-db"
    );
    assertCheck(
      !blockReferencesDatabase(cronBlock, "project-a-db"),
      "S5 tick does not use Season 4 database"
    );
    assertCheck(
      /key:\s+SEASON_5_PREVIEW_ENABLED[\s\S]*?value:\s+"true"/.test(cronBlock),
      "S5 tick enables Season 5 preview"
    );
  }

  if (dbBlock) {
    assertCheck(
      dbBlock.includes(`region: ${REQUIRED_REGION}`),
      "S5 database region is Frankfurt"
    );
    assertCheck(
      dbBlock.includes("databaseName: project_a_s5"),
      "S5 database has distinct database name"
    );
    assertCheck(
      dbBlock.includes("user: project_a_s5"),
      "S5 database has distinct database user"
    );
  }
}

async function fetchText(path) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
      "user-agent": "project-a-season-5-smoke/1.0",
    },
  });
  const body = await response.text();
  return { url, response, body };
}

async function checkHttp() {
  const health = await fetchText("/api/health");
  assertCheck(
    health.response.ok,
    "HTTP /api/health is healthy",
    `${health.response.status} ${health.url}`
  );

  const root = await fetchText("/");
  assertCheck(
    root.response.ok,
    "HTTP / serves successfully",
    `${root.response.status} ${root.url}`
  );
  assertCheck(
    root.body.includes("Roguelite Fishing League") ||
      root.body.includes("/assets/season-5/world-map.png"),
    "Root page renders Season 5 preview surface"
  );

  const history = await fetchText("/history");
  assertCheck(
    history.response.ok,
    "HTTP /history serves successfully",
    `${history.response.status} ${history.url}`
  );

  const providers = await fetchText("/api/auth/providers");
  assertCheck(
    providers.response.ok,
    "Auth providers endpoint responds",
    `${providers.response.status} ${providers.url}`
  );
  assertCheck(
    providers.body.toLowerCase().includes("google"),
    "Google OAuth provider is exposed"
  );
}

function findNamedObject(value, name) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value.name === name) return value;
  if (!Array.isArray(value) && value.service?.name === name) return value.service;
  if (!Array.isArray(value) && value.postgres?.name === name) return value.postgres;

  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    const result = findNamedObject(nested, name);
    if (result) return result;
  }

  return null;
}

function stringifyLower(value) {
  return JSON.stringify(value).toLowerCase();
}

async function renderApiGet(path) {
  const response = await fetch(`${RENDER_API_BASE}${path}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${RENDER_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function checkRenderApi() {
  if (!RENDER_API_KEY) {
    warn("Render API checks skipped", "set RENDER_API_KEY to verify live resources");
    return;
  }

  for (const serviceName of REQUIRED_SERVICES) {
    const services = await renderApiGet(
      `/services?name=${encodeURIComponent(serviceName)}`
    );
    const service = findNamedObject(services, serviceName);
    const serviceText = stringifyLower(service ?? services);

    assertCheck(Boolean(service), `Render API finds ${serviceName}`);
    if (service) {
      pass(
        `Render ${serviceName} id`,
        service.id ?? service.serviceId ?? "id field not exposed"
      );
      assertCheck(
        serviceText.includes(REQUIRED_REGION),
        `Render ${serviceName} is in Frankfurt`
      );
      assertCheck(
        serviceText.includes(REQUIRED_BRANCH),
        `Render ${serviceName} deploys from codex/season-5`
      );
    }
  }

  const postgresList = await renderApiGet(
    `/postgres?name=${encodeURIComponent(REQUIRED_POSTGRES)}`
  );
  const postgres = findNamedObject(postgresList, REQUIRED_POSTGRES);
  const postgresText = stringifyLower(postgres ?? postgresList);

  assertCheck(Boolean(postgres), "Render API finds project-a-s5-db");
  if (postgres) {
    pass(
      "Render project-a-s5-db id",
      postgres.id ?? postgres.postgresId ?? "id field not exposed"
    );
    assertCheck(
      postgresText.includes(REQUIRED_REGION),
      "Render project-a-s5-db is in Frankfurt"
    );
  }
}

try {
  console.log(`Season 5 smoke target: ${BASE_URL}`);
  await checkBlueprint();
  await checkHttp();
  await checkRenderApi();
} catch (error) {
  fail("Smoke check crashed", error instanceof Error ? error.message : String(error));
}

console.log(
  `Season 5 smoke completed with ${failureCount} failure(s), ${warningCount} warning(s).`
);

if (failureCount > 0) {
  process.exitCode = 1;
}
