import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { Video } from './video.entity';
import { MediaModule } from '../media/media.module';
import { ProjectsModule } from '../projects/projects.module';
import { jwtModuleOptions } from '../config/jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    MediaModule,
    ProjectsModule,
    JwtModule.register(jwtModuleOptions),
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
