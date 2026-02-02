import { Module } from '@nestjs/common';
import { AzugaModule } from '../azuga/azuga.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AzugaModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule { }
