import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutsProcessor } from './payouts.processor';
import { PayoutsController } from './payouts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsProcessor],
  exports: [PayoutsService],
})
export class PayoutsModule {}
