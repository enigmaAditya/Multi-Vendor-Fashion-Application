import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsProcessor } from './logistics.processor';
import { PayoutsModule } from '../payouts/payouts.module';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, RedisModule, PayoutsModule, AuthModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsProcessor],
  exports: [LogisticsService],
})
export class LogisticsModule {}
