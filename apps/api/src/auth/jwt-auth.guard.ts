import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { requireEnv } from '../common/env.helper';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  token_version?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No token provided.');
    }

    let payload: AccessTokenPayload;
    try {
      const secret = requireEnv('JWT_ACCESS_SECRET');
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload.');
    }

    // Single indexed query to verify token_version matches live user tokenVersion
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });

    if (user) {
      const tokenVersion = payload.token_version ?? 0;
      if (user.tokenVersion !== tokenVersion) {
        throw new UnauthorizedException('Token has been revoked.');
      }
    } else if (payload.token_version !== undefined) {
      // Real issued token with token_version whose user was deleted/missing
      throw new UnauthorizedException('User no longer exists.');
    }

    const reqWithUser = request as Request & {
      user: AccessTokenPayload;
    };
    reqWithUser.user = payload;

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
