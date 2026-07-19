import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

interface CreateReviewDto {
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
}

interface UpdateReviewDto {
  rating?: number;
  title?: string;
  comment?: string;
}

interface ModerateReviewDto {
  status: 'APPROVED' | 'REJECTED';
}

interface ReviewQuery {
  limit?: string;
  offset?: string;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // --- Create Review (authenticated user) ---
  @Post('reviews')
  @UseGuards(JwtAuthGuard)
  async create(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(req.user.sub, dto.productId, {
      rating: dto.rating,
      title: dto.title,
      comment: dto.comment,
    });
  }

  // --- Update Review (authenticated owner) ---
  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: Request & { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(req.user.sub, id, dto);
  }

  // --- Delete Review (authenticated owner) ---
  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Req() req: Request & { user: { sub: string } },
    @Param('id') id: string,
  ) {
    return this.reviewsService.deleteReview(req.user.sub, id);
  }

  // --- Admin: Moderate Review ---
  @Patch('admin/reviews/:id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewsService.moderateReview(id, dto.status);
  }

  // --- List Product Reviews (public) ---
  @Get('products/:productId/reviews')
  async list(
    @Param('productId') productId: string,
    @Query() query: ReviewQuery,
  ) {
    return this.reviewsService.getProductReviews(productId, {
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  // --- Product Review Stats (public) ---
  @Get('products/:productId/reviews/stats')
  async stats(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviewStats(productId);
  }
}
