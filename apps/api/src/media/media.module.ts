import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { MediaService } from './media.service';
import { MediaProcessor } from './media.processor';
import { UnconfirmedSweeperService } from './unconfirmed-sweeper.service';
import { MediaController } from './media.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MediaController],
  providers: [
    StorageService,
    MediaService,
    MediaProcessor,
    UnconfirmedSweeperService,
  ],
  exports: [StorageService, MediaService],
})
export class MediaModule {}
