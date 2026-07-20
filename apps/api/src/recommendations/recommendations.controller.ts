import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  RecentlyViewedQuerySchema,
  TrendingQuerySchema,
  SimilarQuerySchema,
  AlsoBoughtQuerySchema,
} from '@marketplace/types';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  // --- 1. Track Product View (Authenticated) ---
  @Post('views/:productId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async trackView(
    @Req() req: { user: { sub?: string; id?: string } },
    @Param('productId') productId: string,
  ) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    return this.recommendationsService.trackProductView(userId, productId);
  }

  // --- 2. Get Recently Viewed Products (Authenticated) ---
  @Get('recently-viewed')
  @UseGuards(JwtAuthGuard)
  async getRecentlyViewed(
    @Req() req: { user: { sub?: string; id?: string } },
    @Query() query: unknown,
  ) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    const parsed = RecentlyViewedQuerySchema.parse(query || {});
    return this.recommendationsService.getRecentlyViewed(userId, parsed.limit);
  }

  // --- 3. Get Trending Products (Public) ---
  @Get('trending')
  async getTrending(@Query() query: unknown) {
    const parsed = TrendingQuerySchema.parse(query || {});
    return this.recommendationsService.getTrendingProducts(
      parsed.limit,
      parsed.days,
      parsed.categoryId,
    );
  }

  // --- 4. Get Similar Products (Public) ---
  @Get('similar/:productId')
  async getSimilar(
    @Param('productId') productId: string,
    @Query() query: unknown,
  ) {
    const parsed = SimilarQuerySchema.parse(query || {});
    return this.recommendationsService.getSimilarProducts(
      productId,
      parsed.limit,
    );
  }

  // --- 5. Get Customers Also Bought (Public) ---
  @Get('also-bought/:productId')
  async getAlsoBought(
    @Param('productId') productId: string,
    @Query() query: unknown,
  ) {
    const parsed = AlsoBoughtQuerySchema.parse(query || {});
    return this.recommendationsService.getCustomersAlsoBought(
      productId,
      parsed.limit,
    );
  }
}
