import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnnotationsService } from './annotations.service';
import { CommentsService } from './comments.service';
import { VideosService } from '../videos/videos.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class AnnotationsController {
  constructor(
    private annotationsService: AnnotationsService,
    private commentsService: CommentsService,
    private videosService: VideosService,
  ) {}

  @Post('comments/:commentId/annotations')
  async create(
    @Param('commentId') commentId: string,
    @Body() body: CreateAnnotationDto,
    @Request() req,
  ) {
    const comment = await this.commentsService.findOne(commentId);
    await this.videosService.findOwned(comment.videoId, req.user.userId);
    return this.annotationsService.create({
      commentId,
      type: body.type,
      data: body.data,
    });
  }

  @Get('videos/:videoId/annotations')
  async findByVideo(@Param('videoId') videoId: string, @Request() req) {
    await this.videosService.findOwned(videoId, req.user.userId);
    return this.annotationsService.findByVideo(videoId);
  }
}
