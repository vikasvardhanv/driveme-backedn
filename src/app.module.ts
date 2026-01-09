import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AzugaModule } from './azuga/azuga.module';
import { PrismaModule } from './prisma/prisma.module';
import { TrackingGateway } from './tracking/tracking.gateway';
import { CompaniesModule } from './companies/companies.module';
import { ReportsModule } from './reports/reports.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AzugaModule,
    CompaniesModule,
    ReportsModule,
    EmailModule,
    AuthModule,
    TripsModule
  ],
  controllers: [AppController],
  providers: [AppService, TrackingGateway],
})
export class AppModule { }
