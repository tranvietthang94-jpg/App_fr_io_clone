import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { VideosModule } from './videos/videos.module';
import { CommentsModule } from './comments/comments.module';
import { UploadModule } from './upload/upload.module';
import { ExportModule } from './export/export.module';
import { MediaModule } from './media/media.module';
import { TranscodeModule } from './media/transcode.module';
import { CollaborationModule } from './gateway/collaboration.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShareLinksModule } from './share-links/share-links.module';

@Module({
  imports: [
    // Database
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'frclone',
      password: process.env.DB_PASSWORD || 'frclone123',
      database: process.env.DB_DATABASE || 'frclone',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),

    // Generous global default; auth endpoints tighten this with @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),

    // Feature modules
    AuthModule,
    ProjectsModule,
    VideosModule,
    CommentsModule,
    UploadModule,
    ExportModule,
    MediaModule,
    TranscodeModule,
    CollaborationModule,
    NotificationsModule,
    ShareLinksModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
