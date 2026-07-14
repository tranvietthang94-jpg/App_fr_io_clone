import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommentsService } from './comments.service';
import { VideosService } from '../videos/videos.service';
import { ProjectsService } from '../projects/projects.service';

@Controller()
export class CommentsController {
  constructor(
    private commentsService: CommentsService,
    private videosService: VideosService,
    private projectsService: ProjectsService,
  ) {}

  @Get('videos/:videoId/comments')
  @UseGuards(AuthGuard('jwt'))
  async findByVideo(
    @Param('videoId') videoId: string,
    @Query('sort') sort: 'timecode' | 'date',
    @Query('offset') offset: string,
    @Query('limit') limit: string,
    @Request() req,
  ) {
    await this.videosService.findOwned(videoId, req.user.userId);
    return this.commentsService.findByVideo(videoId, {
      sort,
      offset: offset ? parseInt(offset, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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
      actorName: req.user.username || req.user.email,
    });
  }

  /** Resolves the video → project → caller's role, for the moderation checks in update/delete/resolve. */
  private async getCallerRole(commentId: string, userId: string) {
    const comment = await this.commentsService.findOne(commentId);
    const video = await this.videosService.findOwned(comment.videoId, userId);
    return this.projectsService.getMemberRole(video.projectId, userId);
  }

  @Patch('comments/:id')
  @UseGuards(AuthGuard('jwt'))
  async update(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @Request() req,
  ) {
    const role = await this.getCallerRole(id, req.user.userId);
    return this.commentsService.update(id, body, req.user.userId, role);
  }

  @Delete('comments/:id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string, @Request() req) {
    const role = await this.getCallerRole(id, req.user.userId);
    return this.commentsService.delete(id, req.user.userId, role);
  }

  @Patch('comments/:id/resolve')
  @UseGuards(AuthGuard('jwt'))
  async setResolved(
    @Param('id') id: string,
    @Body() body: { resolved: boolean },
    @Request() req,
  ) {
    const role = await this.getCallerRole(id, req.user.userId);
    return this.commentsService.setResolved(
      id,
      body.resolved,
      req.user.userId,
      role,
      req.user.username || req.user.email,
    );
  }
}
