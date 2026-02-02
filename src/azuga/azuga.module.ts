import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AzugaService } from './azuga.service';
import { AzugaController } from './azuga.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule, ScheduleModule.forRoot()],
  controllers: [AzugaController],
  providers: [AzugaService],
  exports: [AzugaService]
})
export class AzugaModule { }
