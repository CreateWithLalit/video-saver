export function StageIndicator({ stage }: { stage: string }) {
  return (
    <p className="muted" aria-live="polite">
      Stage: {stage}
    </p>
  );
}
