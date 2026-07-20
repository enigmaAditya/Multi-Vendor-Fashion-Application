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
import { SearchModule } from './search/search.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CouponsModule } from './coupons/coupons.module';

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
    SearchModule,
    ReviewsModule,
    CouponsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
