export type AgentIntentResponse = {
  handled: boolean;
  reply: string;
  taskId?: string;
  jobId?: string;
  agent?: string;
  permissionLevel?: string;
  handoffPath?: string;
  executionMode?: string;
};

const AGENT_INTENT_PATTERNS = [
  /\bdi\s+a\s+opencode\b/i,
  /\bfai\s+fare\s+a\s+opencode\b/i,
  /\bchiedi\s+a\s+opencode\b/i,
  /\bcrea\s+(un\s+)?task\s+per\s+opencode\b/i,
  /\bdi\s+a\s+openclaw\b/i,
  /\bfai\s+fare\s+a\s+openclaw\b/i,
  /\bchiedi\s+a\s+openclaw\b/i,
  /\bcrea\s+(un\s+)?task\s+agente\b/i,
  /\bmanda\s+(un\s+)?report\s+discord\b/i,
  /\bcrea\s+(un\s+)?ciclo\s+operatore\b/i,
  /\bkira[,\s]+(modifica|migliora|sistema|correggi|ottimizza|esegui|avvia|builda|testa|analizza|aggiungi|controlla)\b/i,
  /\bkira\s+fai\s+controllare\b/i,
  /\b(avvia|esegui)\s+(build|audit|task|lavoro\s+notturno)\b/i,
  /\b(openCode|openclaw)\b/i,
  /\bkira\s+(aggiorna|controlla|manda|usa)\b/i,
  /\b(file\s+modificati|git\s+status|qwen|sistema\s+un\s+bug|controlla\s+se\s+compili|compili|lavoro\s+notturno|ui\s+grafica)\b/i,
  /\bkira\s+(cambia|aggiungi|continua|ferma|approva|rifiuta|blocca|metti in pausa)\b/i,
  /\b(cosa\s+stanno\s+facendo\s+gli\s+agenti|stato\s+agenti|approva\s+il\s+job|approva\s+job|rifiuta\s+job|ferma\s+tutto|continua\s+il\s+lavoro)\b/i,
  /\b(voce\s+di\s+kira|voice\s+agent|piper|tts|stt|sezione\s+meteo|particle\s+core|particelle|security\s+agent|tester\s+agent|tester\b|coding\s+loop)\b/i,
  /^\s*(approva|s[iì]|si|ok|procedi|autorizza|annulla|no|rifiuta|blocca)\s*$/i,
  /\b(salva questa decisione in memoria|ricorda questa decisione)\b/i,
];

export function looksLikeAgentIntent(content: string) {
  return AGENT_INTENT_PATTERNS.some((pattern) => pattern.test(content));
}

export async function createAgentIntentTask(message: string, signal?: AbortSignal) {
  const response = await fetch('/api/chat/agent-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });
  const data = await response.json().catch(() => ({ handled: true, reply: 'Errore creazione task Agent Hub.' })) as AgentIntentResponse;

  if (!response.ok) {
    throw new Error(data.reply || 'Errore creazione task Agent Hub');
  }

  return data;
}
