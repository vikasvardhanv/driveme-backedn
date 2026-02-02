import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { AzugaService, CachedVehicle, CachedDriver, DriverSyncResult } from './azuga.service';

@Controller('azuga')
export class AzugaController {
    private readonly logger = new Logger(AzugaController.name);

    constructor(private readonly azugaService: AzugaService) { }

    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        this.logger.log('Received Azuga Webhook');
        await this.azugaService.processWebhookData(payload);
        return { status: 'received' };
    }

    @Get('vehicles')
    async getVehicles(): Promise<CachedVehicle[]> {
        const cachedVehicles = this.azugaService.getCachedVehicles();

        if (cachedVehicles.length === 0) {
            this.logger.log('Vehicle cache empty, fetching from Azuga...');
            try {
                await this.azugaService.syncVehiclesFromAzuga();
                return this.azugaService.getCachedVehicles();
            } catch (error) {
                this.logger.error('Failed to auto-fetch vehicles', error);
                return [];
            }
        }

        return cachedVehicles;
    }

    @Get('vehicles/locations')
    getVehicleLocations(): CachedVehicle[] {
        return this.azugaService.getCachedVehicles();
    }

    async getDrivers(): Promise<CachedDriver[]> {
        const cachedDrivers = this.azugaService.getCachedDrivers();

        if (cachedDrivers.length === 0) {
            this.logger.log('Cache empty, fetching drivers explicitly...');
            try {
                await this.azugaService.syncDriversFromAzuga();
                return this.azugaService.getCachedDrivers();
            } catch (error) {
                this.logger.error('Failed to auto-fetch drivers', error);
                return [];
            }
        }

        return cachedDrivers;
    }

    /**
     * Manually trigger driver sync from Azuga API
     */
    @Post('sync-drivers')
    async syncDrivers(): Promise<DriverSyncResult> {
        this.logger.log('Manual driver sync triggered');
        return this.azugaService.syncDriversFromAzuga();
    }

    /**
     * Get the status of the last driver sync
     */
    @Get('sync-status')
    getSyncStatus(): { lastSync: DriverSyncResult | null; message: string } {
        const lastSync = this.azugaService.getLastSyncResult();
        return {
            lastSync,
            message: lastSync
                ? `Last sync at ${lastSync.lastSyncAt}: ${lastSync.created} created, ${lastSync.updated} updated`
                : 'No sync has been performed yet',
        };
    }
}
