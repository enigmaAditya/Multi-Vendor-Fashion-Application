import { Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';

interface SearchQuery {
  q?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  sort?: string;
  limit?: string;
  offset?: string;
}

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  async search(@Req() req: Request, @Query() query: SearchQuery) {
    const authHeader = req.headers.authorization;
    let userId: string | undefined = undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded: unknown = this.jwtService.decode(token);
        const decodedObj = decoded as Record<string, unknown> | null;
        userId = decodedObj?.sub as string | undefined;
      } catch {
        // invalid token or decode failed, ignore
      }
    }

    return this.searchService.search({
      q: query.q,
      category: query.category,
      brand: query.brand,
      color: query.color,
      size: query.size,
      minPrice: query.minPrice ? Number(query.minPrice) : undefined,
      maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
      inStock:
        query.inStock === 'true'
          ? true
          : query.inStock === 'false'
            ? false
            : undefined,
      sort: query.sort,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
      userId,
    });
  }

  @Post('reindex')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async reindex() {
    return this.searchService.reindexAll();
  }
}
