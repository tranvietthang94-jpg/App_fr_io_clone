import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FoldersService } from './folders.service';
import { CreateFolderDto, RenameFolderDto } from './dto/folder.dto';
import { CopyFolderDto, PermanentDeleteDto } from './dto/content-ops.dto';

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
    @Body() body: CreateFolderDto,
    @Request() req,
  ) {
    return this.foldersService.create(projectId, req.user.userId, body);
  }

  @Patch(':id')
  async rename(@Param('id') id: string, @Body() body: RenameFolderDto, @Request() req) {
    return this.foldersService.rename(id, body.name, req.user.userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.foldersService.delete(id, req.user.userId, req.user.username || req.user.email);
  }
}

/** Content ops addressed by folder id alone (the project is derived from the folder). */
@Controller('folders')
@UseGuards(AuthGuard('jwt'))
export class FolderOpsController {
  constructor(private foldersService: FoldersService) {}

  @Post(':id/copy')
  async copy(@Param('id') id: string, @Body() body: CopyFolderDto, @Request() req) {
    return this.foldersService.copyFolder(id, body, req.user.userId, req.user.username || req.user.email);
  }

  @Get(':id/delete-preview')
  async deletePreview(@Param('id') id: string, @Request() req) {
    return this.foldersService.getDeletePreview(id, req.user.userId);
  }

  @Delete(':id/permanent')
  async deletePermanently(@Param('id') id: string, @Body() body: PermanentDeleteDto, @Request() req) {
    return this.foldersService.deletePermanently(id, body.confirmName, req.user.userId, req.user.username || req.user.email);
  }
}
