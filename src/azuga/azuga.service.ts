import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

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

export interface CachedDriver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  role: string;
  timezone: string | null;
  externalId: string | null;
  isActive: boolean;
}

export interface AzugaApiDriver {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  primaryContactNumber?: string;
  alternateContactNumber?: string;
  roleId?: string;
  userName?: string;
  licenseNumber?: string;
  licenseIssuedDate?: string;
  licenseExpiry?: string;
  licenseIssuedState?: string;
  fullName?: string;
}

export interface DriverSyncResult {
  synced: number;
  created: number;
  updated: number;
  errors: string[];
  lastSyncAt: string;
}

@Injectable()
export class AzugaService {
  private readonly logger = new Logger(AzugaService.name);

  // In-memory cache of vehicle data from webhooks
  private vehicleCache: Map<string, CachedVehicle> = new Map();
  // In-memory cache of driver data
  private driverCache: Map<string, CachedDriver> = new Map();
  // Last sync result
  private lastSyncResult: DriverSyncResult | null = null;

  // Azuga API configuration
  private readonly azugaApiKey = process.env.AZUGA_API_KEY;
  // Updated to correct API host based on documentation
  private readonly azugaBaseUrl = process.env.AZUGA_BASE_URL || 'https://services.azuga.com';

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private emailService: EmailService,
  ) { }

  /**
   * Get the last sync result
   */
  getLastSyncResult(): DriverSyncResult | null {
    return this.lastSyncResult;
  }

  /**
   * Scheduled job to sync drivers every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledDriverSync() {
    if (!this.azugaApiKey) {
      this.logger.warn('AZUGA_API_KEY not configured, skipping scheduled sync');
      return;
    }
    this.logger.log('Running scheduled Azuga driver sync...');
    await this.syncDriversFromAzuga();
  }

  /**
   * Fetch drivers from Azuga API
   */
  async fetchDriversFromApi(): Promise<AzugaApiDriver[]> {
    if (!this.azugaApiKey) {
      throw new Error('AZUGA_API_KEY environment variable is not configured');
    }

    try {
      // Reverting to raw key encoding (no colon) for debugging
      const authHeader = `Basic ${Buffer.from(this.azugaApiKey).toString('base64')}`;

      // SDK uses: limit, offset, userType as query params
      const endpoint = `https://api.azuga.com/azuga-ws/v1/users.json?userType=driver&limit=100&offset=0`;
      this.logger.log(`Azuga Auth Debug: KeyLoaded=${!!this.azugaApiKey}, KeyLen=${this.azugaApiKey?.length}, Header=${authHeader.substring(0, 15)}...`);
      this.logger.log(`Fetching Drivers from: ${endpoint} [POST]`);

      const response = await fetch(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          // SDK sends empty object as first arg
        }
      );

      if (!response.ok) {
        throw new Error(`Azuga API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.logger.log(`Fetched ${data.length || 0} drivers from Azuga API`);

      // Handle different response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data.users && Array.isArray(data.users)) {
        return data.users;
      } else if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to fetch drivers from Azuga API', error);
      throw error;
    }
  }

  /**
   * Generate a random temporary password
   */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Sync drivers from Azuga API to database and send welcome emails
   */
  async syncDriversFromAzuga(): Promise<DriverSyncResult> {
    const result: DriverSyncResult = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [],
      lastSyncAt: new Date().toISOString(),
    };

    try {
      const azugaDrivers = await this.fetchDriversFromApi();

      for (const azugaDriver of azugaDrivers) {
        try {
          const email = azugaDriver.email?.toLowerCase().trim();
          if (!email) {
            result.errors.push(`Driver ${azugaDriver.firstName} ${azugaDriver.lastName} has no email, skipped`);
            continue;
          }

          // Check if user already exists
          const existingUser = await this.prisma.user.findUnique({
            where: { email },
          });

          if (existingUser) {
            // Update existing user with Azuga data
            await this.prisma.user.update({
              where: { id: existingUser.id },
              data: {
                firstName: azugaDriver.firstName || existingUser.firstName,
                lastName: azugaDriver.lastName || existingUser.lastName,
                phone: azugaDriver.primaryContactNumber || existingUser.phone,
                licenseNumber: azugaDriver.licenseNumber || existingUser.licenseNumber,
                licenseExpiry: azugaDriver.licenseExpiry
                  ? new Date(azugaDriver.licenseExpiry)
                  : existingUser.licenseExpiry,
                isActive: true,
              },
            });
            result.updated++;

            // Also cache the driver
            this.cacheDriverFromAzuga(azugaDriver);
          } else {
            // Create new user
            const tempPassword = this.generateTempPassword();
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            await this.prisma.user.create({
              data: {
                email,
                password: hashedPassword,
                firstName: azugaDriver.firstName || 'Driver',
                lastName: azugaDriver.lastName || '',
                phone: azugaDriver.primaryContactNumber || null,
                role: 'DRIVER',
                licenseNumber: azugaDriver.licenseNumber || null,
                licenseExpiry: azugaDriver.licenseExpiry
                  ? new Date(azugaDriver.licenseExpiry)
                  : null,
                isActive: true,
              },
            });
            result.created++;

            // Send welcome email with credentials
            const fullName = `${azugaDriver.firstName || ''} ${azugaDriver.lastName || ''}`.trim() || 'Driver';
            await this.emailService.sendDriverWelcomeEmail(email, fullName, tempPassword);
            this.logger.log(`Created driver account and sent welcome email to ${email}`);

            // Cache the driver
            this.cacheDriverFromAzuga(azugaDriver);
          }

          result.synced++;
        } catch (driverError) {
          const errorMsg = `Failed to sync driver ${azugaDriver.email}: ${driverError.message}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      this.lastSyncResult = result;
      this.logger.log(`Driver sync complete: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);

      // Broadcast update to connected clients
      this.trackingGateway.server.emit('drivers:synced', result);

      return result;
    } catch (error) {
      result.errors.push(`Sync failed: ${error.message}`);
      this.lastSyncResult = result;
      throw error;
    }
  }

  /**
   * Cache driver from Azuga API response
   */
  private cacheDriverFromAzuga(azugaDriver: AzugaApiDriver) {
    const cachedDriver: CachedDriver = {
      id: azugaDriver.id,
      name: `${azugaDriver.firstName || ''} ${azugaDriver.lastName || ''}`.trim(),
      email: azugaDriver.email || null,
      phone: azugaDriver.primaryContactNumber || null,
      vehicleId: null,
      vehicleName: null,
      role: 'Driver',
      timezone: null,
      externalId: azugaDriver.id,
      isActive: true,
    };
    this.driverCache.set(azugaDriver.id, cachedDriver);
  }

  /**
   * Get all cached driver data
   */
  getCachedDrivers(): CachedDriver[] {
    return Array.from(this.driverCache.values());
  }

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

    // Also cache driver info if present
    if (driverName || event.driverId) {
      const driverId = event.driverId || event.driverExternalId || `driver-${vehicleId}`;
      const cachedDriver: CachedDriver = {
        id: driverId,
        name: driverName || 'Unknown Driver',
        email: event.driverEmail || null,
        phone: event.driverPhone || event.driverMobile || null,
        vehicleId: vehicleId,
        vehicleName: vehicleName,
        role: event.driverRole || 'Driver',
        timezone: event.timezone || null,
        externalId: event.driverExternalId || null,
        isActive: true,
      };
      this.driverCache.set(driverId, cachedDriver);
    }

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
        // Extract odometer data from webhook (Azuga sends this in various formats)
        const odometer = event.odometer || event.odometerReading || event.currentOdometer ||
                        event.totalDistance || event.mileage;

        const updateData: any = {
          currentLat: latitude,
          currentLng: longitude,
          currentSpeed: speed,
          lastLocationUpdate: new Date(),
        };

        // Update odometer if present
        if (odometer !== undefined && odometer !== null) {
          const odometerValue = parseInt(odometer.toString());
          if (!isNaN(odometerValue) && odometerValue > 0) {
            updateData.currentOdometer = odometerValue;
            this.logger.log(`Updating vehicle ${dbVehicle.id} odometer to ${odometerValue}`);
          }
        }

        await this.prisma.vehicle.update({
          where: { id: dbVehicle.id },
          data: updateData
        });

        // Auto-update active trip odometer readings
        await this.updateActiveTripOdometer(dbVehicle.id, updateData.currentOdometer);
      }
    } catch (dbError) {
      // DB update is optional, don't fail if it errors
      this.logger.debug(`DB update skipped for ${vehicleId}`);
    }
  }

  /**
   * Auto-update active trip odometer readings based on trip status
   */
  private async updateActiveTripOdometer(vehicleId: string, currentOdometer: number) {
    if (!currentOdometer || isNaN(currentOdometer)) {
      return;
    }

    try {
      // Find active trips for this vehicle
      const activeTrips = await this.prisma.trip.findMany({
        where: {
          vehicleId,
          status: {
            in: ['EN_ROUTE', 'ARRIVED', 'PICKED_UP']
          }
        }
      });

      for (const trip of activeTrips) {
        const updateData: any = {};

        // Update pickup odometer if trip just started (EN_ROUTE) and no pickup odometer yet
        if (trip.status === 'EN_ROUTE' && !trip.pickupOdometer) {
          updateData.pickupOdometer = currentOdometer;
          this.logger.log(`Auto-set pickup odometer for trip ${trip.id}: ${currentOdometer}`);
        }

        // Update dropoff odometer if trip is picked up (PICKED_UP)
        if (trip.status === 'PICKED_UP') {
          updateData.dropoffOdometer = currentOdometer;

          // Calculate trip miles if we have both odometers
          if (trip.pickupOdometer && currentOdometer > trip.pickupOdometer) {
            updateData.tripMiles = parseFloat(((currentOdometer - trip.pickupOdometer) / 10).toFixed(1));
            this.logger.log(`Auto-calculated trip miles for trip ${trip.id}: ${updateData.tripMiles}`);
          }
        }

        // Apply updates if any
        if (Object.keys(updateData).length > 0) {
          await this.prisma.trip.update({
            where: { id: trip.id },
            data: updateData
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error updating trip odometer: ${error.message}`);
    }
  }

  /**
   * Fetch vehicles from Azuga API
   */
  async fetchVehiclesFromApi(): Promise<any[]> {
    if (!this.azugaApiKey) {
      throw new Error('AZUGA_API_KEY environment variable is not configured');
    }

    try {
      // Reverting to raw key encoding (no colon)
      const authHeader = `Basic ${Buffer.from(this.azugaApiKey).toString('base64')}`;

      // V1 vehicles endpoint also uses POST (405 on GET)
      const endpoint = `https://api.azuga.com/azuga-ws/v1/vehicles.json`;
      this.logger.log(`Fetching Vehicles from: ${endpoint} [POST]`);

      const response = await fetch(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Azuga API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.logger.log(`Fetched ${data.length || 0} vehicles from Azuga API`);

      // Handle response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data.vehicles && Array.isArray(data.vehicles)) {
        return data.vehicles;
      } else if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to fetch vehicles from Azuga API', error);
      throw error;
    }
  }

  /**
   * Sync vehicles from Azuga API to database
   */
  async syncVehiclesFromAzuga(): Promise<DriverSyncResult> {
    const result: DriverSyncResult = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [],
      lastSyncAt: new Date().toISOString(),
    };

    try {
      const azugaVehicles = await this.fetchVehiclesFromApi();

      for (const vehicle of azugaVehicles) {
        try {
          const vin = vehicle.vin || vehicle.deviceSerial || vehicle.serialNumber;
          const licensePlate = vehicle.licensePlate || vehicle.vehicleName || vehicle.name;

          if (!vin || !licensePlate) {
            // Skip if essential identifiers are missing
            continue;
          }

          const make = vehicle.make || 'Unknown';
          const model = vehicle.model || 'Unknown';
          const year = parseInt(vehicle.year) || 2020; // Default year if missing

          // Check if vehicle exists
          const existingVehicle = await this.prisma.vehicle.findUnique({
            where: { vin },
          });

          if (existingVehicle) {
            // Update
            await this.prisma.vehicle.update({
              where: { id: existingVehicle.id },
              data: {
                make,
                model,
                year,
                licensePlate, // Ideally we shouldn't change unique fields easily, but if it changed in Azuga..
                currentSpeed: vehicle.speed ? parseFloat(vehicle.speed) : undefined,
                updatedAt: new Date(),
              }
            });
            result.updated++;
          } else {
            // Create
            // Need to handle licensePlate uniqueness too
            const existingPlate = await this.prisma.vehicle.findUnique({ where: { licensePlate } });
            if (existingPlate) {
              // If VIN is new but plate exists, maybe skip or update that one? 
              // For now, assume data integrity issue and skip or log
              this.logger.warn(`Vehicle creation conflict: License plate ${licensePlate} already exists for another VIN`);
              continue;
            }

            await this.prisma.vehicle.create({
              data: {
                make,
                model,
                year,
                licensePlate,
                vin,
                isActive: true,
                vehicleType: 'Taxi', // Default
                wheelchairAccessible: vehicle.vehicleType?.toLowerCase().includes('wheelchair') || false,
                oxygenCapable: false, // Default to false unless specified
              }
            });
            result.created++;
          }
          result.synced++;

          // Cache the vehicle
          this.cacheVehicleFromApi(vehicle);

        } catch (vError) {
          result.errors.push(`Failed to sync vehicle ${vehicle.vehicleName}: ${vError.message}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Vehicle sync failed', error);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Cache vehicle from Azuga API response
   */
  private cacheVehicleFromApi(vehicle: any) {
    const vin = vehicle.vin || vehicle.deviceSerial || vehicle.serialNumber;
    if (!vin) return;

    const vehicleName = vehicle.licensePlate || vehicle.vehicleName || vehicle.name || vin;
    const speed = vehicle.speed ? parseFloat(vehicle.speed) : 0;

    // Check existing cache to preserve location if API response lacks it
    const existingCache = this.vehicleCache.get(vin);

    const cachedVehicle: CachedVehicle = {
      id: vin,
      vehicleName,
      driverName: vehicle.driverName || (existingCache?.driverName) || null,
      currentLat: vehicle.latitude ? parseFloat(vehicle.latitude) : (existingCache?.currentLat || 0),
      currentLng: vehicle.longitude ? parseFloat(vehicle.longitude) : (existingCache?.currentLng || 0),
      currentSpeed: speed,
      address: vehicle.location || (existingCache?.address) || null,
      lastLocationUpdate: new Date().toISOString(),
      ignitionStatus: existingCache?.ignitionStatus || 'Unknown',
      status: speed > 0 ? 'moving' : (existingCache?.status || 'offline'),
      isMoving: speed > 0,
      make: vehicle.make || 'Unknown',
      model: vehicle.model || 'Unknown',
      vin: vin,
    };

    this.vehicleCache.set(vin, cachedVehicle);
  }
}
