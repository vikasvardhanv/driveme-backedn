import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

export interface CachedVehicle {
  id: string;
  vehicleName: string;
  driverName: string | null;
  currentLat: number;
  currentLng: number;
  currentSpeed: number;
  address: string | null;
  lastLocationUpdate: string;
  ignitionStatus: string;
  status: 'moving' | 'idle' | 'offline';
  isMoving: boolean;
  make: string;
  model: string;
  vin: string;
}

@Injectable()
export class AzugaService {
  private readonly logger = new Logger(AzugaService.name);

  // In-memory cache of vehicle data from webhooks
  private vehicleCache: Map<string, CachedVehicle> = new Map();

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway
  ) {}

  /**
   * Get all cached vehicle data from webhooks
   */
  getCachedVehicles(): CachedVehicle[] {
    const vehicles = Array.from(this.vehicleCache.values());

    // Update status based on last update time
    const now = new Date();
    return vehicles.map(v => {
      const lastUpdate = new Date(v.lastLocationUpdate);
      const minutesAgo = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

      let status: 'moving' | 'idle' | 'offline' = v.status;
      if (minutesAgo > 10) {
        status = 'offline';
      }

      return { ...v, status, isMoving: status === 'moving' };
    });
  }

  /**
   * Process webhook data from Azuga
   * Handles various payload formats from Azuga webhooks
   */
  async processWebhookData(payload: any) {
    this.logger.log(`Received Azuga Webhook: ${JSON.stringify(payload)}`);

    try {
      // Handle array of events
      const events = Array.isArray(payload) ? payload :
                     payload.events ? payload.events :
                     payload.data ? (Array.isArray(payload.data) ? payload.data : [payload.data]) :
                     [payload];

      for (const event of events) {
        await this.processVehicleEvent(event);
      }
    } catch (error) {
      this.logger.error('Error processing Azuga Webhook', error);
    }
  }

  private async processVehicleEvent(event: any) {
    // Extract vehicle identifier (Azuga uses different field names)
    const vehicleId = event.vehicleId || event.serialNumber || event.vin || event.assetId || event.deviceId;

    if (!vehicleId) {
      this.logger.warn('Webhook event missing vehicle identifier');
      return;
    }

    // Extract location data
    const latitude = parseFloat(event.latitude || event.lat || event.gpsLatitude || 0);
    const longitude = parseFloat(event.longitude || event.lng || event.gpsLongitude || 0);
    const speed = parseFloat(event.speed || event.gpsSpeed || 0);

    // Extract other info
    const vehicleName = event.vehicleName || event.name || event.assetName || vehicleId;
    const driverName = event.driverName || event.driver?.name || event.driverFirstName ?
                       `${event.driverFirstName || ''} ${event.driverLastName || ''}`.trim() : null;
    const address = event.address || event.location || event.streetAddress || null;
    const ignitionStatus = event.ignitionStatus || event.ignition ||
                          (event.eventType === 'IGNITION_ON' ? 'Ignition On' :
                           event.eventType === 'IGNITION_OFF' ? 'Ignition Off' :
                           speed > 0 ? 'Ignition On' : 'Ignition Off');

    // Determine status
    const isMoving = speed > 2;
    const status: 'moving' | 'idle' | 'offline' = isMoving ? 'moving' :
                  ignitionStatus.toLowerCase().includes('on') ? 'idle' : 'offline';

    // Cache the vehicle data
    const cachedVehicle: CachedVehicle = {
      id: vehicleId,
      vehicleName,
      driverName,
      currentLat: latitude,
      currentLng: longitude,
      currentSpeed: speed,
      address,
      lastLocationUpdate: event.timestamp || event.eventTime || new Date().toISOString(),
      ignitionStatus,
      status,
      isMoving,
      make: event.make || 'Unknown',
      model: event.model || 'Unknown',
      vin: event.vin || vehicleId,
    };

    this.vehicleCache.set(vehicleId, cachedVehicle);
    this.logger.log(`Cached vehicle ${vehicleName}: ${latitude}, ${longitude} @ ${speed} mph (${ignitionStatus})`);

    // Broadcast to WebSocket for real-time updates
    this.trackingGateway.server.emit('vehicle:update', cachedVehicle);

    // Also try to update DB if vehicle exists
    try {
      const dbVehicle = await this.prisma.vehicle.findFirst({
        where: {
          OR: [
            { vin: vehicleId },
            { licensePlate: vehicleName },
          ]
        }
      });

      if (dbVehicle) {
        await this.prisma.vehicle.update({
          where: { id: dbVehicle.id },
          data: {
            currentLat: latitude,
            currentLng: longitude,
            currentSpeed: speed,
            lastLocationUpdate: new Date(),
          }
        });
      }
    } catch (dbError) {
      // DB update is optional, don't fail if it errors
      this.logger.debug(`DB update skipped for ${vehicleId}`);
    }
  }
}
