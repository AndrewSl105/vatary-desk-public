import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DeskAiLocksModule } from '../ai/compose/locks.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerResolver } from '../iam';
import { PageCrdtAuth } from './pageCrdt.auth';
import { PageCrdtGateway } from './pageCrdt.gateway';
import { PageCrdtController } from './pageCrdt.controller';
import { PageYDocService } from './pageYDoc.service';

/**
 * Character-level collaborative editing for pages.
 *
 * Tables do not use it: a spreadsheet's unit of work is a cell with a
 * stable id, which cell operations merge exactly and more cheaply.
 */
@Module({
  imports: [PrismaModule, AuthModule, AccessModule, DeskAiLocksModule],
  controllers: [PageCrdtController],
  providers: [PageYDocService, PageCrdtAuth, PageCrdtGateway, OwnerResolver],
  exports: [PageCrdtGateway, PageYDocService],
})
export class PageCrdtModule {}
