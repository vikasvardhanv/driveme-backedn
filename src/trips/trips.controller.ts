import { Controller, Get, Post, Body, Patch, Param, Delete, Res, HttpStatus, Query } from '@nestjs/common';
import type { Response } from 'express';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { SubmitTripReportDto } from './dto/submit-trip-report.dto';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) { }

  @Post()
  create(@Body() createTripDto: CreateTripDto) {
    return this.tripsService.create(createTripDto);
  }

  @Get()
  findAll(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.tripsService.findAll(startDate, endDate);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTripDto: UpdateTripDto) {
    return this.tripsService.update(id, updateTripDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tripsService.remove(id);
  }

  /**
   * Generate AHCCCS PDF report for a specific trip (on-demand)
   * Returns the PDF file as a downloadable response
   */
  @Post(':id/generate-report')
  async generateReport(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.tripsService.generateTripReportManually(id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="AHCCCS_Trip_Report_${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to generate trip report',
        error: error.message,
      });
    }
  }

  /**
   * Submit completed AHCCCS trip report data and signatures
   * Generates and stores the filled PDF for dispatch download
   */
  @Post(':id/submit-report')
  submitReport(@Param('id') id: string, @Body() submitTripReportDto: SubmitTripReportDto) {
    return this.tripsService.submitTripReport(id, submitTripReportDto);
  }
  @Get('drivers/list')
  getDrivers() {
    return this.tripsService.findAllDrivers();
  }

  /**
   * Fix existing trips by assigning default company and regenerating PDFs
   * This is a one-time migration endpoint
   */
  @Post('fix-existing-trips')
  async fixExistingTrips() {
    return this.tripsService.assignDefaultCompanyToExistingTrips();
  }
}
