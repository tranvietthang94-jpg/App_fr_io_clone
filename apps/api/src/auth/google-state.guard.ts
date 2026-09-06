import { CanActivate, ExecutionContext, UnauthorizedException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

export const GOOGLE_STATE_COOKIE = 'g_state';
export const GOOGLE_STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * CSRF protection for the Google OAuth flow (passport-oauth2 runs with a
 * NullStore, so it performs no state verification itself). The initiate route
 * sets a short-lived `g_state` cookie; here the callback's `state` query
 * parameter must match it before the code exchange is allowed to proceed.
 * Runs before AuthGuard('google') — see AuthController.googleCallback.
 */
@Injectable()
export class GoogleStateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const queryState = typeof req.query.state === 'string' ? req.query.state : undefined;
    const cookieState = req.cookies?.[GOOGLE_STATE_COOKIE];

    if (!queryState || !cookieState || queryState !== cookieState) {
      throw new UnauthorizedException('Google OAuth state không hợp lệ');
    }
    return true;
  }
}
