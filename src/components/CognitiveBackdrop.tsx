export function CognitiveBackdrop({ active }: { active: boolean }) {
  return (
    <div className={`cognitive-backdrop ${active ? 'cognitive-backdrop-active' : ''}`} aria-hidden="true">
      <div className="cognitive-backdrop-core" />
      <div className="cognitive-backdrop-dust" />
    </div>
  );
}
