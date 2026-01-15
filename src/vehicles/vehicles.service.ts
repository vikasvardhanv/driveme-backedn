import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findAllWithLocations() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        isActive: true,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { lastLocationUpdate: 'desc' },
    });

    return vehicles.map(vehicle => ({
      ...vehicle,
      isMoving: (vehicle.currentSpeed || 0) > 2, // Consider moving if speed > 2 mph
      status: this.getVehicleStatus(vehicle),
    }));
  }

  private getVehicleStatus(vehicle: any): 'moving' | 'idle' | 'offline' {
    if (!vehicle.lastLocationUpdate) return 'offline';

    const lastUpdate = new Date(vehicle.lastLocationUpdate);
    const now = new Date();
    const minutesAgo = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

    if (minutesAgo > 10) return 'offline'; // No update in 10 mins = offline
    if ((vehicle.currentSpeed || 0) > 2) return 'moving';
    return 'idle';
  }

  async findOne(id: string) {
    return this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }
}
