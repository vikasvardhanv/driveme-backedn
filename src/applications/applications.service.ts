import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverApplication, Prisma } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ApplicationsService {
    private supabase: SupabaseClient;

    constructor(private prisma: PrismaService) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.warn('Supabase credentials not found in environment variables');
            // We might not throw here to allow app to start, but upload will fail
        } else {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
    }

    async create(
        data: { name: string; email?: string; phone?: string },
        file?: Express.Multer.File
    ): Promise<DriverApplication> {
        let pdfUrl = '';

        if (file) {
            if (!this.supabase) {
                throw new BadRequestException('Storage service not configured');
            }

            const fileName = `applications/${Date.now()}_${data.name.replace(/\s+/g, '_')}.pdf`;

            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('FilesforDriveme')
                .upload(fileName, file.buffer, {
                    contentType: 'application/pdf',
                    upsert: false
                });

            if (uploadError) {
                console.error('Supabase upload error:', uploadError);
                throw new BadRequestException('Failed to upload file');
            }

            const { data: { publicUrl } } = this.supabase.storage
                .from('FilesforDriveme')
                .getPublicUrl(fileName);

            pdfUrl = publicUrl;
        }

        return this.prisma.driverApplication.create({
            data: {
                ...data,
                pdfUrl,
            },
        });
    }

    async findAll(): Promise<DriverApplication[]> {
        return this.prisma.driverApplication.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string): Promise<DriverApplication | null> {
        return this.prisma.driverApplication.findUnique({
            where: { id },
        });
    }
}
