/**
 * OpenSettingsLink — reusable CTA shown in widget empty-states when a missing
 * integration is the cause. Click dispatches `kira:openWidget` for the
 * Settings widget, which the CanvasShell intercepts.
 */
interface OpenSettingsLinkProps {
  label?: string;
  hint?: string;
}

export function OpenSettingsLink({ label = 'Apri Impostazioni', hint }: OpenSettingsLinkProps) {
  const open = () => {
    window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'settings' } }));
  };
  return (
    <div className="kc-open-settings">
      {hint && <span className="kc-open-settings-hint">{hint}</span>}
      <button type="button" className="kc-open-settings-btn" onClick={open}>
        ⚙ {label} →
      </button>
    </div>
  );
}
