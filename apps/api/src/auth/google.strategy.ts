import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { googleOAuthOptions } from '../config/google.config';

export interface GoogleProfile {
  email: string;
  name: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: googleOAuthOptions.clientID,
      clientSecret: googleOAuthOptions.clientSecret,
      callbackURL: googleOAuthOptions.callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google account has no email'), undefined);
    }
    const googleProfile: GoogleProfile = {
      email,
      name: profile.displayName || email,
      avatarUrl: profile.photos?.[0]?.value,
      // Passport stores the strategy's actual OAuth account id separately —
      // exposed to AuthService via profile.id below.
    };
    done(null, { ...googleProfile, googleId: profile.id });
  }
}
