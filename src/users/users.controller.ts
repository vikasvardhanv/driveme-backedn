import { Controller, Get, Logger, Post, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private prisma: PrismaService) { }

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

  /**
   * Reset driver password manually (Admin only)
   * Returns the new temporary password to be shared with the driver
   */
  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    try {
      this.logger.log(`Resetting password for user ${id}`);

      // 1. Generate temp password
      const tempPassword = this.generateTempPassword();

      // 2. Hash it
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(tempPassword, salt);

      // 3. Update User
      await this.prisma.user.update({
        where: { id },
        data: { password: hashedPassword }
      });

      this.logger.log(`Password reset successful for ${id}`);

      // 4. Return plaintext temp password (HTTPS required!)
      return {
        success: true,
        tempPassword,
        message: 'Password reset successful. Please share the temporary password with the driver.'
      };
    } catch (error) {
      this.logger.error(`Failed to reset password for ${id}`, error);
      throw error;
    }
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
