import { sendChatMessageAction } from "@/app/game-actions";
import { ChatMessageList } from "./chat-message-list";
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
    body: string;
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
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.label}>Global chat</span>
        <h2>Cycle comms</h2>
        <p>
          Signed-in users can post. Guests are read-only.
        </p>
      </div>

      <ChatMessageList hasMessages={messages.length > 0}>
        {messages.length === 0 ? (
          <p className={styles.emptyState}>
            No messages yet. Start the channel.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={message.isCurrentUser ? styles.ownMessage : styles.message}
            >
              <div className={styles.messageMeta}>
                <strong>{message.authorName}</strong>
                <span>{messageFormatter.format(message.createdAt)}</span>
              </div>
              <p>{message.body}</p>
            </article>
          ))
        )}
      </ChatMessageList>

      {canPost ? (
        <form action={sendChatMessageAction} className={styles.form}>
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
          <div className={styles.formFooter}>
            <p>Max {maxLength} characters. Limit: 6 messages/min.</p>
            <button className={styles.primaryButton} type="submit">
              Send message
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.readOnlyHint}>{postHint}</p>
      )}
    </div>
  );
}
