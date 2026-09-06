import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { User } from './user.entity';
import { RefreshToken } from './refresh-token.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { MailerService } from '../mailer/mailer.service';
import type { GoogleProfile } from './google.strategy';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private resetTokensRepository: Repository<PasswordResetToken>,
    private jwtService: JwtService,
    private mailerService: MailerService,
  ) {}

  private signAccessToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, email: user.email, username: user.name });
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * passwordHash is `select: false` on the entity, so it must be re-selected
   * explicitly for the two flows that compare against it.
   */
  private findUserWithPasswordHash(where: { email?: string; id?: string }) {
    const qb = this.usersRepository.createQueryBuilder('user').addSelect('user.passwordHash');
    if (where.email) qb.where('user.email = :email', { email: where.email });
    if (where.id) qb.where('user.id = :id', { id: where.id });
    return qb.getOne();
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const refreshToken = this.refreshTokensRepository.create({
      userId,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });
    await this.refreshTokensRepository.save(refreshToken);
    return raw;
  }

  async register(email: string, password: string, name: string) {
    const existingUser = await this.usersRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = this.usersRepository.create({ email, passwordHash, name });
    await this.usersRepository.save(user);

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  async login(email: string, password: string) {
    const user = await this.findUserWithPasswordHash({ email });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new one
   * issued. If a caller presents a token that's already revoked, that's a
   * signal of possible theft (a stolen token being reused after the
   * legitimate client already rotated past it) — every active session for
   * that user is revoked in response.
   */
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokensRepository.findOne({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revokedAt) {
      await this.refreshTokensRepository.update(
        { userId: existing.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    existing.revokedAt = new Date();
    await this.refreshTokensRepository.save(existing);

    const user = await this.usersRepository.findOne({ where: { id: existing.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = this.signAccessToken(user);
    const newRefreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken: newRefreshToken, user: this.toPublicUser(user) };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.refreshTokensRepository.update({ tokenHash: this.hashToken(rawToken) }, { revokedAt: new Date() });
  }

  async getMe(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toPublicUser(user);
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    Object.assign(user, data);
    await this.usersRepository.save(user);
    return this.toPublicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findUserWithPasswordHash({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.usersRepository.save(user);

    // Same "invalidate every session" behavior as resetPassword.
    await this.refreshTokensRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Always succeeds from the caller's perspective — never reveals whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) return;

    const raw = randomBytes(32).toString('hex');
    const resetToken = this.resetTokensRepository.create({
      userId: user.id,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      usedAt: null,
    });
    await this.resetTokensRepository.save(resetToken);

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password/${raw}`;
    await this.mailerService.send(
      user.email,
      'Đặt lại mật khẩu FrameClone',
      `<p>Nhấn vào liên kết để đặt lại mật khẩu (hết hạn sau 1 giờ):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      resetUrl,
    );
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const resetToken = await this.resetTokensRepository.findOne({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.usersRepository.findOne({ where: { id: resetToken.userId } });
    if (!user) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.usersRepository.save(user);

    resetToken.usedAt = new Date();
    await this.resetTokensRepository.save(resetToken);

    // Resetting the password invalidates every existing session.
    await this.refreshTokensRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Links to an existing local account by email if one exists, otherwise creates a Google-only account. */
  async loginWithGoogle(profile: GoogleProfile & { googleId: string }) {
    let user = await this.usersRepository.findOne({ where: { googleId: profile.googleId } });

    if (!user) {
      user = await this.usersRepository.findOne({ where: { email: profile.email } });
      if (user) {
        user.googleId = profile.googleId;
        if (!user.avatarUrl && profile.avatarUrl) {
          user.avatarUrl = profile.avatarUrl;
        }
        await this.usersRepository.save(user);
      } else {
        const passwordHash = await bcrypt.hash(randomUUID(), BCRYPT_COST); // unusable — Google-only account
        user = this.usersRepository.create({
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          passwordHash,
          googleId: profile.googleId,
        });
        await this.usersRepository.save(user);
      }
    }

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }
}
