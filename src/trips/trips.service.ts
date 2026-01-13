import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { Prisma } from '@prisma/client';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
    private emailService: EmailService,
  ) { }

  async create(createTripDto: CreateTripDto) {
    try {
      this.logger.log(`Creating trip: ${JSON.stringify(createTripDto)}`);

      // Parse scheduled date and time into a DateTime
      let scheduledPickupTime = new Date();
      if (createTripDto.scheduledDate && createTripDto.scheduledTime) {
        scheduledPickupTime = new Date(`${createTripDto.scheduledDate}T${createTripDto.scheduledTime}:00`);
      } else if (createTripDto.scheduledDate) {
        scheduledPickupTime = new Date(createTripDto.scheduledDate);
      }

      const data: Prisma.TripCreateInput = {
        pickupAddress: createTripDto.pickupAddress,
        pickupLat: createTripDto.pickupLat,
        pickupLng: createTripDto.pickupLng,
        dropoffAddress: createTripDto.dropoffAddress,
        dropoffLat: createTripDto.dropoffLat,
        dropoffLng: createTripDto.dropoffLng,
        customerName: createTripDto.customerName,
        customerPhone: createTripDto.customerPhone,
        customerEmail: createTripDto.customerEmail,
        notes: createTripDto.notes,
        tripType: createTripDto.tripType || 'one-way',
        scheduledPickupTime,
        status: 'SCHEDULED',
      };

      // Optionally connect to a member if provided
      if (createTripDto.memberId) {
        data.member = { connect: { id: createTripDto.memberId } };
      }
      if (createTripDto.companyId) {
        data.company = { connect: { id: createTripDto.companyId } };
      }

      const trip = await this.prisma.trip.create({ data });

      this.logger.log(`Trip created with ID: ${trip.id}`);
      return trip;
    } catch (error) {
      this.logger.error(`Error creating trip: ${error.message}`, error.stack);
      // Throwing HttpException to see the error in the response
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll() {
    const trips = await this.prisma.trip.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        driver: {
          select: { firstName: true, lastName: true },
        },
        member: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });
    return trips;
  }

  async findOne(id: string) {
    return this.prisma.trip.findUnique({
      where: { id },
      include: {
        driver: true,
        member: true,
        vehicle: true,
      },
    });
  }

  async update(id: string, updateTripDto: UpdateTripDto) {
    // Build update data carefully to avoid type issues
    const updateData: Prisma.TripUpdateInput = {};

    if (updateTripDto.pickupAddress !== undefined) updateData.pickupAddress = updateTripDto.pickupAddress;
    if (updateTripDto.pickupLat !== undefined) updateData.pickupLat = updateTripDto.pickupLat;
    if (updateTripDto.pickupLng !== undefined) updateData.pickupLng = updateTripDto.pickupLng;
    if (updateTripDto.dropoffAddress !== undefined) updateData.dropoffAddress = updateTripDto.dropoffAddress;
    if (updateTripDto.dropoffLat !== undefined) updateData.dropoffLat = updateTripDto.dropoffLat;
    if (updateTripDto.dropoffLng !== undefined) updateData.dropoffLng = updateTripDto.dropoffLng;
    if (updateTripDto.customerName !== undefined) updateData.customerName = updateTripDto.customerName;
    if (updateTripDto.customerPhone !== undefined) updateData.customerPhone = updateTripDto.customerPhone;
    if (updateTripDto.customerEmail !== undefined) updateData.customerEmail = updateTripDto.customerEmail;
    if (updateTripDto.notes !== undefined) updateData.notes = updateTripDto.notes;
    if (updateTripDto.tripType !== undefined) updateData.tripType = updateTripDto.tripType;
    if (updateTripDto.status !== undefined) updateData.status = updateTripDto.status as any;
    if (updateTripDto.pickupOdometer !== undefined) updateData.pickupOdometer = updateTripDto.pickupOdometer;
    if (updateTripDto.dropoffOdometer !== undefined) updateData.dropoffOdometer = updateTripDto.dropoffOdometer;
    if (updateTripDto.reasonForVisit !== undefined) updateData.reasonForVisit = updateTripDto.reasonForVisit;
    if (updateTripDto.escortName !== undefined) updateData.escortName = updateTripDto.escortName;
    if (updateTripDto.escortRelationship !== undefined) updateData.escortRelationship = updateTripDto.escortRelationship;

    if (updateTripDto.memberId) {
      updateData.member = { connect: { id: updateTripDto.memberId } };
    }
    if (updateTripDto.companyId) {
      updateData.company = { connect: { id: updateTripDto.companyId } };
    }
    if (updateTripDto.driverId) {
      updateData.driver = { connect: { id: updateTripDto.driverId } };
    }
    if (updateTripDto.vehicleId) {
      updateData.vehicle = { connect: { id: updateTripDto.vehicleId } };
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id },
      data: updateData,
    });

    // Check if trip was just completed - trigger PDF generation and email
    if (updateTripDto.status === 'COMPLETED' && updateData.status === 'COMPLETED') {
      this.logger.log(`Trip ${id} marked as COMPLETED - triggering PDF generation`);
      // Run PDF generation in background (don't block the response)
      this.generateAndEmailTripReport(id).catch((error) => {
        this.logger.error(
          `Failed to generate/email trip report for ${id}`,
          error.stack,
        );
      });
    }

    return updatedTrip;
  }

  /**
   * Generate AHCCCS PDF report and email it to the company
   */
  async generateAndEmailTripReport(tripId: string): Promise<void> {
    try {
      this.logger.log(`Generating AHCCCS PDF report for trip ${tripId}`);

      // Fetch trip with all related data
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
        throw new Error(`Trip ${tripId} has no company assigned - cannot send report`);
      }

      // Generate PDF
      const pdfBuffer = await this.pdfService.generateTripReport(tripId);

      // Save PDF URL to database
      const pdfUrl = await this.pdfService.savePdfToFile(pdfBuffer, tripId);
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { pdfReportUrl: pdfUrl },
      });

      // Prepare trip details for email
      const driverName = trip.driver
        ? `${trip.driver.firstName} ${trip.driver.lastName}`
        : 'Unassigned';
      const memberName = trip.member
        ? `${trip.member.firstName} ${trip.member.lastName}`
        : trip.customerName || 'Guest';
      const date = new Date(trip.scheduledPickupTime).toLocaleDateString('en-US');

      // Send email to company
      await this.emailService.sendTripReport(
        trip.company.email,
        tripId,
        pdfBuffer,
        {
          driverName,
          memberName,
          date,
          pickupAddress: trip.pickupAddress,
          dropoffAddress: trip.dropoffAddress,
        },
      );

      this.logger.log(
        `Successfully generated and emailed trip report for ${tripId} to ${trip.company.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error generating/emailing trip report for ${tripId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Manually trigger PDF generation for a specific trip (on-demand)
   */
  async generateTripReportManually(tripId: string): Promise<Buffer> {
    this.logger.log(`Manually generating PDF report for trip ${tripId}`);
    const pdfBuffer = await this.pdfService.generateTripReport(tripId);

    // Save PDF URL to database
    const pdfUrl = await this.pdfService.savePdfToFile(pdfBuffer, tripId);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { pdfReportUrl: pdfUrl },
    });

    return pdfBuffer;
  }

  async remove(id: string) {
    return this.prisma.trip.delete({
      where: { id },
    });
  }
}
