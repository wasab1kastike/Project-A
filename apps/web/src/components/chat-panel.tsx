"use client";

import { useActionState, useEffect, useRef } from "react";
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
};

export function ChatPanel({
  messages,
  canPost,
  maxLength,
  postHint,
}: ChatPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(sendChatMessageAction, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  function renderMessages(
    sourceMessages: ChatPanelProps["messages"]
  ) {
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

      <ChatMessageList messageCount={messages.length}>
        {messages.length === 0 ? (
          <p className={styles.emptyState}>
            No messages yet. Start the channel.
          </p>
        ) : (
          renderMessages(messages)
        )}
      </ChatMessageList>

      {canPost ? (
        <div className={styles.form}>
          <form
            ref={formRef}
            action={formAction}
            id="chat-text-message-form"
            className={styles.textForm}
          >
            <label className={styles.field}>
              <span>Message</span>
              <textarea
                name="body"
                rows={3}
                maxLength={maxLength}
                placeholder="Broadcast to the whole cycle"
                required
              />
            </label>
            {state?.ok === false ? (
              <p className={styles.formError}>{state.error}</p>
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
