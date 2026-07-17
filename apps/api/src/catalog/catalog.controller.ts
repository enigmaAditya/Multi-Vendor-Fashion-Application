import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from './zod-validation.pipe';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ModerateProductSchema,
  ProductFilterSchema,
} from '@marketplace/types';
import * as Types from '@marketplace/types';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    roles: string[];
  };
}

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories/tree')
  async getCategoriesTree() {
    const tree = await this.catalogService.getCategoriesTree();
    return { categories: tree };
  }

  @Get('products')
  async getProducts(
    @Query(new ZodValidationPipe(ProductFilterSchema))
    query: Types.ProductFilterQuery,
  ) {
    const result = await this.catalogService.getProducts(query);
    return result;
  }

  @Get('products/:slug')
  async getProductBySlug(@Param('slug') slug: string) {
    const product = await this.catalogService.getProductBySlug(slug);
    return { product };
  }

  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER')
  async createProduct(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(CreateProductSchema))
    body: Types.CreateProductDto,
  ) {
    const sellerId = req.user.sub;
    const product = await this.catalogService.createProduct(sellerId, body);
    return { product };
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER')
  async updateProduct(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema))
    body: Types.UpdateProductDto,
  ) {
    const sellerId = req.user.sub;
    const product = await this.catalogService.updateProduct(id, sellerId, body);
    return { product };
  }

  @Post('products/:id/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER')
  async submitProduct(@Req() req: RequestWithUser, @Param('id') id: string) {
    const sellerId = req.user.sub;
    const roles = req.user.roles;
    const product = await this.catalogService.transitionProductStatus(
      id,
      'SUBMIT',
      roles,
      sellerId,
    );
    return { product };
  }

  @Post('products/:id/moderate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async moderateProduct(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModerateProductSchema))
    body: Types.ModerateProductDto,
  ) {
    const roles = req.user.roles;
    const product = await this.catalogService.transitionProductStatus(
      id,
      body.action,
      roles,
    );
    return { product };
  }
}
