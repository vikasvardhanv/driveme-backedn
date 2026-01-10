import { Module } from '@nestjs/common';
import { AzugaService } from './azuga.service';
import { AzugaController } from './azuga.controller';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Module({
  controllers: [AzugaController],
  providers: [AzugaService, TrackingGateway]
})
export class AzugaModule { }
