import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  BoxPosition,
  TextPosition,
  tripReportLayout,
} from './ahcccs-trip-report.layout';

export type TripReportData = {
  providerInfo?: string;
  driverName?: string;
  tripDate?: string;
  vehicleLicense?: string;
  vehicleMakeColor?: string;
  vehicleType?: string;

  ahcccsNumber?: string;
  memberDob?: string;
  memberName?: string;
  mailingAddress?: string;

  pickupAddress?: string;
  pickupTime?: string;
  pickupOdometer?: string | number;
  dropoffAddress?: string;
  dropoffTime?: string;
  dropoffOdometer?: string | number;
  tripMiles?: string | number;

  reasonForVisit?: string;
  escortName?: string;
  escortRelationship?: string;

  secondPickupAddress?: string;
  secondPickupTime?: string;
  secondPickupOdometer?: string | number;
  secondDropoffAddress?: string;
  secondDropoffTime?: string;
  secondDropoffOdometer?: string | number;
  secondTripMiles?: string | number;

  tripType?: string;
  memberSignature?: string;
  driverSignature?: string;
};

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly templatePath = path.join(
    __dirname,
    '..',
    '..',
    'templates',
    'AHCCCSDailyTripReportFinal.pdf',
  );

  constructor(private prisma: PrismaService) {}

  async generateTripReport(tripId: string): Promise<Buffer> {
    this.logger.log(`Generating AHCCCS Daily Trip Report for Trip: ${tripId}`);

    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          driver: true,
          member: true,
          vehicle: true,
          company: true,
        },
      });

      if (!trip) {
        throw new Error(`Trip ${tripId} not found`);
      }

      if (!trip.company) {
        throw new Error(`Trip ${tripId} has no company assigned`);
      }

      const reportData = this.buildTripReportData(trip);
      return this.generateTripReportFromData(reportData);
    } catch (error) {
      this.logger.error(`Error generating PDF for Trip ${tripId}`, error.stack);
      throw error;
    }
  }

  buildTripReportData(trip: any): TripReportData {
    const providerInfo = trip.company
      ? `Provider ID: ${trip.company.ahcccsProviderId || ''}\n${trip.company.name || ''}\n${trip.company.address || ''}${trip.company.city ? ', ' + trip.company.city : ''}${trip.company.state ? ', ' + trip.company.state : ''}${trip.company.zipCode ? ' ' + trip.company.zipCode : ''}\nPhone: ${trip.company.phone || ''}`
      : '';

    const tripDate = this.formatDate(
      trip.actualPickupTime || trip.tripStartTime || trip.scheduledPickupTime,
    );

    const pickupTime = this.formatTime(
      trip.actualPickupTime || trip.arrivedAtPickupTime || trip.tripStartTime,
    );
    const dropoffTime = this.formatTime(trip.actualDropoffTime);

    const tripMiles =
      trip.tripMiles ??
      (trip.pickupOdometer && trip.dropoffOdometer
        ? trip.dropoffOdometer - trip.pickupOdometer
        : undefined);

    return {
      providerInfo,
      driverName: trip.driver
        ? `${trip.driver.firstName} ${trip.driver.lastName}`
        : undefined,
      tripDate,
      vehicleLicense: trip.vehicle?.licensePlate,
      vehicleMakeColor: trip.vehicle
        ? `${trip.vehicle.make || ''} ${trip.vehicle.color || ''}`.trim()
        : undefined,
      vehicleType: trip.vehicle?.vehicleType,

      ahcccsNumber: trip.member?.ahcccsNumber,
      memberDob: this.formatDate(trip.member?.dateOfBirth),
      memberName: trip.member
        ? `${trip.member.firstName} ${trip.member.lastName}`
        : trip.customerName,
      mailingAddress: trip.member?.mailingAddress,

      pickupAddress: trip.pickupAddress,
      pickupTime,
      pickupOdometer: trip.pickupOdometer,
      dropoffAddress: trip.dropoffAddress,
      dropoffTime,
      dropoffOdometer: trip.dropoffOdometer,
      tripMiles,

      reasonForVisit: trip.reasonForVisit,
      escortName: trip.escortName,
      escortRelationship: trip.escortRelationship,

      secondPickupAddress: trip.secondPickupAddress,
      secondPickupTime: undefined,
      secondPickupOdometer: trip.secondPickupOdometer,
      secondDropoffAddress: trip.secondDropoffAddress,
      secondDropoffTime: undefined,
      secondDropoffOdometer: trip.secondDropoffOdometer,
      secondTripMiles: undefined,

      tripType: trip.tripType,
      driverSignature: trip.driverSignatureUrl,
      memberSignature: trip.memberSignatureUrl,
    };
  }

  async generateTripReportFromData(data: TripReportData): Promise<Buffer> {
    const templateBytes = await fs.readFile(this.templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    this.drawText(pages, font, data.providerInfo, tripReportLayout.providerInfo, 'providerInfo');
    this.drawText(pages, font, data.driverName, tripReportLayout.driverName, 'driverName');
    this.drawText(pages, font, data.tripDate, tripReportLayout.tripDate, 'tripDate');
    this.drawText(pages, font, data.vehicleLicense, tripReportLayout.vehicleLicense, 'vehicleLicense');
    this.drawText(pages, font, data.vehicleMakeColor, tripReportLayout.vehicleMakeColor, 'vehicleMakeColor');

    this.drawText(pages, font, data.ahcccsNumber, tripReportLayout.ahcccsNumber, 'ahcccsNumber');
    this.drawText(pages, font, data.memberDob, tripReportLayout.memberDob, 'memberDob');
    this.drawText(pages, font, data.memberName, tripReportLayout.memberName, 'memberName');
    this.drawText(pages, font, data.mailingAddress, tripReportLayout.mailingAddress, 'mailingAddress');

    this.drawText(pages, font, data.pickupAddress, tripReportLayout.pickupAddress, 'pickupAddress');
    this.drawText(pages, font, data.pickupTime, tripReportLayout.pickupTime, 'pickupTime');
    this.drawText(pages, font, this.formatNumber(data.pickupOdometer), tripReportLayout.pickupOdometer, 'pickupOdometer');
    this.drawText(pages, font, data.dropoffAddress, tripReportLayout.dropoffAddress, 'dropoffAddress');
    this.drawText(pages, font, data.dropoffTime, tripReportLayout.dropoffTime, 'dropoffTime');
    this.drawText(pages, font, this.formatNumber(data.dropoffOdometer), tripReportLayout.dropoffOdometer, 'dropoffOdometer');
    this.drawText(pages, font, this.formatNumber(data.tripMiles), tripReportLayout.tripMiles, 'tripMiles');

    this.drawText(pages, font, data.reasonForVisit, tripReportLayout.reasonForVisit, 'reasonForVisit');
    this.drawText(pages, font, data.escortName, tripReportLayout.escortName, 'escortName');
    this.drawText(pages, font, data.escortRelationship, tripReportLayout.escortRelationship, 'escortRelationship');

    this.drawText(pages, font, data.secondPickupAddress, tripReportLayout.secondPickupAddress, 'secondPickupAddress');
    this.drawText(pages, font, data.secondPickupTime, tripReportLayout.secondPickupTime, 'secondPickupTime');
    this.drawText(pages, font, this.formatNumber(data.secondPickupOdometer), tripReportLayout.secondPickupOdometer, 'secondPickupOdometer');
    this.drawText(pages, font, data.secondDropoffAddress, tripReportLayout.secondDropoffAddress, 'secondDropoffAddress');
    this.drawText(pages, font, data.secondDropoffTime, tripReportLayout.secondDropoffTime, 'secondDropoffTime');
    this.drawText(pages, font, this.formatNumber(data.secondDropoffOdometer), tripReportLayout.secondDropoffOdometer, 'secondDropoffOdometer');
    this.drawText(pages, font, this.formatNumber(data.secondTripMiles), tripReportLayout.secondTripMiles, 'secondTripMiles');

    this.drawTripTypeCheckboxes(pages, data.tripType);
    this.drawVehicleTypeCheckboxes(pages, data.vehicleType);

    await this.drawSignature(pages, pdfDoc, data.memberSignature, tripReportLayout.signatures?.member, 'memberSignature');
    await this.drawSignature(pages, pdfDoc, data.driverSignature, tripReportLayout.signatures?.driver, 'driverSignature');

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  async savePdfToStorage(pdfBuffer: Buffer, tripId: string): Promise<string> {
    const filename = `trip-report-${tripId}-${Date.now()}.pdf`;

    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      try {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_KEY,
        );

        const { error } = await supabase.storage
          .from('trip-reports')
          .upload(filename, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: false,
          });

        if (error) {
          throw new Error(`Storage upload error: ${error.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('trip-reports').getPublicUrl(filename);

        this.logger.log(`Uploaded generated PDF to Supabase: ${publicUrl}`);
        return publicUrl;
      } catch (e) {
        this.logger.warn(
          `Supabase upload failed: ${e.message}. Falling back to local storage.`,
        );
      }
    }

    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'reports');
    await fs.mkdir(uploadsDir, { recursive: true });
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, pdfBuffer);
    this.logger.log(`Saved PDF report to ${filepath}`);
    return `/uploads/reports/${filename}`;
  }

  private drawText(
    pages: any[],
    font: any,
    text: string | undefined,
    position: TextPosition | undefined,
    label: string,
  ) {
    if (!text) return;
    if (!position) {
      this.logger.warn(`Missing coordinates for ${label}`);
      return;
    }

    const page = pages[position.page] ?? pages[0];
    const size = position.size ?? 10;
    const lineHeight = position.lineHeight ?? size + 2;
    const lines = position.maxWidth
      ? this.wrapText(text, font, size, position.maxWidth)
      : [text];

    lines.forEach((line, index) => {
      const y = position.y - index * lineHeight;
      const x = this.getAlignedX(position, font, line, size);
      page.drawText(line, { x, y, size, font });
    });
  }

  private drawTripTypeCheckboxes(pages: any[], tripType?: string) {
    const checkboxes = tripReportLayout.checkboxes;
    if (!checkboxes || !tripType) return;

    this.drawCheckbox(
      pages,
      checkboxes.tripTypeOneWay,
      tripType === 'one-way',
      'tripTypeOneWay',
    );
    this.drawCheckbox(
      pages,
      checkboxes.tripTypeRoundTrip,
      tripType === 'round-trip',
      'tripTypeRoundTrip',
    );
    this.drawCheckbox(
      pages,
      checkboxes.tripTypeMultipleStops,
      tripType === 'multiple-stops',
      'tripTypeMultipleStops',
    );
  }

  private drawVehicleTypeCheckboxes(pages: any[], vehicleType?: string) {
    const checkboxes = tripReportLayout.checkboxes;
    if (!checkboxes || !vehicleType) return;

    const normalized = vehicleType.toLowerCase();
    this.drawCheckbox(
      pages,
      checkboxes.vehicleTaxi,
      normalized.includes('taxi'),
      'vehicleTaxi',
    );
    this.drawCheckbox(
      pages,
      checkboxes.vehicleWheelchairVan,
      normalized.includes('wheelchair'),
      'vehicleWheelchairVan',
    );
    this.drawCheckbox(
      pages,
      checkboxes.vehicleBus,
      normalized.includes('bus'),
      'vehicleBus',
    );
    this.drawCheckbox(
      pages,
      checkboxes.vehicleStretcherCar,
      normalized.includes('stretcher'),
      'vehicleStretcherCar',
    );
    this.drawCheckbox(
      pages,
      checkboxes.vehicleOther,
      normalized.includes('other'),
      'vehicleOther',
    );
  }

  private drawCheckbox(
    pages: any[],
    position: BoxPosition | undefined,
    shouldDraw: boolean,
    label: string,
  ) {
    if (!shouldDraw) return;
    if (!position) {
      this.logger.warn(`Missing coordinates for ${label}`);
      return;
    }
    const page = pages[position.page] ?? pages[0];
    const size = Math.min(position.width, position.height);
    page.drawText('X', {
      x: position.x,
      y: position.y,
      size: size || 10,
    });
  }

  private async drawSignature(
    pages: any[],
    pdfDoc: PDFDocument,
    dataUrl: string | undefined,
    position: BoxPosition | undefined,
    label: string,
  ) {
    if (!dataUrl) return;
    if (!position) {
      this.logger.warn(`Missing coordinates for ${label}`);
      return;
    }

    const page = pages[position.page] ?? pages[0];
    const image = await this.embedBase64Image(pdfDoc, dataUrl);
    if (!image) return;

    page.drawImage(image, {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
    });
  }

  private async embedBase64Image(pdfDoc: PDFDocument, dataUrl: string) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      return null;
    }

    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) return null;

    const imageBytes = Buffer.from(base64Data, 'base64');

    if (dataUrl.includes('image/png')) {
      return pdfDoc.embedPng(imageBytes);
    }
    if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) {
      return pdfDoc.embedJpg(imageBytes);
    }

    try {
      return pdfDoc.embedPng(imageBytes);
    } catch {
      return pdfDoc.embedJpg(imageBytes);
    }
  }

  private wrapText(text: string, font: any, size: number, maxWidth: number) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  private getAlignedX(position: TextPosition, font: any, text: string, size: number) {
    if (!position.align || position.align === 'left') {
      return position.x;
    }
    const textWidth = font.widthOfTextAtSize(text, size);
    if (position.align === 'center') {
      return position.x - textWidth / 2;
    }
    return position.x - textWidth;
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toLocaleDateString('en-US');
  }

  private formatTime(value?: Date | string | null) {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatNumber(value?: string | number) {
    if (value === undefined || value === null || value === '') return undefined;
    return typeof value === 'number' ? value.toString() : value;
  }
}
