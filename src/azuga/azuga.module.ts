import { Module } from '@nestjs/common';
import { AzugaService } from './azuga.service';
import { AzugaController } from './azuga.controller';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AzugaController],
  providers: [AzugaService, TrackingGateway],
  exports: [AzugaService]
})
export class AzugaModule { }
