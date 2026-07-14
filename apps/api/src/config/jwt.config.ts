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
