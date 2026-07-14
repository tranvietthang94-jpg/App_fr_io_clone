import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { CollaborationModule } from '../gateway/collaboration.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), CollaborationModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
