"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

import styles from "./chat-panel.module.css";

type ChatMessageListProps = {
  children: ReactNode;
  hasMessages: boolean;
};

export function ChatMessageList({
  children,
  hasMessages,
}: ChatMessageListProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollOnMountRef = useRef(hasMessages);

  useLayoutEffect(() => {
    if (!shouldScrollOnMountRef.current) {
      return;
    }

    const messagesElement = messagesRef.current;

    if (messagesElement) {
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, []);

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
