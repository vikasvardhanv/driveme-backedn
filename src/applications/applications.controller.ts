
import { Controller, Get, Post, Body, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationsService } from './applications.service';
import { DriverApplication } from '@prisma/client';

@Controller('applications')
export class ApplicationsController {
    constructor(private readonly applicationsService: ApplicationsService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    create(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { name: string; email?: string; phone?: string }
    ) {
        return this.applicationsService.create(body, file);
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
