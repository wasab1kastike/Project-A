import { fileURLToPath } from "node:url";
import { runGameTick, TickRunnerError, type TickSummary } from "./tick";

export function formatTickSummary(summary: TickSummary) {
  return [
    `Registration restarted: ${summary.restartedRegistrationCycles}`,
    `Testing cycles started: ${summary.testingCyclesStarted}`,
    `Testing cycles completed: ${summary.testingCyclesCompleted}`,
    `Cycles activated: ${summary.activatedCycles}`,
    `Cycles resolved: ${summary.resolvedCycles}`,
    `Community wish votes resolved: ${summary.resolvedCommunityWishVotes}`,
    `Next registration cycles created: ${summary.nextRegistrationCyclesCreated}`,
    `Minutes processed: ${summary.processedMinutes}`,
    `Catch-up minutes deferred: ${summary.skippedCatchUpMinutes ?? 0}`,
    `Score events created: ${summary.scoreEventsCreated}`,
    `Attack units launched: ${summary.launchedAttackUnits}`,
    `Attack units resolved: ${summary.resolvedAttackUnits}`,
  ].join("\n");
}

export function formatTickRunnerError(error: unknown) {
  if (error instanceof TickRunnerError) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const payload = {
      event: "tick-run-failed",
      stage: error.stage,
      cycleId: error.cycleId ?? null,
      tickAt: error.tickAt?.toISOString() ?? null,
      now: error.now.toISOString(),
      message: error.message,
      cause: cause instanceof Error ? cause.message : String(cause),
    };

    return JSON.stringify(payload);
  }

  if (error instanceof Error) {
    return JSON.stringify({
      event: "tick-run-failed",
      stage: "unknown",
      message: error.message,
    });
  }

  return JSON.stringify({
    event: "tick-run-failed",
    stage: "unknown",
    message: String(error),
  });
}

async function main() {
  console.log(
    JSON.stringify({
      event: "tick-run-started",
      at: new Date().toISOString(),
    })
  );

  const summary = await runGameTick();

  console.log(formatTickSummary(summary));
  console.log(
    JSON.stringify({
      event: "tick-run-finished",
      ...summary,
    })
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(formatTickRunnerError(error));
    process.exitCode = 1;
  });
}
