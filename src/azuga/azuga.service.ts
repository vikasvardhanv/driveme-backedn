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
  private readonly KM_TO_MILES = 0.621371;

  // In-memory cache of vehicle data from webhooks
  private vehicleCache: Map<string, CachedVehicle> = new Map();
  // In-memory cache of driver data
  private driverCache: Map<string, CachedDriver> = new Map();
  // Last sync result
  private lastSyncResult: DriverSyncResult | null = null;

  // Azuga API configuration
  private readonly clientId = process.env.AZUGA_CLIENT_ID;
  private readonly apiUsername = process.env.AZUGA_USERNAME;
  private readonly apiPassword = process.env.AZUGA_PASSWORD;
  // V3 OAuth endpoint (per user env config)
  private readonly azugaBaseUrl = process.env.AZUGA_BASE_URL || 'https://services.azuga.com/azuga-ws-oauth/v3';

  // Auth Token State
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null; // Timestamp in ms

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private emailService: EmailService,
  ) { }

  private toMiles(value: number, decimals?: number) {
    const miles = value * this.KM_TO_MILES;
    if (decimals === undefined) {
      return miles;
    }
    return parseFloat(miles.toFixed(decimals));
  }

  private normalizeOdometerMiles(value: any): number | null {
    const raw = parseFloat(value?.toString?.() ?? value);
    if (Number.isNaN(raw) || raw <= 0) {
      return null;
    }
    return Math.round(this.toMiles(raw));
  }

  private normalizeDistanceMiles(value: any): number | null {
    const raw = parseFloat(value?.toString?.() ?? value);
    if (Number.isNaN(raw) || raw <= 0) {
      return null;
    }
    return this.toMiles(raw, 1);
  }

  private parseAzugaTimestamp(event: any): Date | null {
    const candidates = [
      event?.locationTime,
      event?.eventTime,
      event?.timestamp,
      event?.time,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === 'number') {
        const ms = candidate < 1e12 ? candidate * 1000 : candidate;
        const date = new Date(ms);
        if (!Number.isNaN(date.getTime())) return date;
      }
      if (typeof candidate === 'string') {
        const numeric = candidate.match(/^\d+$/);
        if (numeric) {
          const num = parseInt(candidate, 10);
          const ms = num < 1e12 ? num * 1000 : num;
          const date = new Date(ms);
          if (!Number.isNaN(date.getTime())) return date;
        }
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    return null;
  }

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
    if (!this.clientId || !this.apiUsername || !this.apiPassword) {
      this.logger.warn('Azuga Credentials (CLIENT_ID, USERNAME, PASSWORD) not fully configured, skipping scheduled sync');
      return;
    }
    this.logger.log('Running scheduled Azuga driver sync...');
    await this.syncDriversFromAzuga();
  }

  /**
   * Authenticate with Azuga API to get JWT
   */
  async authenticate(): Promise<string> {
    // Check if current token is valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    this.logger.log('Authenticating with Azuga API...');

    if (!this.clientId || !this.apiUsername || !this.apiPassword) {
      throw new Error('Azuga Credentials not configured');
    }

    try {
      // Use the specific Auth URL provided
      const endpoint = 'https://auth.azuga.com/azuga-as/oauth2/login/oauthtoken.json?loginType=1';

      const payload = {
        clientId: this.clientId,
        userName: this.apiUsername,
        password: this.apiPassword
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Azuga Auth Failed: ${response.status} ${response.statusText}`);
      }

      const body = await response.json();
      // Expecting { data: { access_token: "...", expires_in: 15552000, ... } }
      const data = body.data || body;

      if (!data.access_token) {
        throw new Error('No access_token received from Azuga');
      }

      this.accessToken = data.access_token;
      // expires_in is usually in seconds
      const expiresInSec = data.expires_in || 3600;
      this.tokenExpiresAt = Date.now() + (expiresInSec * 1000);

      this.logger.log(`Azuga Auth Successful. Token expires in ${expiresInSec}s`);

      return this.accessToken as string;
    } catch (error) {
      this.logger.error('Azuga Authentication Error', error);
      throw error;
    }
  }

  /**
   * Fetch drivers from Azuga API
   */
  async fetchDriversFromApi(): Promise<AzugaApiDriver[]> {
    try {
      const token = await this.authenticate();

      // V3 Endpoint for Users (Drivers)
      // Endpoint: POST /users
      const endpoint = `${this.azugaBaseUrl}/users`;
      this.logger.log(`Fetching Drivers from: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST', // V3 uses POST
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}), // V3 requires empty body
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Azuga Drivers API Failed: ${response.status} ${response.statusText} - Body: ${errorText.substring(0, 500)}`);

        if (response.status === 401) {
          this.accessToken = null;
        }
        throw new Error(`Azuga API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
      }

      const body = await response.json();
      // V3 structure: { generatedAtInMillis: number, data: [...] }
      const drivers = body.data || [];

      this.logger.log(`Fetched ${drivers.length} drivers from Azuga API`);
      return drivers;
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
   * Scheduled job to sync vehicles every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledVehicleSync() {
    this.logger.log('Running scheduled Azuga vehicle sync...');
    await this.syncVehiclesFromAzuga();
  }

  /**
   * Sync vehicles from Azuga API to database
   */
  async syncVehiclesFromAzuga(): Promise<{ synced: number; created: number; updated: number; errors: string[] }> {
    const result = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    try {
      const azugaVehicles = await this.fetchVehiclesFromApi();

      for (const azugaVehicle of azugaVehicles) {
        try {
          // Identify by VIN or Serial Number
          const vin = azugaVehicle.vin || azugaVehicle.serialNumber || azugaVehicle.deviceSerialNo;
          const name = azugaVehicle.vehicleName || azugaVehicle.name || `Vehicle ${vin}`;

          if (!vin) {
            continue;
          }

          // Check if vehicle exists
          const existingVehicle = await this.prisma.vehicle.findFirst({
            where: {
              OR: [
                { vin: vin },
                { licensePlate: name }, // Fallback check
              ]
            }
          });

          const vehicleData = {
            make: azugaVehicle.make || 'Unknown',
            model: azugaVehicle.model || 'Unknown',
            year: azugaVehicle.year ? parseInt(azugaVehicle.year) : undefined,
            licensePlate: name, // Using name as license plate if not provided separately
            vin: vin,
            status: 'ACTIVE',
            // Update location if available
            currentLat: azugaVehicle.lastLocation?.latitude || azugaVehicle.latitude,
            currentLng: azugaVehicle.lastLocation?.longitude || azugaVehicle.longitude,
            lastLocationUpdate: new Date(),
          };

          if (existingVehicle) {
            await this.prisma.vehicle.update({
              where: { id: existingVehicle.id },
              data: vehicleData,
            });
            result.updated++;
          } else {
            await this.prisma.vehicle.create({
              data: {
                ...vehicleData,
                capacity: 4, // Default
                vehicleType: 'Sedan', // Default
              } as any,
            });
            result.created++;
          }
          result.synced++;

          // Update memory cache for controller usage
          const cachedVehicle: CachedVehicle = {
            id: vin,
            vehicleName: name,
            driverName: null,
            currentLat: vehicleData.currentLat || 0,
            currentLng: vehicleData.currentLng || 0,
            currentSpeed: azugaVehicle.speed ? parseFloat(azugaVehicle.speed) : 0,
            address: azugaVehicle.location || azugaVehicle.address || null,
            lastLocationUpdate: new Date().toISOString(),
            ignitionStatus: azugaVehicle.ignitionStatus || 'Unknown',
            status: (azugaVehicle.speed && parseFloat(azugaVehicle.speed) > 0) ? 'moving' : 'offline',
            isMoving: (azugaVehicle.speed && parseFloat(azugaVehicle.speed) > 0),
            make: vehicleData.make,
            model: vehicleData.model,
            vin: vin,
          };
          this.vehicleCache.set(vin, cachedVehicle);
        } catch (vError) {
          result.errors.push(`Failed to sync vehicle ${azugaVehicle.vehicleName}: ${vError.message}`);
        }
      }

      this.logger.log(`Vehicle sync complete: ${result.created} created, ${result.updated} updated`);
      return result;
    } catch (error) {
      this.logger.error('Failed to sync vehicles from Azuga', error);
      throw error;
    }
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
          // Handle missing email by generating a unique placeholder
          let email = azugaDriver.email?.toLowerCase().trim();
          if (!email) {
            // Use a consistent placeholder format that won't collide
            email = `no-email-${azugaDriver.id}@yaztrans.com`;
            this.logger.warn(`Driver ${azugaDriver.firstName} ${azugaDriver.lastName} has no email, using placeholder: ${email}`);
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
                isActive: true, // Reactivate if found in Azuga
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
        // Safe access to event type
        const eventType = event.eventType || event.event_type || event.type;
        if (!eventType) continue;

        this.logger.log(`Processing Azuga event: ${eventType}`);

        // Process different event types
        switch (eventType) {
          case 'Trip Start':
          case 'TRIP_START':
            await this.handleTripStartEvent(event);
            break;
          case 'Trip End':
          case 'TRIP_END':
            await this.handleTripEndEvent(event);
            break;
          case 'Trip Address':
          case 'TRIP_ADDRESS':
          case 'GPS MESSAGE':
          case 'GPS_MESSAGE':
            await this.processVehicleEvent(event);
            break;
          case 'Over Speeding':
          case 'OVER_SPEEDING':
          case 'Hard Acceleration':
          case 'HARD_ACCELERATION':
          case 'Hard Brake':
          case 'HARD_BRAKE':
            await this.handleSafetyEvent(event);
            break;
          default:
            // Process as general vehicle update
            await this.processVehicleEvent(event);
        }
      }
    } catch (error) {
      this.logger.error('Error processing Azuga Webhook', error);
    }
  }

  private async processVehicleEvent(event: any) {
    // Extract vehicle identifier (Azuga uses different field names)
    const vehicleId = event.vehicleId || event.serialNumber || event.serialNum || event.vin || event.assetId || event.deviceId;

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

        const eventTime = this.parseAzugaTimestamp(event);
        const updateData: any = {
          currentLat: latitude,
          currentLng: longitude,
          currentSpeed: speed,
          lastLocationUpdate: eventTime || new Date(),
        };

        // Update odometer if present
        if (odometer !== undefined && odometer !== null) {
          const odometerMiles = this.normalizeOdometerMiles(odometer);
          if (odometerMiles !== null) {
            updateData.currentOdometer = odometerMiles;
            this.logger.log(
              `Updating vehicle ${dbVehicle.id} odometer to ${odometerMiles} miles`,
            );
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
            updateData.tripMiles = parseFloat(
              (currentOdometer - trip.pickupOdometer).toFixed(1),
            );
            this.logger.log(
              `Auto-calculated trip miles for trip ${trip.id}: ${updateData.tripMiles}`,
            );
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
   * Handle Trip Start events from Azuga
   */
  private async handleTripStartEvent(event: any) {
    this.logger.log('Processing Trip Start event');

    const vehicleId = event.vehicleId || event.serialNumber || event.vin || event.assetId;
    const odometer = event.odometer || event.odometerReading || event.currentOdometer;
    const latitude = parseFloat(event.latitude || event.lat || event.gpsLatitude || 0);
    const longitude = parseFloat(event.longitude || event.lng || event.gpsLongitude || 0);

    if (!vehicleId) {
      this.logger.warn('Trip Start event missing vehicle identifier');
      return;
    }

    try {
      // Find the vehicle in DB
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          OR: [
            { vin: vehicleId },
            { licensePlate: vehicleId },
          ]
        }
      });

      if (!vehicle) {
        this.logger.warn(`Vehicle ${vehicleId} not found in database`);
        return;
      }

      const eventTime = this.parseAzugaTimestamp(event);

      // Find active trip for this vehicle
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: 'EN_ROUTE'
        }
      });

      if (activeTrip) {
        const updateData: any = {};

        // Set trip start time from Azuga event if missing
        if (eventTime && !activeTrip.tripStartTime) {
          updateData.tripStartTime = eventTime;
        }

        // Set trip start coordinates from Azuga GPS if missing
        if (latitude && longitude && !activeTrip.tripStartLat) {
          updateData.tripStartLat = latitude;
          updateData.tripStartLng = longitude;
        }

        // Set pickup odometer
        if (odometer) {
          const odometerMiles = this.normalizeOdometerMiles(odometer);
          if (odometerMiles !== null && !activeTrip.pickupOdometer) {
            updateData.pickupOdometer = odometerMiles;
          }
        }

        // Set pickup coordinates from Azuga GPS
        if (latitude && longitude && !activeTrip.pickupLat) {
          updateData.pickupLat = latitude;
          updateData.pickupLng = longitude;
          this.logger.log(`Set pickup coordinates for trip ${activeTrip.id}: ${latitude}, ${longitude}`);
        }

        if (Object.keys(updateData).length > 0) {
          await this.prisma.trip.update({
            where: { id: activeTrip.id },
            data: updateData
          });
          this.logger.log(`Updated trip ${activeTrip.id} on Trip Start`);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling Trip Start: ${error.message}`);
    }

    // Also process as regular vehicle event for location tracking
    await this.processVehicleEvent(event);
  }

  /**
   * Handle Trip End events from Azuga
   */
  private async handleTripEndEvent(event: any) {
    this.logger.log('Processing Trip End event');

    const vehicleId = event.vehicleId || event.serialNumber || event.vin || event.assetId;
    const odometer = event.odometer || event.odometerReading || event.currentOdometer;
    const tripDistance = event.tripDistance || event.distance || event.miles;
    const latitude = parseFloat(event.latitude || event.lat || event.gpsLatitude || 0);
    const longitude = parseFloat(event.longitude || event.lng || event.gpsLongitude || 0);

    if (!vehicleId) {
      this.logger.warn('Trip End event missing vehicle identifier');
      return;
    }

    try {
      // Find the vehicle in DB
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          OR: [
            { vin: vehicleId },
            { licensePlate: vehicleId },
          ]
        }
      });

      if (!vehicle) {
        this.logger.warn(`Vehicle ${vehicleId} not found in database`);
        return;
      }

      const eventTime = this.parseAzugaTimestamp(event);

      // Find active/picked up trip for this vehicle
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['EN_ROUTE', 'PICKED_UP', 'ARRIVED'] }
        }
      });

      if (activeTrip) {
        const updateData: any = {};

        // Set actual dropoff time from Azuga event if missing
        if (eventTime && !activeTrip.actualDropoffTime) {
          updateData.actualDropoffTime = eventTime;
        }

        // Set completed coordinates from Azuga GPS if missing
        if (latitude && longitude && !activeTrip.completedLat) {
          updateData.completedLat = latitude;
          updateData.completedLng = longitude;
        }

        // Set dropoff odometer
        if (odometer) {
          const odometerMiles = this.normalizeOdometerMiles(odometer);
          if (odometerMiles !== null) {
            updateData.dropoffOdometer = odometerMiles;

            // Calculate miles if we have pickup odometer
            if (activeTrip.pickupOdometer && odometerMiles > activeTrip.pickupOdometer) {
              updateData.tripMiles = parseFloat(
                (odometerMiles - activeTrip.pickupOdometer).toFixed(1),
              );
              this.logger.log(`Calculated trip miles: ${updateData.tripMiles}`);
            }
          }
        }

        // Set dropoff coordinates from Azuga GPS
        if (latitude && longitude && !activeTrip.dropoffLat) {
          updateData.dropoffLat = latitude;
          updateData.dropoffLng = longitude;
          this.logger.log(`Set dropoff coordinates for trip ${activeTrip.id}: ${latitude}, ${longitude}`);
        }

        // If Azuga provides trip distance directly
        if (tripDistance && !updateData.tripMiles) {
          const tripMiles = this.normalizeDistanceMiles(tripDistance);
          if (tripMiles !== null) {
            updateData.tripMiles = tripMiles;
          }
        }

        if (Object.keys(updateData).length > 0) {
          await this.prisma.trip.update({
            where: { id: activeTrip.id },
            data: updateData
          });
          this.logger.log(`Updated trip ${activeTrip.id} on Trip End`);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling Trip End: ${error.message}`);
    }

    // Also process as regular vehicle event
    await this.processVehicleEvent(event);
  }

  /**
   * Handle safety events (speeding, hard brake, etc.)
   */
  private async handleSafetyEvent(event: any) {
    const eventType = event.eventType || event.event_type || event.type;
    this.logger.log(`Safety Event: ${eventType}`);

    // Process as regular vehicle event to update location
    await this.processVehicleEvent(event);

    // TODO: Store safety events in database or send notifications
    // For now, just log them
  }

  async fetchVehiclesFromApi(): Promise<any[]> {
    try {
      const token = await this.authenticate();

      // V3 Endpoint for Vehicles (Trackees)
      // Endpoint: POST /trackees
      const endpoint = `${this.azugaBaseUrl}/trackees`;
      this.logger.log(`Fetching Vehicles from: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST', // V3 uses POST
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}), // V3 requires empty body
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Azuga Vehicles API Failed: ${response.status} ${response.statusText} - Body: ${errorText.substring(0, 500)}`);

        if (response.status === 401) {
          this.accessToken = null;
        }
        throw new Error(`Azuga API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
      }

      const body = await response.json();
      // V3 structure: { generatedAtInMillis: number, data: [...] }
      const vehicles = body.data || [];

      this.logger.log(`Fetched ${vehicles.length} vehicles from Azuga API`);
      return vehicles;
    } catch (error) {
      this.logger.error('Failed to fetch vehicles from Azuga API', error);
      throw error;
    }
  }

}
