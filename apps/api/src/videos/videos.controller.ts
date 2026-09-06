import { Controller, Get, Delete, Post, Patch, Body, Param, Query, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { VideosService } from './videos.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';
import { RenameVideoDto, MoveVideoDto } from './dto/update-video.dto';
import { resolveStreamFilePath, streamVideoFile } from './stream-file.util';
import { getStreamTokenSecret, STREAM_TOKEN_EXPIRES_IN } from '../config/jwt.config';

@Controller()
export class VideosController {
  constructor(
    private videosService: VideosService,
    private projectsService: ProjectsService,
    private jwtService: JwtService,
  ) {}

  @Get('projects/:projectId/videos')
  @UseGuards(AuthGuard('jwt'))
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('folderId') folderId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('reviewStatus') reviewStatus: string | undefined,
    @Req() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user.userId);
    return this.videosService.findByProject(projectId, folderId ?? null, { search, reviewStatus });
  }

  @Get('projects/:projectId/trash')
  @UseGuards(AuthGuard('jwt'))
  async findTrash(@Param('projectId') projectId: string, @Req() req: any) {
    await this.projectsService.findOne(projectId, req.user.userId);
    return this.videosService.findTrash(projectId);
  }

  /**
   * Stream tokens for every video in the project in one round-trip — the grid
   * needs one token per thumbnail <img> (images can't send auth headers, same
   * reason the player uses per-video stream tokens).
   */
  @Get('projects/:projectId/stream-tokens')
  @UseGuards(AuthGuard('jwt'))
  async streamTokens(@Param('projectId') projectId: string, @Req() req: any) {
    await this.projectsService.findOne(projectId, req.user.userId);
    const videos = await this.videosService.findByProject(projectId, null, {});
    const tokens: Record<string, string> = {};
    for (const video of videos) {
      tokens[video.id] = this.jwtService.sign(
        { sub: req.user.userId, videoId: video.id, purpose: 'stream' },
        { secret: getStreamTokenSecret(), expiresIn: STREAM_TOKEN_EXPIRES_IN },
      );
    }
    return tokens;
  }

  @Get('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.videosService.findOwned(id, req.user.userId);
  }

  @Get('videos/:id/versions')
  @UseGuards(AuthGuard('jwt'))
  async getVersions(@Param('id') id: string, @Req() req: any) {
    const video = await this.videosService.findOwned(id, req.user.userId);
    return this.videosService.getVersions(video.assetGroupId, req.user.userId);
  }

  /**
   * Mints a short-lived, video-scoped stream token. Because <video src> can't
   * send an Authorization header, the token has to travel in the stream URL —
   * so it's signed with a separate secret and bound to this one video, meaning
   * a leaked URL can't be replayed against the API or other videos.
   */
  @Get('videos/:id/stream-token')
  @UseGuards(AuthGuard('jwt'))
  async streamToken(@Param('id') id: string, @Req() req: any) {
    // Confirms the caller can actually see this video before issuing a token.
    await this.videosService.findOwned(id, req.user.userId);
    const token = this.jwtService.sign(
      { sub: req.user.userId, videoId: id, purpose: 'stream' },
      { secret: getStreamTokenSecret(), expiresIn: STREAM_TOKEN_EXPIRES_IN },
    );
    return { token };
  }

  @Get('videos/:id/stream/:quality')
  async stream(
    @Param('id') id: string,
    @Param('quality') quality: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Accepts a dedicated stream token (see streamToken above), NOT the API
    // JWT — verified with the stream secret and required to be bound to this
    // exact video, so it can't be used as a general API credential.
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify(token, { secret: getStreamTokenSecret() });
      if (payload.purpose !== 'stream' || payload.videoId !== id || !payload.sub) {
        throw new Error('Invalid stream token');
      }
      userId = payload.sub;
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let video;
    try {
      video = await this.videosService.findOwned(id, userId);
    } catch {
      return res.status(404).json({ error: 'Video not found' });
    }

    const filePath = resolveStreamFilePath(video, quality);
    if (!filePath) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    streamVideoFile(filePath, req, res);
  }

  /**
   * Same stream-token auth as the stream route — <img> can't send headers.
   * The thumbnail is the first-second preview frame written by the transcoder.
   */
  @Get('videos/:id/thumbnail')
  async thumbnail(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify(token, { secret: getStreamTokenSecret() });
      if (payload.purpose !== 'stream' || payload.videoId !== id || !payload.sub) {
        throw new Error('Invalid stream token');
      }
      userId = payload.sub;
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await this.videosService.findOwned(id, userId);
    } catch {
      return res.status(404).json({ error: 'Video not found' });
    }

    const thumbPath = path.join(process.cwd(), 'uploads', 'thumbnails', `${id}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(thumbPath).pipe(res);
  }

  @Patch('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async rename(@Param('id') id: string, @Body() body: RenameVideoDto, @Req() req: any) {
    return this.videosService.rename(id, body.title, req.user.userId);
  }

  @Patch('videos/:id/review-status')
  @UseGuards(AuthGuard('jwt'))
  async setReviewStatus(@Param('id') id: string, @Body() body: UpdateReviewStatusDto, @Req() req: any) {
    return this.videosService.setReviewStatus(id, body.status, req.user.userId, req.user.username || req.user.email);
  }

  @Patch('videos/:id/move')
  @UseGuards(AuthGuard('jwt'))
  async move(@Param('id') id: string, @Body() body: MoveVideoDto, @Req() req: any) {
    return this.videosService.move(id, body.folderId, req.user.userId);
  }

  @Delete('videos/:id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.videosService.softDelete(id, req.user.userId);
  }

  @Post('videos/:id/restore')
  @UseGuards(AuthGuard('jwt'))
  async restore(@Param('id') id: string, @Req() req: any) {
    return this.videosService.restore(id, req.user.userId);
  }
}
