import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [PrismaModule, PdfModule, EmailModule, TrackingModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
