import type { ChatMessage } from '../types/chat';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

export function ChatPanel(props: {
  messages: ChatMessage[];
  isThinking: boolean;
  error: string;
  canSend: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onClear: () => void;
  onOpenVoice: () => void;
}) {
  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col md:min-h-screen">
      <div className="fixed right-4 top-16 z-30 flex items-center gap-2 md:right-8 md:top-6">
        {props.error ? <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">{props.error}</div> : null}
        <button className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 transition hover:text-white" onClick={props.onClear}>
          Cancella chat
        </button>
      </div>
      <MessageList messages={props.messages} isThinking={props.isThinking} />
      <MessageComposer disabled={!props.canSend} isThinking={props.isThinking} onSend={props.onSend} onStop={props.onStop} onOpenVoice={props.onOpenVoice} />
    </div>
  );
}
