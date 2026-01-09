import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailService.name);
    private readonly fromAddress: string;

    constructor() {
        const isProduction = process.env.NODE_ENV === 'production';
        const host = process.env.SMTP_HOST;
        const port = Number.parseInt(process.env.SMTP_PORT ?? '', 10) || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        this.fromAddress = process.env.SMTP_FROM ?? '"YazDrive System" <system@yazdrive.com>';

        if (!host || !user || !pass) {
            const message = 'SMTP configuration is missing; email sending is disabled.';
            this.logger.warn(message);
            this.transporter = nodemailer.createTransport({ jsonTransport: true });
            return;
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user,
                pass,
            },
        });
    }

    async sendTripReport(to: string, tripId: string, pdfBuffer: Buffer) {
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Daily Trip Report: ${tripId}`,
                text: 'Please find attached the signed AHCCCS Daily Trip Report.',
                attachments: [
                    {
                        filename: `Trip_${tripId}.pdf`,
                        content: pdfBuffer,
                    },
                ],
            });
            this.logger.log(`Email sent: ${info.messageId}`);
        } catch (error) {
            this.logger.error('Failed to send email', error);
            throw error;
        }
    }
}
