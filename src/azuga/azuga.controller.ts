import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { AzugaService } from './azuga.service';

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
    getVehicles() {
        return this.azugaService.getCachedVehicles();
    }

    @Get('vehicles/locations')
    getVehicleLocations() {
        return this.azugaService.getCachedVehicles();
    }
}
