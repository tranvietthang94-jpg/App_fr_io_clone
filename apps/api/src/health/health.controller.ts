import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// Liveness probe cho Docker healthcheck / reverse proxy. Cố tình KHÔNG đụng
// DB để trả nhanh và không bị ảnh hưởng khi DB chậm. SkipThrottle vì
// ThrottlerGuard là APP_GUARD toàn cục — healthcheck gọi định kỳ không nên bị
// tính vào rate limit.
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
