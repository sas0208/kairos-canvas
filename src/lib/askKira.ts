// Bridge widget → chat: popola il composer KiraCore con un prompt pre-fatto e
// apre il ChatWidget. Usato dai widget per dare all'utente un "Ask Kira →" su
// qualunque card senza dover copia-incollare.

export interface AskKiraOptions {
  /** Prompt da inviare. Se omesso, viene solo aperta la chat. */
  prompt?: string;
  /** Se true (default), invia subito. Se false, popola il composer per editing. */
  send?: boolean;
  /** Widget aggiuntivo da aprire accanto (es. il widget di origine). */
  alsoOpen?: string;
}

/**
 * Apre il ChatWidget e (opzionalmente) invia un prompt a Kira.
 *
 * Flow:
 * 1. Dispatch `kira:openWidget` per aprire/riportare il ChatWidget
 * 2. Se `send=true` + prompt presente → dispatch `kira:userSend` (lo intercetta App.tsx → handleSend)
 * 3. Se `send=false` + prompt → dispatch `kira:composerFill` (handled by KiraCore composer)
 */
export function askKira(input: AskKiraOptions | string): void {
  const opts: AskKiraOptions = typeof input === 'string' ? { prompt: input, send: true } : input;
  const send = opts.send ?? true;

  window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'chat' } }));
  if (opts.alsoOpen) {
    window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: opts.alsoOpen } }));
  }

  if (!opts.prompt) return;

  // Defer slightly so ChatWidget mounts before receiving the input.
  window.setTimeout(() => {
    if (send) {
      window.dispatchEvent(new CustomEvent('kira:userSend', { detail: { text: opts.prompt } }));
    } else {
      window.dispatchEvent(new CustomEvent('kira:composerFill', { detail: { text: opts.prompt } }));
    }
  }, 120);
}

/** Builder per prompt comuni dai widget. */
export const askPrompts = {
  coachExplain: (title: string, body: string) =>
    `Spiegami meglio questa raccomandazione del coach e dimmi cosa fare concretamente oggi:\n\n**${title}**\n${body}`,
  memoryDiscuss: (title: string, content: string) =>
    `Voglio parlare di questa cosa che ricordi su di me:\n\n**${title}**\n${content}\n\nCosa ne pensi? Aggiungi contesto o suggerimenti.`,
  calendarBrief: (title: string, when: string) =>
    `Preparami per questo appuntamento:\n\n**${title}**\n${when}\n\nCosa devo sapere/portare/considerare?`,
  noteExpand: (title: string, content: string) =>
    `Ho preso questa nota. Aiutami ad ampliarla o trasformarla in qualcosa di utile:\n\n**${title}**\n${content}`,
  generic: (subject: string) =>
    `Parlami di: ${subject}`,
};
