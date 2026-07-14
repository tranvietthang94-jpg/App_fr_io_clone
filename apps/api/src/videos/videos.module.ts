import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { Video } from './video.entity';
import { Folder } from './folder.entity';
import { MediaModule } from '../media/media.module';
import { ProjectsModule } from '../projects/projects.module';
import { jwtModuleOptions } from '../config/jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Folder]),
    MediaModule,
    ProjectsModule,
    JwtModule.register(jwtModuleOptions),
  ],
  controllers: [VideosController, FoldersController],
  providers: [VideosService, FoldersService],
  exports: [VideosService],
})
export class VideosModule {}
