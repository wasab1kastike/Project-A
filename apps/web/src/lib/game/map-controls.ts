export type MapViewKeyboardAction = "zoom-in" | "zoom-out" | "reset-view";

export const MAP_VIEW_CONTROL_LABELS = {
  group: "Map view",
  reset: "Reset view",
  resetTitle: "Reset map view (0)",
  focusOwnFortress: "Focus my fortress",
  focusOwnFortressTitle: "Center map on my fortress",
} as const;

const MAP_VIEW_KEY_BINDINGS: Record<
  MapViewKeyboardAction,
  readonly string[]
> = {
  "zoom-in": ["+", "=", "NumpadAdd"],
  "zoom-out": ["-", "NumpadSubtract"],
  "reset-view": ["0", "Digit0", "Numpad0"],
};

export function getMapViewKeyboardAction(input: {
  key: string;
  code?: string;
}): MapViewKeyboardAction | null {
  const candidates = new Set([input.key, input.code].filter(Boolean));

  for (const [action, bindings] of Object.entries(MAP_VIEW_KEY_BINDINGS)) {
    if (bindings.some((binding) => candidates.has(binding))) {
      return action as MapViewKeyboardAction;
    }
  }

  return null;
}
