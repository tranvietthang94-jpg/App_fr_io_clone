import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async findAll(@Query('unreadOnly') unreadOnly: string, @Request() req) {
    return this.notificationsService.findByUser(req.user.userId, unreadOnly === 'true');
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markRead(id, req.user.userId);
  }

  @Patch('read-all')
  async markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.userId);
  }
}
