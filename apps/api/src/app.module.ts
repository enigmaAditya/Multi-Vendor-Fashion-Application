import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { MediaModule } from './media/media.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { PayoutsModule } from './payouts/payouts.module';
import { LogisticsModule } from './logistics/logistics.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    CatalogModule,
    MediaModule,
    InventoryModule,
    OrdersModule,
    PayoutsModule,
    LogisticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
