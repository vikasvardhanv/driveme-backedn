import { Controller, Get, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all drivers for admin dispatch panel
   */
  @Get('drivers')
  async getDrivers() {
    try {
      const drivers = await this.prisma.user.findMany({
        where: {
          role: 'DRIVER',
          isActive: true
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
          licenseNumber: true,
          licenseExpiry: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              vehicleType: true,
            }
          }
        },
        orderBy: {
          firstName: 'asc'
        }
      });

      this.logger.log(`Found ${drivers.length} active drivers`);
      return drivers;
    } catch (error) {
      this.logger.error('Error fetching drivers:', error);
      throw error;
    }
  }

  /**
   * Get all members for admin panel
   */
  @Get('members')
  async getMembers() {
    try {
      const members = await this.prisma.user.findMany({
        where: {
          role: 'MEMBER',
          isActive: true
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          ahcccsNumber: true,
          dateOfBirth: true,
          mailingAddress: true,
        },
        orderBy: {
          firstName: 'asc'
        }
      });

      this.logger.log(`Found ${members.length} active members`);
      return members;
    } catch (error) {
      this.logger.error('Error fetching members:', error);
      throw error;
    }
  }
}
