import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { isGoogleOAuthConfigured } from '../config/google.config';

// Runs before AuthGuard('google') on the google/google-callback routes. Without
// this, an unconfigured server still redirects the browser to Google with a
// placeholder client_id, which Google rejects with its own confusing
// "Error 401: invalid_client" page instead of a clear in-app message.
@Injectable()
export class GoogleOAuthConfiguredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (isGoogleOAuthConfigured()) return true;

    const res = context.switchToHttp().getResponse<ExpressResponse>();
    const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=google_not_configured`);
    return false;
  }
}
