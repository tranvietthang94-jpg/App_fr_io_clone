export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is required (set it in apps/api/.env)',
    );
  }
  return secret;
}

export const jwtModuleOptions = {
  secret: getJwtSecret(),
  // Short-lived on purpose — the refresh-token flow (httpOnly cookie) renews
  // this silently, so it doesn't need the old 7d lifetime to avoid annoying logouts.
  signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
};

/**
 * Secret for video-stream tokens — deliberately DIFFERENT from the API JWT
 * secret. `<video src>` can't send an Authorization header, so a token has to
 * ride in the URL; signing it with the API secret would make that leak-prone,
 * long-lived URL token a full API credential (AuthGuard('jwt') would accept
 * it). A separate secret keeps a leaked stream URL scoped to streaming only.
 * Falls back to a derived value so dev works without extra env setup.
 */
export function getStreamTokenSecret(): string {
  return process.env.STREAM_TOKEN_SECRET || `${getJwtSecret()}:stream-v1`;
}

// Long enough to cover a viewing session without mid-playback re-auth, but
// still bounded. Overridable via env.
export const STREAM_TOKEN_EXPIRES_IN = process.env.STREAM_TOKEN_EXPIRES_IN || '2h';
