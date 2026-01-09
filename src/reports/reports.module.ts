import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [ReportsService]
})
export class ReportsModule { }
