// Minimal in-memory rate limiter (per-process; resets on restart, which is
// fine for its purpose of curbing feedback spam).
const lastHit: Map<string, number> = new Map();

const MAX_TRACKED_KEYS = 10_000;

export function isRateLimited(key: string, windowMs: number): boolean {
  const now = Date.now();
  const previous = lastHit.get(key);

  if (previous !== undefined && now - previous < windowMs) {
    return true;
  }

  // Opportunistic prune so the map cannot grow unbounded
  if (lastHit.size >= MAX_TRACKED_KEYS) {
    for (const [k, t] of lastHit) {
      if (now - t >= windowMs) {
        lastHit.delete(k);
      }
    }
  }

  lastHit.set(key, now);
  return false;
}
