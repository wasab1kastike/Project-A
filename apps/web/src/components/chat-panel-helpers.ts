export type ChatMessageVariant = "default" | "own" | "system";

export function getChatMessageVariant({
  isCurrentUser,
  isSystem,
}: {
  isCurrentUser: boolean;
  isSystem: boolean;
}): ChatMessageVariant {
  if (isSystem) {
    return "system";
  }

  if (isCurrentUser) {
    return "own";
  }

  return "default";
}