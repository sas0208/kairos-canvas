// SentenceBuffer frontend — accumula token e restituisce frasi complete per il TTS.
// Accumula token in streaming e emette frasi complete per TTS immediato.

export class SentenceBuffer {
  private buffer = '';
  private readonly minLength: number;
  private static readonly ENDINGS = /([.!?;])\s+|([.!?;])\s*$/;

  constructor(options?: { minLength?: number }) {
    this.minLength = options?.minLength ?? 12;
  }

  add(chunk: string): string[] {
    this.buffer += chunk;
    const sentences: string[] = [];

    while (true) {
      const match = SentenceBuffer.ENDINGS.exec(this.buffer);
      if (!match) break;
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(0, end).trim();
      if (sentence.length >= this.minLength) {
        sentences.push(sentence);
      } else if (sentences.length > 0) {
        sentences[sentences.length - 1] += ' ' + sentence;
      }
      this.buffer = this.buffer.slice(end);
    }

    if (this.buffer.includes('\n\n')) {
      const parts = this.buffer.split('\n\n');
      for (let i = 0; i < parts.length - 1; i++) {
        const s = parts[i].trim();
        if (s.length >= this.minLength) sentences.push(s);
        else if (sentences.length > 0) sentences[sentences.length - 1] += ' ' + s;
      }
      this.buffer = parts[parts.length - 1];
    }

    return sentences;
  }

  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining.length >= 3 ? remaining : null;
  }

  reset(): void {
    this.buffer = '';
  }
}

/** Rimuove markdown per parlato più pulito. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+>]\s+/gm, '')
    .replace(/[•●◆◇◈⬡⊙]+/g, '')
    .replace(/([!?.,;:])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Coda TTS: esegue speak richieste in sequenza. */
export class TtsQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private stopped = false;

  enqueue(task: () => Promise<void>): void {
    if (this.stopped) return;
    this.queue.push(task);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0 && !this.stopped) {
      const task = this.queue.shift()!;
      try { await task(); } catch { /* task individuale fallita, continua */ }
    }
    this.running = false;
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.running = false;
  }

  reset(): void {
    this.stopped = false;
    this.queue = [];
    this.running = false;
  }

  get size(): number { return this.queue.length; }
  get isRunning(): boolean { return this.running; }
}
