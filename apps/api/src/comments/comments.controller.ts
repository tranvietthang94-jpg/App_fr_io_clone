import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommentsService } from './comments.service';
import { VideosService } from '../videos/videos.service';

@Controller()
export class CommentsController {
  constructor(
    private commentsService: CommentsService,
    private videosService: VideosService,
  ) {}

  @Get('videos/:videoId/comments')
  @UseGuards(AuthGuard('jwt'))
  async findByVideo(@Param('videoId') videoId: string, @Request() req) {
    await this.videosService.findOwned(videoId, req.user.userId);
    return this.commentsService.findByVideo(videoId);
  }

  @Post('videos/:videoId/comments')
  @UseGuards(AuthGuard('jwt'))
  async create(
    @Param('videoId') videoId: string,
    @Body() body: {
      content: string;
      timestamp: number;
      frameNumber: number;
      positionX?: number;
      positionY?: number;
      parentId?: string;
    },
    @Request() req,
  ) {
    await this.videosService.findOwned(videoId, req.user.userId);
    return this.commentsService.create({
      ...body,
      videoId,
      userId: req.user.userId,
    });
  }

  @Patch('comments/:id')
  @UseGuards(AuthGuard('jwt'))
  async update(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @Request() req,
  ) {
    return this.commentsService.update(id, body, req.user.userId);
  }

  @Delete('comments/:id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string, @Request() req) {
    return this.commentsService.delete(id, req.user.userId);
  }
}