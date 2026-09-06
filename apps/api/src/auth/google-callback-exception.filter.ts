import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { GOOGLE_STATE_COOKIE } from './google-state.guard';

/**
 * Anything that fails inside the Google callback — passport's token exchange
 * (Google maps a bad/expired code to a TokenError with status 500), an OAuth
 * outage, or a state mismatch — lands on the web app's friendly error page
 * instead of a raw 500/401 JSON response.
 */
@Catch()
export class GoogleCallbackExceptionFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/api/auth' });
    res.redirect(`${frontendUrl}/login?error=google_failed`);
  }
}
