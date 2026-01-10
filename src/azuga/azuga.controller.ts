import { Body, Controller, Logger, Post } from '@nestjs/common';
import { AzugaService } from './azuga.service';

@Controller('azuga')
export class AzugaController {
    private readonly logger = new Logger(AzugaController.name);

    constructor(private readonly azugaService: AzugaService) { }

    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        this.logger.log('Received Azuga Webhook:', JSON.stringify(payload));
        await this.azugaService.processWebhookData(payload);
        return { status: 'received' };
    }
}
