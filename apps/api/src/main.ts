import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
  ) {
    return this.toString();
  };
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
