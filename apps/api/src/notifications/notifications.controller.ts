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
    @Req() req: { user: { id: string } },
    @Body() dto: RegisterTokenDto,
  ) {
    if (!dto.token || typeof dto.token !== 'string') {
      throw new BadRequestException('Device token is required.');
    }
    return this.notificationsService.registerDeviceToken(
      req.user.id,
      dto.token.trim(),
      dto.platform || 'WEB',
    );
  }

  @Delete('device-tokens/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDeviceToken(
    @Req() req: { user: { id: string } },
    @Param('token') token: string,
  ) {
    await this.notificationsService.removeDeviceToken(req.user.id, token);
  }

  @Get('preferences')
  async getPreferences(@Req() req: { user: { id: string } }) {
    return this.notificationsService.getUserPreferences(req.user.id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationsService.updateUserPreferences(req.user.id, dto);
  }
}
