import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminPermission } from './admin-permissions';
import { RequireAdmin, RequireSuperAdmin } from './admin.guard';
import { UpdateQuotaDto } from './dto/update-quota.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('users')
  @RequireAdmin()
  listUsers(@Query('search') search?: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    return this.admin.listUsers({
      search: search?.trim() || undefined,
      offset: offset ? parseInt(offset, 10) || 0 : undefined,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
  }

  @Patch('users/:id/quota')
  @RequireAdmin(AdminPermission.QUOTA_GRANT, AdminPermission.QUOTA_ADJUST)
  updateQuota(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateQuotaDto, @Request() req) {
    return this.admin.updateQuota(req.admin, id, body.quotaBytes);
  }

  @Patch('users/:id/permissions')
  @RequireSuperAdmin()
  updatePermissions(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePermissionsDto, @Request() req) {
    return this.admin.updatePermissions(req.admin, id, body.permissions);
  }

  @Get('users/:id/projects')
  @RequireAdmin(AdminPermission.PROJECT_VIEW)
  userProjects(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.userProjects(id);
  }

  @Get('projects')
  @RequireAdmin(AdminPermission.PROJECT_VIEW)
  searchProjects(@Query('search') search?: string) {
    return this.admin.searchProjects(search?.trim() || undefined);
  }

  @Post('storage/recalculate')
  @RequireSuperAdmin()
  recalculate() {
    return this.admin.recalculate();
  }
}
