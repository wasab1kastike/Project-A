"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

import styles from "./chat-panel.module.css";

type ChatMessageListProps = {
  children: ReactNode;
  messageCount: number;
};

export function ChatMessageList({
  children,
  messageCount,
}: ChatMessageListProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(messageCount);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    const isInitialRender = prevCountRef.current === messageCount;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;

    if (isInitialRender || isNearBottom) {
      el.scrollTop = el.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }

    prevCountRef.current = messageCount;
  }, [messageCount]);

  return (
    <div className={styles.messages} ref={messagesRef}>
      {children}
      <div
        aria-hidden="true"
        className={styles.messagesEnd}
        ref={messagesEndRef}
      />
    </div>
  );
}
