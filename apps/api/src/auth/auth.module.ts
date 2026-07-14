import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { User } from './user.entity';
import { RefreshToken } from './refresh-token.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { jwtModuleOptions } from '../config/jwt.config';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, PasswordResetToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register(jwtModuleOptions),
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
