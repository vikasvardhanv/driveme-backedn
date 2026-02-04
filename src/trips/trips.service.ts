import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { Prisma } from '@prisma/client';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  private defaultCompanyId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
    private emailService: EmailService,
    private trackingGateway: TrackingGateway,
  ) {
    this.initializeDefaultCompany();
  }

  /**
   * Initialize and cache the default company (YazTrans)
   */
  private async initializeDefaultCompany() {
    try {
      // Try to find existing YazTrans company
      let company = await this.prisma.company.findFirst({
        where: {
          OR: [
            { name: { contains: 'YazTrans', mode: 'insensitive' } },
            { name: { contains: 'Yaz Trans', mode: 'insensitive' } },
          ],
        },
      });

      // If not found, create default company
      if (!company) {
        this.logger.log('Creating default YazTrans NEMT company...');
        company = await this.prisma.company.create({
          data: {
            name: 'YazTrans NEMT Services',
            ahcccsProviderId: 'YAZ001', // Update with real AHCCCS Provider ID
            address: '123 Main Street',
            city: 'Phoenix',
            state: 'AZ',
            zipCode: '85001',
            phone: '(555) 123-4567',
            email: 'dispatch@yaztrans.com',
          },
        });
        this.logger.log(`Created default company: ${company.id}`);
      }

      this.defaultCompanyId = company.id;
      this.logger.log(`Default company initialized: ${company.name} (${company.id})`);
    } catch (error) {
      this.logger.error('Failed to initialize default company:', error);
    }
  }

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

        // Metrics & GPS (if provided during creation)
        tripStartTime: createTripDto.tripStartTime ? new Date(createTripDto.tripStartTime) : undefined,
        arrivedAtPickupTime: createTripDto.arrivedAtPickupTime ? new Date(createTripDto.arrivedAtPickupTime) : undefined,
        actualPickupTime: createTripDto.actualPickupTime ? new Date(createTripDto.actualPickupTime) : undefined,
        actualDropoffTime: createTripDto.actualDropoffTime ? new Date(createTripDto.actualDropoffTime) : undefined,
        startOdometer: createTripDto.startOdometer,
        pickupOdometer: createTripDto.pickupOdometer,
        dropoffOdometer: createTripDto.dropoffOdometer,
        emptyMiles: createTripDto.emptyMiles,
        loadedMiles: createTripDto.loadedMiles,
        tripMiles: createTripDto.tripMiles,
        tripStartLat: createTripDto.tripStartLat,
        tripStartLng: createTripDto.tripStartLng,
        arrivedAtPickupLat: createTripDto.arrivedAtPickupLat,
        arrivedAtPickupLng: createTripDto.arrivedAtPickupLng,
        pickedUpLat: createTripDto.pickedUpLat,
        pickedUpLng: createTripDto.pickedUpLng,
        completedLat: createTripDto.completedLat,
        completedLng: createTripDto.completedLng,
      };

      // Optionally connect to a member if provided
      if (createTripDto.memberId) {
        data.member = { connect: { id: createTripDto.memberId } };
      }

      // Auto-assign default company if not provided
      const companyId = createTripDto.companyId || this.defaultCompanyId;
      if (companyId) {
        data.company = { connect: { id: companyId } };
        this.logger.log(`Assigning trip to company: ${companyId}`);
      } else {
        this.logger.warn('No default company available - trip created without company');
      }

      const trip = await this.prisma.trip.create({
        data,
        include: {
          driver: true,
          member: true,
          vehicle: true,
          company: true,
        },
      });

      this.logger.log(`Trip created with ID: ${trip.id}`);

      // Broadcast trip creation to all dispatchers
      this.trackingGateway.broadcastTripUpdate(trip);

      return trip;
    } catch (error) {
      this.logger.error(`Error creating trip: ${error.message}`, error.stack);
      // Throwing HttpException to see the error in the response
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(startDate?: string, endDate?: string) {
    const where: Prisma.TripWhereInput = {};

    if (startDate) {
      this.logger.log(`Filtering trips from ${startDate} to ${endDate || startDate}`);
      // Parse start date
      const start = new Date(`${startDate}T00:00:00`);

      // Determine end date
      // If endDate is provided, use it. Otherwise, assume single day filtering (end of startDate)
      const endString = endDate || startDate;
      const end = new Date(`${endString}T23:59:59`);

      where.scheduledPickupTime = {
        gte: start,
        lte: end,
      };
    } else {
      this.logger.log('No date filter provided - returning all trips');
    }

    this.logger.log(`Querying trips with where clause: ${JSON.stringify(where)}`);

    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: { scheduledPickupTime: 'asc' }, // Sort by time for the dashboard
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
    try {
      this.logger.log(`Updating trip ${id}: ${JSON.stringify(updateTripDto)}`);

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

      // Time tracking
      if (updateTripDto.tripStartTime !== undefined) updateData.tripStartTime = updateTripDto.tripStartTime ? new Date(updateTripDto.tripStartTime) : null;
      if (updateTripDto.arrivedAtPickupTime !== undefined) updateData.arrivedAtPickupTime = updateTripDto.arrivedAtPickupTime ? new Date(updateTripDto.arrivedAtPickupTime) : null;
      if (updateTripDto.actualPickupTime !== undefined) updateData.actualPickupTime = updateTripDto.actualPickupTime ? new Date(updateTripDto.actualPickupTime) : null;
      if (updateTripDto.actualDropoffTime !== undefined) updateData.actualDropoffTime = updateTripDto.actualDropoffTime ? new Date(updateTripDto.actualDropoffTime) : null;

      // Odometer & Mileage
      if (updateTripDto.startOdometer !== undefined) updateData.startOdometer = updateTripDto.startOdometer;
      if (updateTripDto.emptyMiles !== undefined) updateData.emptyMiles = updateTripDto.emptyMiles;
      if (updateTripDto.loadedMiles !== undefined) updateData.loadedMiles = updateTripDto.loadedMiles;
      if (updateTripDto.tripMiles !== undefined) updateData.tripMiles = updateTripDto.tripMiles;

      // GPS Coordinates
      if (updateTripDto.tripStartLat !== undefined) updateData.tripStartLat = updateTripDto.tripStartLat;
      if (updateTripDto.tripStartLng !== undefined) updateData.tripStartLng = updateTripDto.tripStartLng;
      if (updateTripDto.arrivedAtPickupLat !== undefined) updateData.arrivedAtPickupLat = updateTripDto.arrivedAtPickupLat;
      if (updateTripDto.arrivedAtPickupLng !== undefined) updateData.arrivedAtPickupLng = updateTripDto.arrivedAtPickupLng;
      if (updateTripDto.pickedUpLat !== undefined) updateData.pickedUpLat = updateTripDto.pickedUpLat;
      if (updateTripDto.pickedUpLng !== undefined) updateData.pickedUpLng = updateTripDto.pickedUpLng;
      if (updateTripDto.completedLat !== undefined) updateData.completedLat = updateTripDto.completedLat;
      if (updateTripDto.completedLng !== undefined) updateData.completedLng = updateTripDto.completedLng;

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

      // Get the current trip to check for driver assignment changes
      const currentTrip = await this.prisma.trip.findUnique({
        where: { id },
        select: { driverId: true, status: true },
      });

      if (!currentTrip) {
        throw new HttpException(`Trip ${id} not found`, HttpStatus.NOT_FOUND);
      }

      const updatedTrip = await this.prisma.trip.update({
        where: { id },
        data: updateData,
        include: {
          driver: true,
          member: true,
          vehicle: true,
          company: true,
        },
      });

      this.logger.log(`Trip ${id} updated successfully`);

      // Check if driver was just assigned (new assignment)
      const wasDriverAssigned = updateTripDto.driverId &&
        currentTrip?.driverId !== updateTripDto.driverId;

      if (wasDriverAssigned) {
        this.logger.log(`Trip ${id} assigned to driver ${updateTripDto.driverId}`);
        // Broadcast to the specific driver via WebSocket
        this.trackingGateway.broadcastTripAssignment(updateTripDto.driverId!, updatedTrip);
      } else {
        // Broadcast general trip update
        this.trackingGateway.broadcastTripUpdate(updatedTrip);
      }

      // Check if trip was just completed - trigger PDF generation and email
      if (updateTripDto.status === 'COMPLETED') {
        this.logger.log(`Trip ${id} marked as COMPLETED - triggering PDF generation`);
        // Run PDF generation in background (don't block the response)
        this.generateAndEmailTripReport(id).catch((error) => {
          this.logger.error(
            `Failed to generate/email trip report for ${id}`,
            error.stack,
          );
        });
      }

      // Check if trip was cancelled
      if (updateTripDto.status === 'CANCELLED') {
        this.trackingGateway.broadcastTripCancellation(id, currentTrip?.driverId || undefined);
      }

      return updatedTrip;
    } catch (error) {
      this.logger.error(`Error updating trip ${id}: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to update trip: ${error.message}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
  async findAllDrivers() {
    return this.prisma.user.findMany({
      where: { role: 'DRIVER' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            licensePlate: true,
          }
        }
      },
    });
  }

  /**
   * Update existing trips to assign default company and regenerate PDFs
   * Call this once to fix existing data
   */
  async assignDefaultCompanyToExistingTrips() {
    if (!this.defaultCompanyId) {
      throw new Error('Default company not initialized');
    }

    this.logger.log('Assigning default company to existing trips...');

    // Find trips without company
    const tripsWithoutCompany = await this.prisma.trip.findMany({
      where: { companyId: null },
      select: { id: true, status: true, driverSignatureUrl: true, memberSignatureUrl: true },
    });

    this.logger.log(`Found ${tripsWithoutCompany.length} trips without company`);

    // Update all trips to have the default company
    await this.prisma.trip.updateMany({
      where: { companyId: null },
      data: { companyId: this.defaultCompanyId },
    });

    this.logger.log('Company assigned to all trips');

    // Regenerate PDFs for completed trips with signatures but no PDF
    const tripsNeedingPDF = tripsWithoutCompany.filter(
      t => t.status === 'COMPLETED' &&
        (t.driverSignatureUrl || t.memberSignatureUrl)
    );

    this.logger.log(`Regenerating ${tripsNeedingPDF.length} PDFs...`);

    for (const trip of tripsNeedingPDF) {
      try {
        await this.generateAndEmailTripReport(trip.id);
        this.logger.log(`PDF generated for trip ${trip.id}`);
      } catch (error) {
        this.logger.error(`Failed to generate PDF for trip ${trip.id}:`, error);
      }
    }

    return {
      tripsUpdated: tripsWithoutCompany.length,
      pdfsGenerated: tripsNeedingPDF.length,
    };
  }
}
