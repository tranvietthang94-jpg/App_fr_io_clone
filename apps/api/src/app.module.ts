import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { VideosModule } from './videos/videos.module';
import { CommentsModule } from './comments/comments.module';
import { UploadModule } from './upload/upload.module';
import { ExportModule } from './export/export.module';
import { MediaModule } from './media/media.module';
import { CollaborationModule } from './gateway/collaboration.module';

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

    // Feature modules
    AuthModule,
    ProjectsModule,
    VideosModule,
    CommentsModule,
    UploadModule,
    ExportModule,
    MediaModule,
    CollaborationModule,
  ],
})
export class AppModule {}
