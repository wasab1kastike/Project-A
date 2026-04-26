import { sendChatMessageAction } from "@/app/game-actions";
import { ChatMessageList } from "./chat-message-list";
import { GiphyGifPicker } from "./giphy-gif-picker";
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
  function renderMessages(
    sourceMessages: ChatPanelProps["messages"]
  ) {
    return sourceMessages.map((message) => (
      <article
        key={message.id}
        className={message.isCurrentUser ? styles.ownMessage : styles.message}
      >
        <div className={styles.messageMeta}>
          <strong>{message.authorName}</strong>
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
    ));
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.label}>Global chat</span>
        <h2>Cycle comms</h2>
        <p>Signed-in users can post. Guests are read-only.</p>
      </div>

      <ChatMessageList hasMessages={messages.length > 0}>
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
            action={sendChatMessageAction}
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
          </form>
          <div className={styles.formFooter}>
            <p>Max {maxLength} characters. Limit: 6 messages/min.</p>
            <div className={styles.composerActions}>
              <GiphyGifPicker />
              <button
                className={styles.primaryButton}
                form="chat-text-message-form"
                type="submit"
              >
                Send message
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
