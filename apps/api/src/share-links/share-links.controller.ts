import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShareLinksService } from './share-links.service';
import { CreateShareLinkDto } from './dto/create-share-link.dto';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ShareLinksController {
  constructor(private shareLinksService: ShareLinksService) {}

  @Post('videos/:videoId/share-links')
  async create(@Param('videoId') videoId: string, @Body() body: CreateShareLinkDto, @Request() req) {
    return this.shareLinksService.create(videoId, req.user.userId, req.user.username || req.user.email, body);
  }

  @Get('videos/:videoId/share-links')
  async list(@Param('videoId') videoId: string, @Request() req) {
    return this.shareLinksService.listForVideo(videoId, req.user.userId);
  }

  @Patch('share-links/:id/revoke')
  async revoke(@Param('id') id: string, @Request() req) {
    return this.shareLinksService.revoke(id, req.user.userId);
  }
}
