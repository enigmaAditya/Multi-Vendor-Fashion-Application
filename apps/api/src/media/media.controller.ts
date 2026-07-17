import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email?: string;
    phone?: string;
    roles: string[];
  };
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presigned-url')
  async getPresignedUrl(
    @Req() req: RequestWithUser,
    @Body() dto: { filename: string; contentType: string },
  ) {
    if (!dto.filename || !dto.contentType) {
      throw new BadRequestException('filename and contentType are required.');
    }
    return this.mediaService.generateUploadUrl(
      req.user.sub,
      dto.filename,
      dto.contentType,
    );
  }

  @Post('confirm')
  async confirmUpload(
    @Req() req: RequestWithUser,
    @Body() dto: { mediaId: string },
  ) {
    if (!dto.mediaId) {
      throw new BadRequestException('mediaId is required.');
    }
    return this.mediaService.confirmUpload(req.user.sub, dto.mediaId);
  }

  @Get(':id/status')
  async getStatus(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.mediaService.getMediaStatus(req.user.sub, id);
  }
}
