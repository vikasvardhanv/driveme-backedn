import { Module, Global } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class TrackingModule {}
