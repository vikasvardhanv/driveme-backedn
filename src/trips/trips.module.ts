import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, PdfModule, EmailModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
