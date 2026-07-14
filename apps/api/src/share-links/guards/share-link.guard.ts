import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ShareLinksService } from '../share-links.service';

@Injectable()
export class ShareLinkGuard implements CanActivate {
  constructor(private shareLinksService: ShareLinksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const password = req.headers['x-share-password'] as string | undefined;
    req.shareLink = await this.shareLinksService.resolveForAccess(req.params.token, password);
    return true;
  }
}
