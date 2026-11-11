import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { CollaborationModule } from '../gateway/collaboration.module';

@Module({
  // forwardRef: AuthModule -> CollaborationModule -> ShareLinksModule -> CommentsModule -> here, so this
  // module can load before CollaborationModule finishes loading.
  imports: [TypeOrmModule.forFeature([Notification]), forwardRef(() => CollaborationModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
