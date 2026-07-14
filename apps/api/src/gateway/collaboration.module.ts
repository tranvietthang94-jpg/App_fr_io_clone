import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CollaborationGateway } from './collaboration.gateway';
import { jwtModuleOptions } from '../config/jwt.config';
import { VideosModule } from '../videos/videos.module';
import { ShareLinksModule } from '../share-links/share-links.module';

// forwardRef: ShareLinksModule -> CommentsModule -> NotificationsModule ->
// CollaborationModule -> ShareLinksModule would otherwise be a hard circular
// require between these four modules.
@Module({
  imports: [JwtModule.register(jwtModuleOptions), VideosModule, forwardRef(() => ShareLinksModule)],
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}