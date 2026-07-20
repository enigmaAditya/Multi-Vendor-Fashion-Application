import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async checkHealth() {
    let dbStatus = 'UP';
    let redisStatus = 'UP';

    // 1. PostgreSQL DB Check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'DOWN';
    }

    // 2. Redis Check
    try {
      const client = this.redisService.getClient();
      await client.ping();
    } catch {
      redisStatus = 'DOWN';
    }

    const isHealthy = dbStatus === 'UP' && redisStatus === 'UP';

    return {
      status: isHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }
}
