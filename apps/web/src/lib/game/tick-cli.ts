import { runGameTick } from "./tick";

async function main() {
  const summary = await runGameTick();

  console.log(
    [
      `Registration restarted: ${summary.restartedRegistrationCycles}`,
      `Cycles activated: ${summary.activatedCycles}`,
      `Minutes processed: ${summary.processedMinutes}`,
      `Score events created: ${summary.scoreEventsCreated}`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
