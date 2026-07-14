import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnnotationsService } from './annotations.service';
import { CommentsService } from './comments.service';
import { VideosService } from '../videos/videos.service';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/create-annotation.dto';

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

  /** Confirms the annotation belongs to commentId and the caller has access to that comment's video. */
  private async assertAccess(commentId: string, annotationId: string, userId: string) {
    const annotation = await this.annotationsService.findOne(annotationId);
    if (annotation.commentId !== commentId) {
      throw new BadRequestException('Annotation does not belong to this comment');
    }
    const comment = await this.commentsService.findOne(commentId);
    await this.videosService.findOwned(comment.videoId, userId);
    return annotation;
  }

  @Patch('comments/:commentId/annotations/:id')
  async update(
    @Param('commentId') commentId: string,
    @Param('id') id: string,
    @Body() body: UpdateAnnotationDto,
    @Request() req,
  ) {
    await this.assertAccess(commentId, id, req.user.userId);
    return this.annotationsService.update(id, body);
  }

  @Delete('comments/:commentId/annotations/:id')
  async delete(
    @Param('commentId') commentId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    await this.assertAccess(commentId, id, req.user.userId);
    return this.annotationsService.delete(id);
  }
}
