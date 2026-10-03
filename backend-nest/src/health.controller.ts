import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InfrastructureService } from './infrastructure/infrastructure.service.js';

@Controller('healthz')
export class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get()
  async health() {
    const checks = await this.infrastructure.health();
    if (!checks.database || !checks.redis) throw new ServiceUnavailableException({ status: 'degraded', checks });
    return { status: 'ok', checks };
  }
}
