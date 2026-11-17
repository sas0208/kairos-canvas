export function ThinkingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kira-blue" />
      Kira sta ragionando
    </div>
  );
}
