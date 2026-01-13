import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, rgb } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly templatePath = path.join(
    __dirname,
    '..',
    '..',
    'templates',
    'ahcccs-daily-trip-report.pdf',
  );

  constructor(private prisma: PrismaService) { }

  async generateTripReport(tripId: string): Promise<Buffer> {
    this.logger.log(`Generating AHCCCS Daily Trip Report for Trip: ${tripId}`);

    try {
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
        throw new Error(`Trip ${tripId} has no company assigned`);
      }

      // Load the PDF template
      const templateBytes = await fs.readFile(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();

      // Fill in NEMT Provider Information
      this.fillProviderInfo(form, trip.company);

      // Fill in Driver and Vehicle Information
      this.fillDriverVehicleInfo(form, trip);

      // Fill in Member Information
      this.fillMemberInfo(form, trip);

      // Fill in Trip Details
      this.fillTripDetails(form, trip);

      // Flatten the form to make it non-editable
      form.flatten();

      // Save the filled PDF
      const pdfBytes = await pdfDoc.save();
      this.logger.log(`Successfully generated PDF for Trip ${tripId}`);

      return Buffer.from(pdfBytes);
    } catch (error) {
      this.logger.error(
        `Error generating PDF for Trip ${tripId}`,
        error.stack,
      );
      throw error;
    }
  }

  private fillProviderInfo(form: PDFForm, company: any) {
    try {
      // NEMT AHCCCS Provider ID, Name, Address, and Phone Number
      const providerInfoText = `Provider ID: ${company.ahcccsProviderId}\n${company.name}\n${company.address}${company.city ? ', ' + company.city : ''}${company.state ? ', ' + company.state : ''}${company.zipCode ? ' ' + company.zipCode : ''}\nPhone: ${company.phone}`;

      const providerField = form.getTextField('NEMT_Provider_Info');
      if (providerField) {
        providerField.setText(providerInfoText);
      }
    } catch (error) {
      this.logger.warn('Could not fill provider info fields', error.message);
    }
  }

  private fillDriverVehicleInfo(form: PDFForm, trip: any) {
    try {
      // Driver's Name
      if (trip.driver) {
        const driverName = `${trip.driver.firstName} ${trip.driver.lastName}`;
        this.setTextField(form, 'Drivers_Name', driverName);
      }

      // Date
      const date = new Date(trip.scheduledPickupTime).toLocaleDateString(
        'en-US',
      );
      this.setTextField(form, 'Date', date);

      // Vehicle Information
      if (trip.vehicle) {
        this.setTextField(
          form,
          'Vehicle_License_Fleet_ID',
          trip.vehicle.licensePlate,
        );
        this.setTextField(
          form,
          'Vehicle_Make_Color',
          `${trip.vehicle.make} ${trip.vehicle.color || ''}`,
        );

        // Vehicle Type checkboxes
        this.setVehicleTypeCheckbox(form, trip.vehicle.vehicleType);
      }
    } catch (error) {
      this.logger.warn(
        'Could not fill driver/vehicle info fields',
        error.message,
      );
    }
  }

  private fillMemberInfo(form: PDFForm, trip: any) {
    try {
      // AHCCCS Number
      if (trip.member?.ahcccsNumber) {
        this.setTextField(form, 'AHCCCS_Number', trip.member.ahcccsNumber);
      }

      // Date of Birth
      if (trip.member?.dateOfBirth) {
        const dob = new Date(trip.member.dateOfBirth).toLocaleDateString(
          'en-US',
        );
        this.setTextField(form, 'Date_of_Birth', dob);
      }

      // Member Name
      if (trip.member) {
        const memberName = `${trip.member.firstName} ${trip.member.lastName}`;
        this.setTextField(form, 'Member_Name', memberName);
      } else if (trip.customerName) {
        this.setTextField(form, 'Member_Name', trip.customerName);
      }

      // Mailing Address
      if (trip.member?.mailingAddress) {
        this.setTextField(form, 'Mailing_Address', trip.member.mailingAddress);
      }
    } catch (error) {
      this.logger.warn('Could not fill member info fields', error.message);
    }
  }

  private fillTripDetails(form: PDFForm, trip: any) {
    try {
      // 1st Pick-Up Location
      this.setTextField(form, '1st_Pickup_Location', trip.pickupAddress);

      // 1st Pick-Up Time
      if (trip.actualPickupTime) {
        const pickupTime = new Date(trip.actualPickupTime).toLocaleTimeString(
          'en-US',
          { hour: '2-digit', minute: '2-digit' },
        );
        this.setTextField(form, '1st_Pickup_Time', pickupTime);
      }

      // 1st Pick-Up Odometer
      if (trip.pickupOdometer) {
        this.setTextField(
          form,
          '1st_Pickup_Odometer',
          trip.pickupOdometer.toString(),
        );
      }

      // 1st Drop-Off Location
      this.setTextField(form, '1st_Dropoff_Location', trip.dropoffAddress);

      // 1st Drop-Off Time
      if (trip.actualDropoffTime) {
        const dropoffTime = new Date(trip.actualDropoffTime).toLocaleTimeString(
          'en-US',
          { hour: '2-digit', minute: '2-digit' },
        );
        this.setTextField(form, '1st_Dropoff_Time', dropoffTime);
      }

      // 1st Drop-Off Odometer
      if (trip.dropoffOdometer) {
        this.setTextField(
          form,
          '1st_Dropoff_Odometer',
          trip.dropoffOdometer.toString(),
        );
      }

      // Trip Miles
      if (trip.tripMiles) {
        this.setTextField(form, '1st_Trip_Miles', trip.tripMiles.toString());
      } else if (trip.pickupOdometer && trip.dropoffOdometer) {
        const miles = trip.dropoffOdometer - trip.pickupOdometer;
        this.setTextField(form, '1st_Trip_Miles', miles.toString());
      }

      // Type of Trip
      this.setTripTypeCheckbox(form, trip.tripType, '1st_Trip');

      // Reason for Visit
      if (trip.reasonForVisit) {
        this.setTextField(form, 'Reason_for_Visit', trip.reasonForVisit);
      }

      // Escort Information
      if (trip.escortName) {
        this.setTextField(form, 'Name_of_Escort', trip.escortName);
      }
      if (trip.escortRelationship) {
        this.setTextField(form, 'Relationship', trip.escortRelationship);
      }

      // For Round Trips - 2nd Pickup/Dropoff
      if (
        trip.tripType === 'round-trip' ||
        trip.tripType === 'multiple-stops'
      ) {
        if (trip.secondPickupAddress) {
          this.setTextField(
            form,
            '2nd_Pickup_Location',
            trip.secondPickupAddress,
          );
        }

        if (trip.secondPickupOdometer) {
          this.setTextField(
            form,
            '2nd_Pickup_Odometer',
            trip.secondPickupOdometer.toString(),
          );
        }

        if (trip.secondDropoffAddress) {
          this.setTextField(
            form,
            '2nd_Dropoff_Location',
            trip.secondDropoffAddress,
          );
        }

        if (trip.secondDropoffOdometer) {
          this.setTextField(
            form,
            '2nd_Dropoff_Odometer',
            trip.secondDropoffOdometer.toString(),
          );
        }

        // 2nd Trip Miles
        if (trip.secondPickupOdometer && trip.secondDropoffOdometer) {
          const miles = trip.secondDropoffOdometer - trip.secondPickupOdometer;
          this.setTextField(form, '2nd_Trip_Miles', miles.toString());
        }

        // Type of 2nd Trip
        this.setTripTypeCheckbox(form, trip.tripType, '2nd_Trip');
      }
    } catch (error) {
      this.logger.warn('Could not fill trip detail fields', error.message);
    }
  }

  private setTextField(form: PDFForm, fieldName: string, value: string) {
    try {
      const field = form.getTextField(fieldName);
      if (field) {
        field.setText(value);
      }
    } catch (error) {
      this.logger.debug(`Field ${fieldName} not found or not a text field`);
    }
  }

  private setVehicleTypeCheckbox(form: PDFForm, vehicleType: string) {
    try {
      const checkboxMap: Record<string, string> = {
        'Wheelchair Van': 'Wheelchair_Van',
        Taxi: 'Taxi',
        Bus: 'Bus',
        'Stretcher Car': 'Stretcher_Car',
        Other: 'Other_Vehicle',
      };

      const checkboxName = checkboxMap[vehicleType];
      if (checkboxName) {
        const checkbox = form.getCheckBox(checkboxName);
        if (checkbox) {
          checkbox.check();
        }
      }
    } catch (error) {
      this.logger.debug(`Could not set vehicle type checkbox: ${error.message}`);
    }
  }

  private setTripTypeCheckbox(
    form: PDFForm,
    tripType: string,
    prefix: string,
  ) {
    try {
      const checkboxMap: Record<string, string> = {
        'one-way': `${prefix}_One_Way`,
        'round-trip': `${prefix}_Round_Trip`,
        'multiple-stops': `${prefix}_Multiple_Stops`,
      };

      const checkboxName = checkboxMap[tripType];
      if (checkboxName) {
        const checkbox = form.getCheckBox(checkboxName);
        if (checkbox) {
          checkbox.check();
        }
      }
    } catch (error) {
      this.logger.debug(`Could not set trip type checkbox: ${error.message}`);
    }
  }

  /**
   * Save the generated PDF to the filesystem
   * Returns the file path
   */
  async savePdfToFile(pdfBuffer: Buffer, tripId: string): Promise<string> {
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'reports');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `trip-report-${tripId}-${Date.now()}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    await fs.writeFile(filepath, pdfBuffer);
    this.logger.log(`Saved PDF report to ${filepath}`);

    return `/uploads/reports/${filename}`;
  }
}
