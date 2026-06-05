const TTL = 45_000;

type FixtureCacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, FixtureCacheEntry<unknown>>();

export const fixtureCache = {
  get<T>(key: string): T | null {
    const entry = store.get(key) as FixtureCacheEntry<T> | undefined;
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.data;
  },
  set<T>(key: string, data: T): void {
    store.set(key, { data, expiresAt: Date.now() + TTL });
  },
};
