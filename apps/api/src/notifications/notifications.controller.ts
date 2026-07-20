import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request as Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface RegisterTokenDto {
  token: string;
  platform?: 'WEB' | 'ANDROID' | 'IOS';
}

interface UpdatePreferencesDto {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  promotionalEnabled?: boolean;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('device-tokens')
  @HttpCode(HttpStatus.CREATED)
  async registerDeviceToken(
    @Req() req: { user: { sub?: string; id?: string } },
    @Body() dto: RegisterTokenDto,
  ) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    if (!dto.token || typeof dto.token !== 'string') {
      throw new BadRequestException('Device token is required.');
    }
    return this.notificationsService.registerDeviceToken(
      userId,
      dto.token.trim(),
      dto.platform || 'WEB',
    );
  }

  @Delete('device-tokens/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDeviceToken(
    @Req() req: { user: { sub?: string; id?: string } },
    @Param('token') token: string,
  ) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    await this.notificationsService.removeDeviceToken(userId, token);
  }

  @Get('preferences')
  async getPreferences(@Req() req: { user: { sub?: string; id?: string } }) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    return this.notificationsService.getUserPreferences(userId);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: { user: { sub?: string; id?: string } },
    @Body() dto: UpdatePreferencesDto,
  ) {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token.');
    }
    return this.notificationsService.updateUserPreferences(userId, dto);
  }
}
