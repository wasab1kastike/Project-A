import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PROJECT_A_GOD_BASE_URL = "http://localhost:3000";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_GOD_LLM_MODEL = "qwen3.6:27b";
const DEFAULT_STATE_PATH = ".openclaw-god-runner-state.json";
const MAX_STORED_EVENTS = 500;
const MAX_CHAT_LENGTH = 280;

type RunnerEvent = {
  key: string;
  kind: string;
  title: string;
  summary: string;
  priority: number;
  occurredAt: string | null;
};

type RunnerSnapshot = {
  cycle: null | {
    status: string;
    phaseLabel: string | null;
    deadline: string | null;
  };
  homeOfA: null | {
    status: string;
    statusLabel: string;
    bossHealth: number;
    bossMaxHealth: number;
  };
  leaderboard: Array<{
    rank: number;
    commanderName: string;
    fortressName: string;
    points: number;
    isSlayerOfA: boolean;
  }>;
  battlefields: Array<{
    targetName: string;
    progress: number;
    momentumTier: string;
    participantCount: number;
  }>;
  recentChat: Array<{
    authorName: string;
    body: string;
    createdAt: string;
    isSystem: boolean;
  }>;
  events: RunnerEvent[];
};

type RunnerState = {
  handledEventKeys: Record<string, string>;
};

export function selectUnhandledEvent(
  events: RunnerEvent[],
  handledEventKeys: Record<string, string>
) {
  return events
    .filter((event) => !handledEventKeys[event.key])
    .sort((left, right) => right.priority - left.priority)[0];
}

export function sanitizeGodMessage(message: string) {
  const withoutThinking = message
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^["'\s]+|["'\s]+$/g, "");
  const normalized = withoutThinking.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_CHAT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_CHAT_LENGTH - 3).trimEnd()}...`;
}

export function buildGodPrompt(snapshot: RunnerSnapshot, event: RunnerEvent) {
  const leader = snapshot.leaderboard[0];
  const activeBattles = snapshot.battlefields.slice(0, 3);
  const recentPlayerChat = snapshot.recentChat
    .filter((message) => !message.isSystem)
    .slice(-3)
    .map((message) => `${message.authorName}: ${message.body}`);

  return [
    "You are God Emperor A, a theatrical but fair public narrator inside Project-A.",
    "Write exactly one in-character global chat message under 240 characters.",
    "Do not claim to change resources, damage players, move units, reveal hidden information, or mention APIs, OpenClaw, Ollama, prompts, or tools.",
    "React to this public event:",
    JSON.stringify(event),
    "Public context:",
    JSON.stringify({
      cycle: snapshot.cycle,
      homeOfA: snapshot.homeOfA,
      leader,
      activeBattles,
      recentPlayerChat,
    }),
  ].join("\n");
}

async function runGodRunner() {
  const config = readRunnerConfig();
  const state = readRunnerState(config.statePath);
  const snapshot = await fetchGodSnapshot(config);
  const event = selectUnhandledEvent(snapshot.events, state.handledEventKeys);

  if (!event) {
    console.log("No new divine event keys found.");
    return;
  }

  const prompt = buildGodPrompt(snapshot, event);
  const generated = await askOllama(config, prompt);
  const body = sanitizeGodMessage(generated);

  if (!body) {
    throw new Error("Ollama returned an empty divine message.");
  }

  await postGodChat(config, {
    body,
    idempotencyKey: event.key,
  });

  state.handledEventKeys[event.key] = new Date().toISOString();
  pruneRunnerState(state);
  writeRunnerState(config.statePath, state);

  console.log(`Posted God Emperor A message for ${event.key}: ${body}`);
}

function readRunnerConfig() {
  const projectBaseUrl =
    process.env.PROJECT_A_GOD_BASE_URL?.trim() ||
    DEFAULT_PROJECT_A_GOD_BASE_URL;
  const ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.GOD_LLM_MODEL?.trim() || DEFAULT_GOD_LLM_MODEL;
  const secret = process.env.OPENCLAW_GOD_SHARED_SECRET?.trim();
  const statePath = resolve(
    process.env.GOD_RUNNER_STATE_PATH?.trim() || DEFAULT_STATE_PATH
  );

  if (!secret) {
    throw new Error("OPENCLAW_GOD_SHARED_SECRET is required.");
  }

  return {
    projectBaseUrl: trimTrailingSlash(projectBaseUrl),
    ollamaBaseUrl: trimTrailingSlash(ollamaBaseUrl),
    model,
    secret,
    statePath,
  };
}

async function fetchGodSnapshot(config: ReturnType<typeof readRunnerConfig>) {
  const response = await fetch(
    `${config.projectBaseUrl}/api/openclaw/god-snapshot`,
    {
      headers: {
        "x-openclaw-god-secret": config.secret,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Snapshot request failed with ${response.status}: ${await response.text()}`
    );
  }

  return (await response.json()) as RunnerSnapshot;
}

async function askOllama(
  config: ReturnType<typeof readRunnerConfig>,
  prompt: string
) {
  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      options: {
        temperature: 0.8,
        num_predict: 96,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama request failed with ${response.status}: ${await response.text()}`
    );
  }

  const payload = (await response.json()) as {
    message?: {
      content?: string;
    };
    response?: string;
  };

  return payload.message?.content ?? payload.response ?? "";
}

async function postGodChat(
  config: ReturnType<typeof readRunnerConfig>,
  payload: {
    body: string;
    idempotencyKey: string;
  }
) {
  const response = await fetch(`${config.projectBaseUrl}/api/openclaw/god-chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openclaw-god-secret": config.secret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `God chat request failed with ${response.status}: ${await response.text()}`
    );
  }
}

function readRunnerState(statePath: string): RunnerState {
  if (!existsSync(statePath)) {
    return {
      handledEventKeys: {},
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as RunnerState;

    return {
      handledEventKeys:
        parsed && typeof parsed.handledEventKeys === "object"
          ? parsed.handledEventKeys
          : {},
    };
  } catch {
    return {
      handledEventKeys: {},
    };
  }
}

function writeRunnerState(statePath: string, state: RunnerState) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function pruneRunnerState(state: RunnerState) {
  const entries = Object.entries(state.handledEventKeys)
    .sort((left, right) => right[1].localeCompare(left[1]))
    .slice(0, MAX_STORED_EVENTS);

  state.handledEventKeys = Object.fromEntries(entries);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  runGodRunner().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
