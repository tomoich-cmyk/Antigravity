/**
 * J-Quants token lifecycle management.
 *
 * Auth flow:
 *   1. POST /v1/token/auth_user  (email + password) → refreshToken (valid ~1 week)
 *   2. POST /v1/token/auth_refresh (refreshToken)   → idToken     (valid 24h)
 *
 * This module caches both tokens in memory and transparently handles refresh.
 * Only one auth flow runs at a time (guarded by a pending promise).
 */

const JQUANTS_BASE = 'https://api.jquants.com/v1';

/** Refresh idToken 5 minutes before actual expiry */
const ID_TOKEN_BUFFER_MS = 5 * 60 * 1000;

/** Treat idToken as valid for 23h (actual TTL is 24h) */
const ID_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

interface TokenState {
  refreshToken: string | null;
  idToken: string | null;
  idTokenExpiresAt: number;
}

const _state: TokenState = {
  refreshToken: null,
  idToken: null,
  idTokenExpiresAt: 0,
};

// Prevents concurrent auth flows
let _pendingAuth: Promise<string> | null = null;

/** Returns a valid idToken, refreshing or re-authenticating as needed. */
export async function getIdToken(): Promise<string> {
  if (_pendingAuth) return _pendingAuth;

  // Fast path: cached idToken still valid
  if (_state.idToken && Date.now() < _state.idTokenExpiresAt - ID_TOKEN_BUFFER_MS) {
    return _state.idToken;
  }

  _pendingAuth = _acquireToken().finally(() => {
    _pendingAuth = null;
  });

  return _pendingAuth;
}

/** Invalidate cached tokens (call on 401 from upstream). */
export function invalidateTokens(): void {
  _state.refreshToken = null;
  _state.idToken = null;
  _state.idTokenExpiresAt = 0;
  console.log('[jquants:token] tokens invalidated');
}

/** Token state summary for health endpoint */
export function tokenStatus(): {
  hasRefreshToken: boolean;
  hasIdToken: boolean;
  idTokenExpiresInMs: number | null;
} {
  return {
    hasRefreshToken: _state.refreshToken !== null,
    hasIdToken: _state.idToken !== null,
    idTokenExpiresInMs: _state.idToken
      ? Math.max(0, _state.idTokenExpiresAt - Date.now())
      : null,
  };
}

// ---------------------------------------------------------------------------

async function _acquireToken(): Promise<string> {
  // Try refreshing with an existing refreshToken first
  if (_state.refreshToken) {
    try {
      return await _refreshIdToken();
    } catch (err) {
      console.warn(
        '[jquants:token] refresh failed, falling back to full auth:',
        (err as Error).message
      );
      _state.refreshToken = null;
      _state.idToken = null;
    }
  }
  // Full authentication
  return await _authenticate();
}

async function _authenticate(): Promise<string> {
  const email    = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '[jquants:token] auth FAILED: JQUANTS_EMAIL and JQUANTS_PASSWORD must be set in environment'
    );
  }

  console.log('[jquants:token] authenticating with credentials...');

  const res = await fetch(`${JQUANTS_BASE}/token/auth_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailaddress: email, password }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[jquants:token] auth FAILED: auth_user returned HTTP ${res.status} — ${body}`
    );
  }

  const data = await res.json() as { refreshToken?: string };

  if (!data.refreshToken) {
    throw new Error('[jquants:token] auth FAILED: no refreshToken in auth_user response');
  }

  _state.refreshToken = data.refreshToken;
  console.log('[jquants:token] auth success — refreshToken acquired');

  return await _refreshIdToken();
}

async function _refreshIdToken(): Promise<string> {
  if (!_state.refreshToken) {
    throw new Error('[jquants:token] cannot refresh — no refreshToken available');
  }

  const res = await fetch(
    `${JQUANTS_BASE}/token/auth_refresh?refreshtoken=${_state.refreshToken}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[jquants:token] refresh FAILED: auth_refresh returned HTTP ${res.status} — ${body}`
    );
  }

  const data = await res.json() as { idToken?: string };

  if (!data.idToken) {
    throw new Error('[jquants:token] refresh FAILED: no idToken in auth_refresh response');
  }

  _state.idToken = data.idToken;
  _state.idTokenExpiresAt = Date.now() + ID_TOKEN_TTL_MS;
  console.log('[jquants:token] token refresh success — idToken valid for ~23h');

  return _state.idToken;
}
