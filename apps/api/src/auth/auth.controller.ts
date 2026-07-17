import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { OtpRequest, OtpVerify, GoogleAuth } from '@marketplace/types';

class OtpRequestDto implements OtpRequest {
  phone: string;
}

class OtpVerifyDto implements OtpVerify {
  phone: string;
  code: string;
}

class GoogleAuthDto implements GoogleAuth {
  idToken: string;
}

class RefreshDto {
  refreshToken?: string;
}

class LogoutDto {
  refreshToken?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() body: OtpRequestDto) {
    await this.authService.requestOtp(body.phone);
    return { message: 'OTP sent successfully.' };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() body: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(body.phone, body.code);

    // Set refresh token HttpOnly cookie for web clients
    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken, // Mobile clients store this in SecureStore
      user: result.user,
    };
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(
    @Body() body: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(body.idToken);

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() body: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Retrieve token from body or cookie
    const token =
      body.refreshToken ||
      (req.cookies as Record<string, string> | undefined)?.['refreshToken'];

    if (!token) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'AUTH_SESSION_INVALID',
        message: 'No refresh token provided.',
      });
    }

    try {
      const result = await this.authService.refreshSession(token);

      this.setRefreshTokenCookie(res, result.refreshToken);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (err: any) {
      // Clear cookie on failure
      res.clearCookie('refreshToken');
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Body() body: LogoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      body.refreshToken ||
      (req.cookies as Record<string, string> | undefined)?.['refreshToken'];
    if (token) {
      await this.authService.logout(token);
    }

    res.clearCookie('refreshToken');
    return { message: 'Logged out successfully.' };
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}
