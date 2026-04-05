/**
 * Generic in-memory TTL cache with stale-while-revalidate support.
 *
 * Entries are NOT evicted on expiry — they remain available as stale
 * so callers can serve stale data when upstream is unavailable.
 */

interface CacheEntry<T> {
  value: T;
  setAt: number;
  expiresAt: number;
}

export interface CacheResult<T> {
  value: T;
  /** True if within TTL */
  hit: boolean;
  /** True if TTL has expired */
  stale: boolean;
  /** Age of the cached entry in milliseconds */
  ageMs: number;
}

export class MemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  /**
   * Returns the cached value if within TTL.
   * Returns null if no entry exists.
   * Returns stale result (hit=false, stale=true) if TTL expired.
   */
  get(key: string): CacheResult<T> | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const now = Date.now();
    const ageMs = now - entry.setAt;
    const stale = now > entry.expiresAt;

    return { value: entry.value, hit: !stale, stale, ageMs };
  }

  /**
   * Store a value with a TTL.
   * Overwrites any existing entry for the same key.
   */
  set(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    this.store.set(key, { value, setAt: now, expiresAt: now + ttlMs });
  }

  /** Remove an entry (e.g. to force re-fetch). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Returns true if a non-stale entry exists. */
  isValid(key: string): boolean {
    const r = this.get(key);
    return r !== null && r.hit;
  }
}
