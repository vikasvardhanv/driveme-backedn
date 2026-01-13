import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class AzugaService {
  private readonly logger = new Logger(AzugaService.name);

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway
  ) { }

  async processWebhookData(payload: any) {
    this.logger.debug(`Processing Webhook Data: ${JSON.stringify(payload)}`);
    // Azuga Payload Structure (Example - adjust based on real docs)
    // Assume payload has { serialNumber, latitude, longitude, speed, timestamp }
    // Or it might be a list of events.

    // Determine structure. Usually webhooks send an event array.
    // For MVP, handling a generic structure:
    const vehicleData = payload; // or payload.vehicle or payload.events[0]

    if (!vehicleData || !vehicleData.serialNumber) {
      this.logger.warn('Invalid Webhook Payload: Missing serialNumber');
      return;
    }

    const { serialNumber, latitude, longitude, speed } = vehicleData;

    try {
      // Find vehicle by serial/vin (Assuming serialNumber maps to VIN or a custom field)
      // For MVP, we assumed serialNumber matches our 'vin' or 'licensePlate'
      let vehicle = await this.prisma.vehicle.findFirst({
        where: { vin: serialNumber }
      });

      // If not found, try finding by name or just log warning
      if (!vehicle) {
        this.logger.warn(`Vehicle with Serial ${serialNumber} not found in DB.`);
        return;
      }

      this.logger.log(`Found Vehicle: ${vehicle.id} (Driver: ${vehicle.driverId})`);

      // Update DB
      const updatedVehicle = await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          currentLat: parseFloat(latitude),
          currentLng: parseFloat(longitude),
          // speed: speed // Add speed to schema if needed
          updatedAt: new Date(),
        }
      });

      this.logger.log(`Updated Vehicle ${vehicle.id} coordinates to ${latitude}, ${longitude}`);

      // Broadcast to Live Map
      // We need a userId for the map. If vehicle has a driver, use driverId.
      // If not, we might need to change map to support vehicleId-based updates.
      // For now, if driverId exists, broadcast it.
      if (updatedVehicle.driverId) {
        this.logger.log(`Broadcasting update for Driver ${updatedVehicle.driverId}`);
        this.trackingGateway.broadcastVehicleUpdate({
          userId: updatedVehicle.driverId,
          lat: updatedVehicle.currentLat!,
          lng: updatedVehicle.currentLng!,
          speed: parseFloat(speed) || 0,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.logger.warn(`Vehicle ${vehicle.id} has no driver assigned. Skipping broadcast.`);
      }

    } catch (error) {
      this.logger.error('Error processing Azuga Webhook', error);
    }
  }
}
