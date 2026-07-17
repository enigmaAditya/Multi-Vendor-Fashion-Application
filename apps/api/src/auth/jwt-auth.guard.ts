import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No token provided.');
    }

    try {
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_ACCESS_SECRET is required in production!');
      }
      const tokenSecret = secret || 'access-secret-key-12345';

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        roles: string[];
      }>(token, {
        secret: tokenSecret,
      });
      const reqWithUser = request as Request & {
        user: { sub: string; roles: string[] };
      };
      reqWithUser.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
