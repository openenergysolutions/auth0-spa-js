import { IdToken, User } from './global';

const keyPrefix = '@@auth0spajs@@';
const DEFAULT_EXPIRY_ADJUSTMENT_SECONDS = 0;

interface CacheKeyData {
  audience: string;
  scope: string;
  client_id: string;
}

export class CacheKey {
  public client_id: string;
  public scope: string;
  public audience: string;

  constructor(data: CacheKeyData, public prefix: string = keyPrefix) {
    this.client_id = data.client_id;
    this.scope = data.scope;
    this.audience = data.audience;
  }

  toKey(): string {
    return `${this.prefix}::${this.client_id}::${this.audience}::${this.scope}`;
  }

  static fromKey(key: string): CacheKey {
    const [prefix, client_id, audience, scope] = key.split('::');

    return new CacheKey({ client_id, scope, audience }, prefix);
  }
}

interface DecodedToken {
  claims: IdToken;
  user: User;
}

interface CacheEntry {
  id_token: string;
  access_token: string;
  expires_in: number;
  decodedToken: DecodedToken;
  audience: string;
  scope: string;
  client_id: string;
  refresh_token?: string;
}

export interface ICache {
  set(key: string, entry: unknown): Promise<void>;
  get(key: string): Promise<unknown>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

type WrappedCacheEntry = {
  body: Partial<CacheEntry>;
  expiresAt: number;
};

export class CacheManager {
  constructor(private cache: ICache) {}

  async get(
    cacheKey: CacheKey,
    expiryAdjustmentSeconds = DEFAULT_EXPIRY_ADJUSTMENT_SECONDS
  ): Promise<Partial<CacheEntry> | undefined> {
    const key = cacheKey.toKey();
    const wrappedEntry = (await this.cache.get(key)) as WrappedCacheEntry;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!wrappedEntry) return;

    if (wrappedEntry.expiresAt - expiryAdjustmentSeconds < nowSeconds) {
      if (wrappedEntry.body.refresh_token) {
        wrappedEntry.body = {
          refresh_token: wrappedEntry.body.refresh_token
        };

        await this.cache.set(key, wrappedEntry);
        return wrappedEntry.body;
      }

      await this.cache.remove(key);
      return;
    }

    return wrappedEntry.body;
  }

  set(entry: CacheEntry): Promise<void> {
    const cacheKey = new CacheKey({
      client_id: entry.client_id,
      scope: entry.scope,
      audience: entry.audience
    });

    const wrappedEntry = this.wrapCacheEntry(entry);

    return this.cache.set(cacheKey.toKey(), wrappedEntry);
  }

  clear(): Promise<void> {
    return this.cache.clear();
  }

  private wrapCacheEntry(entry: CacheEntry): WrappedCacheEntry {
    const expiresInTime = Math.floor(Date.now() / 1000) + entry.expires_in;

    const expirySeconds = Math.min(
      expiresInTime,
      entry.decodedToken.claims.exp
    );

    return {
      body: entry,
      expiresAt: expirySeconds
    };
  }
}

/**
 * Finds the corresponding key in the cache based on the provided cache key.
 * The keys inside the cache are in the format {prefix}::{client_id}::{audience}::{scope}.
 * The first key in the cache that satisfies the following conditions is returned
 *  - `prefix` is strict equal to Auth0's internally configured `keyPrefix`
 *  - `client_id` is strict equal to the `cacheKey.client_id`
 *  - `audience` is strict equal to the `cacheKey.audience`
 *  - `scope` contains at least all the `cacheKey.scope` values
 *  *
 * @param cacheKey The provided cache key
 * @param existingCacheKeys A list of existing cache keys
 */
const findExistingCacheKey = (
  cacheKey: CacheKey,
  existingCacheKeys: Array<string>
) => {
  const { client_id, audience, scope } = cacheKey;

  return existingCacheKeys.filter(key => {
    const {
      prefix: currentPrefix,
      client_id: currentClientId,
      audience: currentAudience,
      scope: currentScopes
    } = CacheKey.fromKey(key);

    const currentScopesArr = currentScopes && currentScopes.split(' ');

    const hasAllScopes =
      currentScopes &&
      scope
        .split(' ')
        .reduce(
          (acc, current) => acc && currentScopesArr.includes(current),
          true
        );

    return (
      currentPrefix === keyPrefix &&
      currentClientId === client_id &&
      currentAudience === audience &&
      hasAllScopes
    );
  })[0];
};

export class LocalStorageCache implements ICache {
  public set(key: string, entry: unknown): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(entry));
    return Promise.resolve();
  }

  public get(key: string): Promise<unknown> {
    return new Promise(resolve => {
      const cacheKey = CacheKey.fromKey(key);
      const payload = this.readJson(cacheKey);

      if (!payload) resolve(null);

      resolve(payload);
    });
  }

  public remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    return new Promise(resolve => {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        if (localStorage.key(i).startsWith(keyPrefix)) {
          localStorage.removeItem(localStorage.key(i));
        }
      }

      resolve();
    });
  }

  /**
   * Retrieves data from local storage and parses it into the correct format
   * @param cacheKey The cache key
   */
  private readJson(cacheKey: CacheKey): unknown {
    const existingCacheKey = findExistingCacheKey(
      cacheKey,
      Object.keys(window.localStorage)
    );
    const json =
      existingCacheKey && window.localStorage.getItem(existingCacheKey);

    let payload;

    if (!json) {
      return;
    }

    payload = JSON.parse(json);

    if (!payload) {
      return;
    }

    return payload;
  }
}
export class InMemoryCache {
  public enclosedCache: ICache = (function () {
    let cache: Record<string, unknown> = {};

    return {
      set(key: string, entry: unknown): Promise<void> {
        cache[key] = entry;
        return Promise.resolve();
      },

      get(key: string): Promise<Partial<CacheEntry> | undefined> {
        return new Promise(resolve => {
          const cacheKey = CacheKey.fromKey(key);

          const existingCacheKey = findExistingCacheKey(
            cacheKey,
            Object.keys(cache)
          );

          const cacheEntry = cache[existingCacheKey];

          if (!cacheEntry) {
            return resolve(null);
          }

          // if (wrappedEntry.expiresAt - expiryAdjustmentSeconds < nowSeconds) {
          //   if (wrappedEntry.body.refresh_token) {
          //     wrappedEntry.body = {
          //       refresh_token: wrappedEntry.body.refresh_token
          //     };

          //     return wrappedEntry.body;
          //   }

          //   delete cache[cacheKey.toKey()];

          //   return;
          // }

          resolve(cacheEntry);
        });
      },

      remove(key: string): Promise<void> {
        delete cache[key];
        return Promise.resolve();
      },

      clear(): Promise<void> {
        cache = {};
        return Promise.resolve();
      }
    };
  })();
}
