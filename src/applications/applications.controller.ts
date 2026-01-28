
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { DriverApplication } from '@prisma/client';

@Controller('applications')
export class ApplicationsController {
    constructor(private readonly applicationsService: ApplicationsService) { }

    @Post()
    create(@Body() createApplicationDto: { name: string; pdfUrl: string, email?: string, phone?: string }) {
        return this.applicationsService.create(createApplicationDto);
    }

    @Get()
    findAll() {
        return this.applicationsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.applicationsService.findOne(id);
    }
}
