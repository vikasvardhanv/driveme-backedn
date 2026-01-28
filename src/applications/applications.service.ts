
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverApplication, Prisma } from '@prisma/client';

@Injectable()
export class ApplicationsService {
    constructor(private prisma: PrismaService) { }

    async create(data: Prisma.DriverApplicationCreateInput): Promise<DriverApplication> {
        return this.prisma.driverApplication.create({
            data,
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
