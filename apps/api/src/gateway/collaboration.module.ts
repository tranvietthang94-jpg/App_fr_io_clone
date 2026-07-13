import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CollaborationGateway } from './collaboration.gateway';
import { jwtModuleOptions } from '../config/jwt.config';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [JwtModule.register(jwtModuleOptions), VideosModule],
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}