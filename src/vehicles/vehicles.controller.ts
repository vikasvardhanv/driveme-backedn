import { Controller, Get, Param, Logger } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { AzugaService } from '../azuga/azuga.service';

@Controller('vehicles')
export class VehiclesController {
  private readonly logger = new Logger(VehiclesController.name);

  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly azugaService: AzugaService
  ) { }

  @Get()
  async findAll() {
    const vehicles = await this.vehiclesService.findAll();

    if (vehicles.length === 0) {
      this.logger.log('No vehicles found in DB, attempting to sync from Azuga...');
      try {
        await this.azugaService.syncVehiclesFromAzuga();
        // Fetch again after sync
        return this.vehiclesService.findAll();
      } catch (error) {
        this.logger.error('Failed to auto-sync vehicles', error);
        return [];
      }
    }

    return vehicles;
  }

  @Get('locations')
  findAllWithLocations() {
    return this.vehiclesService.findAllWithLocations();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }
}
