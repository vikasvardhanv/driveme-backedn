import { Module, Global } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';

@Global()
@Module({
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class TrackingModule {}
