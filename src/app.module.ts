import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AzugaModule } from './azuga/azuga.module';
import { PrismaModule } from './prisma/prisma.module';
import { TrackingModule } from './tracking/tracking.module';
import { CompaniesModule } from './companies/companies.module';
import { ReportsModule } from './reports/reports.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TrackingModule,
    AzugaModule,
    CompaniesModule,
    ReportsModule,
    EmailModule,
    AuthModule,
    TripsModule,
    VehiclesModule,
    ApplicationsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
