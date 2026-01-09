import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReportsService {
    private readonly logger = new Logger(ReportsService.name);

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
    ) { }

    async generateAndEmailReport(tripId: string) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                company: true,
                driver: true,
                vehicle: true,
                member: true,
            },
        });

        if (!trip) throw new Error('Trip not found');

        // 1. Load PDF Template
        const templatePath = path.join(process.cwd(), 'assets', 'AHCCCSDailyTripReportFinal.pdf');
        const pdfBuffer = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const form = pdfDoc.getForm();

        // 2. Fill Company/Provider Info
        if (trip.company) {
            this.safeFill(form, 'Provider ID', trip.company.ahcccsProviderId);
            this.safeFill(form, 'Provider Name', trip.company.name);
            this.safeFill(form, 'Provider Address', trip.company.address);
            this.safeFill(form, 'Provider Phone', trip.company.phone);
        }

        // 3. Fill Trip Info
        this.safeFill(form, 'Driver Name', `${trip.driver?.firstName} ${trip.driver?.lastName}`);
        this.safeFill(form, 'Vehicle License', trip.vehicle?.licensePlate || '');
        this.safeFill(form, 'Date', trip.scheduledPickupTime.toISOString().split('T')[0]);

        // Trip Row 1 (Assuming form has rows)
        const row = 1;
        this.safeFill(form, `Member Name ${row}`, `${trip.member?.firstName} ${trip.member?.lastName}`);
        this.safeFill(form, `Pickup Time ${row}`, trip.actualPickupTime?.toLocaleTimeString() || '');
        this.safeFill(form, `Drop Time ${row}`, trip.actualDropoffTime?.toLocaleTimeString() || '');
        this.safeFill(form, `Pickup Address ${row}`, trip.pickupAddress);
        this.safeFill(form, `Drop Address ${row}`, trip.dropoffAddress);

        // Odometer (from Azuga or manual)
        // Assuming odometer is tracked
        // this.safeFill(form, `Odometer Start ${row}`, '10000');
        // this.safeFill(form, `Odometer End ${row}`, '10010');

        // 4. Flatten and Save
        form.flatten();
        const generatedPdf = await pdfDoc.save();

        // 5. Email to Company
        if (trip.company?.email) {
            await this.emailService.sendTripReport(trip.company.email, trip.id, Buffer.from(generatedPdf));
        }

        return generatedPdf;
    }

    private safeFill(form: any, fieldName: string, value: string) {
        try {
            const field = form.getTextField(fieldName);
            if (field) {
                field.setText(value);
            }
        } catch (e) {
            this.logger.warn(`Field ${fieldName} not found in PDF`);
        }
    }
}
