import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as crypto from 'crypto';

export interface CreateTestUserOptions {
  id?: string;
  phone?: string;
  roles: string[];
  tokenVersion?: number;
}

export interface SignTestTokenOptions {
  secret?: string;
  expiresIn?: string;
}

export async function createTestUser(
  prisma: PrismaService,
  options: CreateTestUserOptions,
) {
  const id = options.id || crypto.randomUUID();
  const tokenVersion = options.tokenVersion ?? 0;
  const phone =
    options.phone || `+919${Math.floor(100000000 + Math.random() * 900000000)}`;

  return prisma.user.upsert({
    where: { id },
    update: {
      roles: options.roles,
      tokenVersion,
      phone,
    },
    create: {
      id,
      phone,
      roles: options.roles,
      tokenVersion,
    },
  });
}

export async function signTestToken(
  jwtService: JwtService,
  payload: {
    sub: string;
    roles: string[];
    token_version?: number;
  },
  options?: SignTestTokenOptions,
): Promise<string> {
  const secret =
    options?.secret ||
    process.env.JWT_ACCESS_SECRET ||
    'access-secret-key-12345';
  const expiresIn = options?.expiresIn || '15m';

  return jwtService.signAsync(
    {
      sub: payload.sub,
      roles: payload.roles,
      token_version: payload.token_version ?? 0,
    },
    {
      secret,
      expiresIn: expiresIn as any,
    },
  );
}

export async function createTestUserAndToken(
  prisma: PrismaService,
  jwtService: JwtService,
  options: CreateTestUserOptions,
  signOptions?: SignTestTokenOptions,
): Promise<{ id: string; token: string; user: any }> {
  const user = await createTestUser(prisma, options);
  const token = await signTestToken(
    jwtService,
    {
      sub: user.id,
      roles: user.roles,
      token_version: user.tokenVersion,
    },
    signOptions,
  );
  return { id: user.id, token, user };
}
