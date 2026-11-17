import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { WidgetSpinner } from '../components/WidgetStates';

interface GpuStatus {
  available: boolean;
  name?: string;
  totalMiB?: number;
  usedMiB?: number;
  freeMiB?: number;
  error?: string;
}
interface ReclaimableApp { id: string; label: string; defaultOn: boolean; running: boolean; note?: string }
interface TurboAutoConfig { auto: boolean; thresholdMiB: number }
interface TurboStatus { active: boolean; gpu: GpuStatus; apps: ReclaimableApp[]; lastClosed: string[]; platformSupported: boolean; auto: TurboAutoConfig }
interface EnableResult {
  ok: boolean; closed: string[]; failed: string[];
  vramBeforeMiB?: number; vramAfterMiB?: number; vramFreedMiB?: number;
  powerPlan: 'high' | 'unchanged'; error?: string;
}

export function TurboWidget() {
  const toast = useToast();
  const [status, setStatus] = useState<TurboStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetch('/api/system/turbo/status').then((r) => r.json()).catch(() => null) as TurboStatus | null;
      setStatus(s);
      // Pre-seleziona le app default-on e in esecuzione, finché l'utente non tocca.
      if (s && !touched) {
        setSelected(new Set(s.apps.filter((a) => a.defaultOn && a.running).map((a) => a.id)));
      }
    } finally { setLoading(false); }
  }, [touched]);

  useEffect(() => { void load(); const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]);

  const toggle = useCallback((id: string) => {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const enable = useCallback(async () => {
    const targets = [...selected];
    if (targets.length === 0 || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/system/turbo/enable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets }),
      });
      const d = await r.json().catch(() => null) as EnableResult | null;
      if (d?.ok) {
        const freed = d.vramFreedMiB != null ? `${d.vramFreedMiB} MiB VRAM liberati` : 'VRAM liberata';
        toast.success(`Turbo attivo — ${d.closed.length} app chiuse, ${freed}`);
        if (d.failed.length) toast.error(`Non chiuse: ${d.failed.join(', ')}`);
      } else toast.error(d?.error || 'Turbo fallito');
    } catch { toast.error('Errore Turbo'); }
    finally { setBusy(false); setTouched(false); void load(); }
  }, [selected, busy, toast, load]);

  const toggleAuto = useCallback(async () => {
    if (busy || !status) return;
    const nextAuto = !status.auto.auto;
    setStatus({ ...status, auto: { ...status.auto, auto: nextAuto } }); // ottimistico
    try {
      await fetch('/api/system/turbo/auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: nextAuto }),
      });
      toast.success(nextAuto ? 'Auto-Turbo attivo — libera la VRAM da solo quando si stringe' : 'Auto-Turbo disattivato');
    } catch { toast.error('Errore'); void load(); }
  }, [busy, status, toast, load]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/system/turbo/disable', { method: 'POST' });
      toast.success('Turbo disattivato — power plan ripristinato');
    } catch { toast.error('Errore'); }
    finally { setBusy(false); void load(); }
  }, [busy, toast, load]);

  const gauge = useMemo(() => {
    const g = status?.gpu;
    if (!g?.available || g.totalMiB == null || g.usedMiB == null) return null;
    const pct = Math.min(100, Math.round((g.usedMiB / g.totalMiB) * 100));
    return { pct, used: g.usedMiB, total: g.totalMiB, free: g.freeMiB ?? g.totalMiB - g.usedMiB };
  }, [status]);

  if (loading && !status) return <WidgetSpinner label="Stato GPU…" fullHeight />;

  if (status && !status.platformSupported) {
    return <div className="kc-w-turbo"><div className="kc-w-turbo-empty">Turbo è disponibile solo su Windows.</div></div>;
  }

  const runningApps = status?.apps.filter((a) => a.running) ?? [];
  const idleApps = status?.apps.filter((a) => !a.running) ?? [];
  const gpuName = status?.gpu.name;

  return (
    <div className="kc-w-turbo">
      <div className="kc-w-turbo-head">
        <span className={`kc-w-turbo-dot ${status?.active ? 'kc-w-turbo-dot-on' : ''}`} aria-hidden />
        <span className="kc-w-turbo-title">Turbo {status?.active ? '· attivo' : ''}</span>
        <button type="button" className="kc-w-turbo-refresh" onClick={() => void load()} title="Aggiorna" aria-label="Aggiorna">↻</button>
      </div>

      {gauge ? (
        <div className="kc-w-turbo-gpu">
          <div className="kc-w-turbo-gpu-top">
            <span className="kc-w-turbo-gpu-name">{gpuName}</span>
            <span className="kc-w-turbo-gpu-val">{(gauge.free / 1024).toFixed(1)} GB liberi</span>
          </div>
          <div className="kc-w-turbo-bar">
            <div
              className={`kc-w-turbo-bar-fill ${gauge.pct > 85 ? 'kc-w-turbo-bar-hot' : ''}`}
              style={{ width: `${gauge.pct}%` }}
            />
          </div>
          <div className="kc-w-turbo-gpu-sub">{(gauge.used / 1024).toFixed(1)} / {(gauge.total / 1024).toFixed(1)} GB VRAM usata</div>
        </div>
      ) : (
        <div className="kc-w-turbo-empty">{status?.gpu.error || 'GPU non leggibile'}</div>
      )}

      <div className="kc-w-turbo-section">Chiudibili ora ({runningApps.length})</div>
      {runningApps.length === 0 && <div className="kc-w-turbo-empty">Niente di superfluo in esecuzione. 👌</div>}
      {runningApps.map((a) => (
        <label key={a.id} className="kc-w-turbo-app">
          <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} disabled={busy} />
          <span className="kc-w-turbo-app-label">{a.label}</span>
          {a.note && <span className="kc-w-turbo-app-note" title={a.note}>ⓘ</span>}
        </label>
      ))}

      {idleApps.length > 0 && (
        <details className="kc-w-turbo-idle">
          <summary>Non in esecuzione ({idleApps.length})</summary>
          {idleApps.map((a) => <div key={a.id} className="kc-w-turbo-app-off">{a.label}</div>)}
        </details>
      )}

      <div className="kc-w-turbo-actions">
        <button
          type="button"
          className="kc-w-turbo-go"
          onClick={() => void enable()}
          disabled={busy || selected.size === 0}
        >
          {busy ? '…' : `⚡ Attiva Turbo (${selected.size})`}
        </button>
        {status?.active && (
          <button type="button" className="kc-w-turbo-off" onClick={() => void disable()} disabled={busy}>
            Ripristina
          </button>
        )}
      </div>
      {status && (
        <label className="kc-w-turbo-auto">
          <input type="checkbox" checked={status.auto.auto} onChange={() => void toggleAuto()} disabled={busy} />
          <span className="kc-w-turbo-auto-label">Auto — libera da solo sotto {(status.auto.thresholdMiB / 1024).toFixed(1)} GB liberi</span>
        </label>
      )}

      <div className="kc-w-turbo-hint">Chiude le app selezionate + power plan prestazioni. Le riapri quando vuoi.</div>
    </div>
  );
}
