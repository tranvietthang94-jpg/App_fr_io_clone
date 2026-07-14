import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FoldersService } from './folders.service';

@Controller('projects/:projectId/folders')
@UseGuards(AuthGuard('jwt'))
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('parentFolderId') parentFolderId: string | undefined,
    @Request() req,
  ) {
    return this.foldersService.findByProject(projectId, req.user.userId, parentFolderId ?? null);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() body: { name: string; parentFolderId?: string },
    @Request() req,
  ) {
    return this.foldersService.create(projectId, req.user.userId, body);
  }

  @Patch(':id')
  async rename(@Param('id') id: string, @Body() body: { name: string }, @Request() req) {
    return this.foldersService.rename(id, body.name, req.user.userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.foldersService.delete(id, req.user.userId);
  }
}
