export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const googleOAuthOptions = {
  // Falls back to a non-empty placeholder so the Strategy constructor
  // doesn't throw when Google OAuth isn't configured — the routes stay
  // registered but redirect users to a clear "not configured" error instead
  // of crashing the whole API on boot.
  clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
};
