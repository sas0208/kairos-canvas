/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'false' disattiva la modalità demo (default: attiva). */
  readonly VITE_DEMO?: string;
  /** URL assoluto del backend (es. http://localhost:8787) usato quando VITE_DEMO=false. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
