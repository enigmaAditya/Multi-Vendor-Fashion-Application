import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchProcessor } from './search.processor';
import { SearchController } from './search.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchProcessor],
  exports: [SearchService],
})
export class SearchModule {}
