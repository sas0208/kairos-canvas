import { USER_NAME } from '../config/user';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types/chat';
import { EmptyState } from './EmptyState';
import { ThinkingIndicator } from './ThinkingIndicator';

export function MessageList({ messages, isThinking }: { messages: ChatMessage[]; isThinking: boolean }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    function onScroll() {
      stickyRef.current = document.documentElement.scrollHeight - window.innerHeight - window.scrollY < 180;
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stickyRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: isThinking ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, lastMessage?.content, isThinking]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center px-4 pt-8 md:min-h-[52vh] md:pt-28">
        <EmptyState />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', width: '100%', padding: '40px 24px 144px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <article key={message.id} style={{
            maxWidth: isUser ? '85%' : '92%',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            borderRadius: isUser ? '1.2rem 1.2rem 0.3rem 1.2rem' : '1.2rem 1.2rem 1.2rem 0.3rem',
            padding: '12px 16px',
            border: `1px solid ${isUser ? 'rgba(255,255,255,0.1)' : 'rgba(125,211,252,0.15)'}`,
            background: isUser ? 'rgba(255,255,255,0.06)' : 'rgba(8,20,40,0.85)',
            backdropFilter: 'blur(12px)',
            boxShadow: isUser ? 'none' : '0 0 32px rgba(169,201,255,0.07)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: isUser ? 'rgba(255,255,255,0.35)' : 'rgba(125,211,252,0.55)' }}>
                {isUser ? USER_NAME : 'Kira'}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>
                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.82)', margin: 0 }}>
              {message.content || '...'}
            </p>
          </article>
        );
      })}
      {isThinking ? <ThinkingIndicator /> : null}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
