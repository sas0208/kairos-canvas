export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('file', audio, `kira-${Date.now()}.webm`);

  let response: Response;
  try {
    response = await fetch('/api/stt', { method: 'POST', body: form, signal });
  } catch (e) {
    throw e instanceof Error ? e : new Error('Trascrizione non raggiungibile');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Trascrizione non riuscita' })) as {
      error?: string;
      code?: string;
      fallback?: string;
    };
    if (data.code === 'whisper_unreachable') {
      throw new Error('Whisper locale non risponde. Lancia scripts/whisper-server.py, oppure usa la dettatura del browser (icona microfono nel composer).');
    }
    if (data.code === 'whisper_error') {
      // errore interno di Whisper (non di rete): mostra il dettaglio vero
      throw new Error(data.error || 'Whisper ha avuto un errore interno durante la trascrizione.');
    }
    throw new Error(data.error || 'Trascrizione non riuscita');
  }

  const data = await response.json() as { text?: string };
  return data.text?.trim() || '';
}
