import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, Res, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response } from 'express';
import { ShareLinkGuard } from './guards/share-link.guard';
import { SharePermission } from './share-link.entity';
import { CommentsService } from '../comments/comments.service';
import { AnnotationsService } from '../comments/annotations.service';
import { VideosService } from '../videos/videos.service';
import { resolveStreamFilePath, streamVideoFile } from '../videos/stream-file.util';
import { UpdateReviewStatusDto } from '../videos/dto/update-review-status.dto';
import { CreateAnnotationDto } from '../comments/dto/create-annotation.dto';
import { GuestCommentDto, GuestCommentEditDto, GuestCommentDeleteDto } from './dto/guest-comment.dto';

interface ShareLinkRequest extends Request {
  shareLink: { id: string; videoId: string; permission: SharePermission };
}

function assertCanComment(shareLink: { permission: SharePermission }) {
  if (shareLink.permission !== SharePermission.CAN_COMMENT) {
    throw new ForbiddenException('This link is view-only');
  }
}

@Controller('public/review/:token')
@UseGuards(ShareLinkGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PublicReviewController {
  constructor(
    private videosService: VideosService,
    private commentsService: CommentsService,
    private annotationsService: AnnotationsService,
  ) {}

  @Get()
  async getVideo(@Req() req: ShareLinkRequest) {
    const video = await this.videosService.findOne(req.shareLink.videoId);
    return {
      permission: req.shareLink.permission,
      video: {
        id: video.id,
        title: video.title,
        duration: video.duration,
        width: video.width,
        height: video.height,
        fps: video.fps,
        status: video.status,
        reviewStatus: video.reviewStatus,
        versionNumber: video.versionNumber,
      },
    };
  }

  @Get('stream/:quality')
  async stream(@Param('quality') quality: string, @Req() req: ShareLinkRequest, @Res() res: Response) {
    const video = await this.videosService.findOne(req.shareLink.videoId);
    const filePath = resolveStreamFilePath(video, quality);
    if (!filePath) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    streamVideoFile(filePath, req, res);
  }

  /**
   * Preview frame for the share link — no extra token needed because the
   * share token in the path IS the credential (same as the stream route).
   * Also used as the og:image so messengers show the clip when the link is
   * pasted into a chat.
   */
  @Get('thumbnail')
  async thumbnail(@Req() req: ShareLinkRequest, @Res() res: Response) {
    const thumbPath = path.join(process.cwd(), 'uploads', 'thumbnails', `${req.shareLink.videoId}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(thumbPath).pipe(res);
  }

  @Get('comments')
  async getComments(
    @Query('sort') sort: 'timecode' | 'date',
    @Query('offset') offset: string,
    @Query('limit') limit: string,
    @Req() req: ShareLinkRequest,
  ) {
    return this.commentsService.findByVideo(req.shareLink.videoId, {
      sort,
      offset: offset ? parseInt(offset, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('comments')
  async addComment(@Body() body: GuestCommentDto, @Req() req: ShareLinkRequest) {
    assertCanComment(req.shareLink);
    return this.commentsService.create({
      videoId: req.shareLink.videoId,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      shareLinkId: req.shareLink.id,
      actorName: body.guestName,
      content: body.content,
      timestamp: body.timestamp,
      frameNumber: body.frameNumber,
      endTimestamp: body.endTimestamp,
      positionX: body.positionX,
      positionY: body.positionY,
      parentId: body.parentId,
    });
  }

  @Patch('comments/:commentId')
  async editComment(
    @Param('commentId') commentId: string,
    @Body() body: GuestCommentEditDto,
    @Req() req: ShareLinkRequest,
  ) {
    assertCanComment(req.shareLink);
    return this.commentsService.updateAsGuest(commentId, body.editToken, { content: body.content });
  }

  @Delete('comments/:commentId')
  async deleteComment(
    @Param('commentId') commentId: string,
    @Body() body: GuestCommentDeleteDto,
    @Req() req: ShareLinkRequest,
  ) {
    assertCanComment(req.shareLink);
    return this.commentsService.deleteAsGuest(commentId, body.editToken);
  }

  @Get('annotations')
  async getAnnotations(@Req() req: ShareLinkRequest) {
    return this.annotationsService.findByVideo(req.shareLink.videoId);
  }

  @Post('comments/:commentId/annotations')
  async addAnnotation(
    @Param('commentId') commentId: string,
    @Body() body: CreateAnnotationDto,
    @Req() req: ShareLinkRequest,
  ) {
    assertCanComment(req.shareLink);
    const comment = await this.commentsService.findOne(commentId);
    if (comment.videoId !== req.shareLink.videoId) {
      throw new ForbiddenException('Comment does not belong to this video');
    }
    return this.annotationsService.create({ commentId, type: body.type, data: body.data });
  }

  @Patch('review-status')
  async setReviewStatus(@Body() body: UpdateReviewStatusDto, @Req() req: ShareLinkRequest) {
    assertCanComment(req.shareLink);
    return this.videosService.setReviewStatusAsGuest(req.shareLink.videoId, body.status, 'Guest reviewer');
  }
}
