"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendChatMessageAction } from "@/app/game-actions";
import { ChatMessageList } from "./chat-message-list";
import { GiphyGifPicker } from "./giphy-gif-picker";
import { getChatMessageVariant } from "./chat-panel-helpers";
import styles from "./chat-panel.module.css";

const messageFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  day: "numeric",
});

type ChatPanelProps = {
  messages: Array<{
    id: string;
    type: "TEXT" | "GIF";
    body: string;
    gif: {
      provider: string;
      providerId: string;
      title: string;
      previewUrl: string;
      displayUrl: string;
      width: number;
      height: number;
      sourceUrl: string;
    } | null;
    createdAt: Date;
    authorName: string;
    isCurrentUser: boolean;
    isSystem: boolean;
  }>;
  canPost: boolean;
  maxLength: number;
  postHint: string | null;
  authorName: string;
};

export function ChatPanel({
  messages,
  canPost,
  maxLength,
  postHint,
  authorName,
}: ChatPanelProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<
    ChatPanelProps["messages"]
  >([]);

  // Once the server data updates (after router.refresh), clear the optimistic messages.
  useEffect(() => {
    if (pendingMessages.length > 0) {
      setPendingMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const displayMessages = [...messages, ...pendingMessages];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = textareaRef.current?.value?.trim();
    if (!body || isPending) return;

    // Show message instantly.
    setPendingMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        type: "TEXT",
        body,
        gif: null,
        createdAt: new Date(),
        authorName,
        isCurrentUser: true,
        isSystem: false,
      },
    ]);
    if (textareaRef.current) textareaRef.current.value = "";
    setError(null);

    const formData = new FormData();
    formData.set("body", body);

    startTransition(async () => {
      const result = await sendChatMessageAction(null, formData);
      if (result.ok) {
        router.refresh();
      } else {
        setPendingMessages([]);
        if (textareaRef.current) textareaRef.current.value = body;
        setError(result.error);
      }
    });
  }

  function renderMessages(sourceMessages: ChatPanelProps["messages"]) {
    return sourceMessages.map((message) => {
      const variant = getChatMessageVariant(message);

      return (
        <article
          key={message.id}
          className={
            variant === "system"
              ? styles.systemMessage
              : variant === "own"
                ? styles.ownMessage
                : styles.message
          }
        >
          <div className={styles.messageMeta}>
            {message.isSystem ? (
              <span className={styles.systemLabel}>System</span>
            ) : (
              <strong>{message.authorName}</strong>
            )}
            <span>{messageFormatter.format(message.createdAt)}</span>
          </div>
          {message.type === "GIF" && message.gif ? (
            <div className={styles.gifMessage}>
              <img
                src={message.gif.displayUrl}
                alt={message.gif.title}
                width={message.gif.width}
                height={message.gif.height}
                loading="lazy"
              />
              <a href={message.gif.sourceUrl} target="_blank" rel="noreferrer">
                View on GIPHY
              </a>
            </div>
          ) : (
            <p>{message.body}</p>
          )}
        </article>
      );
    });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.label}>Global chat</span>
        <h2>Cycle comms</h2>
        <p>Signed-in users can post. Guests are read-only.</p>
      </div>

      <ChatMessageList messageCount={displayMessages.length}>
        {displayMessages.length === 0 ? (
          <p className={styles.emptyState}>
            No messages yet. Start the channel.
          </p>
        ) : (
          renderMessages(displayMessages)
        )}
      </ChatMessageList>

      {canPost ? (
        <div className={styles.form}>
          <form
            onSubmit={handleSubmit}
            id="chat-text-message-form"
            className={styles.textForm}
          >
            <label className={styles.field}>
              <span>Message</span>
              <textarea
                ref={textareaRef}
                name="body"
                rows={3}
                maxLength={maxLength}
                placeholder="Broadcast to the whole cycle"
                required
              />
            </label>
            {error ? (
              <p className={styles.formError}>{error}</p>
            ) : null}
          </form>
          <div className={styles.formFooter}>
            <p>Max {maxLength} characters. Limit: 6 messages/min.</p>
            <div className={styles.composerActions}>
              <GiphyGifPicker onSent={() => router.refresh()} />
              <button
                className={styles.primaryButton}
                form="chat-text-message-form"
                type="submit"
                disabled={isPending}
              >
                {isPending ? "Sending…" : "Send message"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.readOnlyHint}>{postHint}</p>
      )}
    </div>
  );
}
