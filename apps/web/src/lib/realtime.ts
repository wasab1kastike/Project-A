export const PROJECT_A_REFRESH_EVENT = "project-a:refresh";

type ProjectARealtimeBridge = {
  emitRefresh: (reason?: string) => void;
};

declare global {
  var __projectARealtime: ProjectARealtimeBridge | undefined;
}

export function emitProjectARefresh(reason = "server-action") {
  globalThis.__projectARealtime?.emitRefresh(reason);
}
