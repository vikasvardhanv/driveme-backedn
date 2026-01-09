import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AzugaService {
  private readonly logger = new Logger(AzugaService.name);

  constructor(private prisma: PrismaService) { }

  // Poll Azuga every 30 seconds for live vehicle data
  // @Cron(CronExpression.EVERY_30_SECONDS)
  @Cron('*/30 * * * * *')
  async handleCron() {
    this.logger.debug('Polling Azuga for live vehicle locations...');

    const isProduction = process.env.NODE_ENV === 'production';
    const isMock = process.env.AZUGA_MOCK === 'true' || !isProduction;

    if (!isMock) {
      this.logger.warn('Azuga API integration is not configured; skipping poll.');
      return [];
    }

    // ... (Mock Logic) ...

    // 1. Authenticate with Azuga (Get Token)
    // const token = await this.getAccessToken();

    // 2. Fetch Live Data
    // const response = await axios.get('https://api.azuga.com/v3/vehicle/live', { headers: { Authorization: token } });

    // 3. Mock Response for MVP
    const mockVehicles = [
      {
        serialNumber: 'OBD-12345',
        vehicleName: 'Van-01',
        latitude: 33.4484, // Phoenix
        longitude: -112.0740,
        speed: 45,
        timestamp: new Date().toISOString(),
      },
      {
        serialNumber: 'OBD-67890',
        vehicleName: 'Sedan-02',
        latitude: 33.4255, // Tempe
        longitude: -111.9400,
        speed: 30,
        timestamp: new Date().toISOString(),
      }
    ];

    this.logger.log(`Received ${mockVehicles.length} vehicles from Azuga.`);

    // 4. Update Database (PostGIS)
    // await this.trackingService.updateVehicleLocation(vehicle);

    return mockVehicles;
  }
}
