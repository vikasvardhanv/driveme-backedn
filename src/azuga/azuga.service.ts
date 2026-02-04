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
  private readonly clientId = process.env.AZUGA_CLIENT_ID;
  private readonly apiUsername = process.env.AZUGA_USERNAME;
  private readonly apiPassword = process.env.AZUGA_PASSWORD;
  // Hardcoding verified endpoint to prevent env var misconfiguration (which caused 404s on services.azuga.com)
  private readonly azugaBaseUrl = 'https://api.azuga.com/azuga-ws/v1';

  // Auth Token State
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null; // Timestamp in ms

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
            // Some drivers might not have email, try username or skip
            // If strictly creating users, we need email unique
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

      // Find active trip for this vehicle
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: 'EN_ROUTE'
        }
      });

      if (activeTrip) {
        const updateData: any = {};

        // Set pickup odometer
        if (odometer) {
          const odometerValue = parseInt(odometer.toString());
          if (!isNaN(odometerValue) && !activeTrip.pickupOdometer) {
            updateData.pickupOdometer = odometerValue;
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

      // Find active/picked up trip for this vehicle
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['EN_ROUTE', 'PICKED_UP', 'ARRIVED'] }
        }
      });

      if (activeTrip) {
        const updateData: any = {};

        // Set dropoff odometer
        if (odometer) {
          const odometerValue = parseInt(odometer.toString());
          if (!isNaN(odometerValue)) {
            updateData.dropoffOdometer = odometerValue;

            // Calculate miles if we have pickup odometer
            if (activeTrip.pickupOdometer && odometerValue > activeTrip.pickupOdometer) {
              updateData.tripMiles = parseFloat(((odometerValue - activeTrip.pickupOdometer) / 10).toFixed(1));
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
          updateData.tripMiles = parseFloat(tripDistance.toString());
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
          const vin = vehicle.vin || vehicle.deviceSerial || vehicle.serialNumber || vehicle.serialNum;
          const licensePlate = vehicle.licensePlate || vehicle.licensePlateNo || vehicle.vehicleName || vehicle.name;

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
