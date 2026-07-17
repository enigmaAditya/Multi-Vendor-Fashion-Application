import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static pool: Pool | null = null;

  constructor() {
    if (!PrismaService.pool) {
      PrismaService.pool = new Pool({
        connectionString:
          process.env.DATABASE_URL ||
          'postgresql://dev:dev@localhost:5432/marketplace?schema=public',
      });
    }

    const adapter = new PrismaPg(PrismaService.pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (PrismaService.pool) {
      await PrismaService.pool.end();
      PrismaService.pool = null;
    }
  }
}
