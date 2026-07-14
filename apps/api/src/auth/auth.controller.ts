import { Controller, Post, Get, Patch, Body, UseGuards, Request, Response as Res, UnauthorizedException, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleOAuthConfiguredGuard } from './google-oauth-configured.guard';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setRefreshCookie(res: ExpressResponse, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }

  private clearRefreshCookie(res: ExpressResponse) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) res: ExpressResponse) {
    const result = await this.authService.register(body.email, body.password, body.name);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: ExpressResponse) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  async refresh(@Request() req: ExpressRequest, @Res({ passthrough: true }) res: ExpressResponse) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('No refresh token');
    }
    const result = await this.authService.refresh(rawToken);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  async logout(@Request() req: ExpressRequest, @Res({ passthrough: true }) res: ExpressResponse) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(rawToken);
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.forgotPassword(body.email);
    return { success: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Request() req) {
    return this.authService.getMe(req.user.userId);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Body() body: UpdateProfileDto, @Request() req) {
    return this.authService.updateProfile(req.user.userId, body);
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(@Body() body: ChangePasswordDto, @Request() req) {
    await this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
    return { success: true };
  }

  @Get('google')
  @UseGuards(GoogleOAuthConfiguredGuard, AuthGuard('google'))
  async googleAuth() {
    // Passport handles the redirect to Google; this body never runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthConfiguredGuard, AuthGuard('google'))
  async googleCallback(@Request() req, @Res() res: ExpressResponse) {
    const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      const result = await this.authService.loginWithGoogle(req.user);
      this.setRefreshCookie(res, result.refreshToken);
      res.redirect(`${frontendUrl}/auth/google-callback?accessToken=${encodeURIComponent(result.accessToken)}`);
    } catch {
      res.redirect(`${frontendUrl}/login?error=google_failed`);
    }
  }
}
