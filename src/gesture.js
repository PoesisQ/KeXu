const SAMPLE_WINDOW_MS = 90;

export function pointerVelocity(samples, axis) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const latest = samples.at(-1);
  const earliest = [...samples].reverse().find((sample) => latest.time - sample.time >= SAMPLE_WINDOW_MS) || samples[0];
  const elapsed = Math.max(1, latest.time - earliest.time);
  return (latest[axis] - earliest[axis]) / elapsed;
}

export function resolveWeekSwipe({ offset, velocity, width, canPrevious, canNext }) {
  const projected = offset + velocity * 220;
  const threshold = Math.min(24, width * 0.06);
  if (Math.abs(projected) < threshold) return 0;
  const direction = projected < 0 ? 1 : -1;
  if ((direction < 0 && !canPrevious) || (direction > 0 && !canNext)) return 0;
  return direction;
}

export function verticalMomentumDistance(velocity) {
  if (Math.abs(velocity) < 0.16) return 0;
  const distance = velocity * (210 + Math.min(150, Math.abs(velocity) * 70));
  return Math.sign(distance) * Math.min(560, Math.abs(distance));
}
