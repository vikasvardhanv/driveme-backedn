import { Injectable } from '@nestjs/common';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

@Injectable()
export class TripsService {
  create(createTripDto: CreateTripDto) {
    return 'This action adds a new trip';
  }

  findAll() {
    // Return mock data for Admin Portal
    return [
      {
        id: '1',
        pickupAddress: '123 Main St, Phoenix, AZ',
        dropoffAddress: 'Mayo Clinic, Phoenix, AZ',
        status: 'COMPLETED',
        scheduledPickupTime: new Date().toISOString(),
        driver: { firstName: 'James', lastName: 'Martinez' },
      },
      {
        id: '2',
        pickupAddress: '456 Oak St, Mesa, AZ',
        dropoffAddress: 'Banner Desert, Mesa, AZ',
        status: 'EN_ROUTE',
        scheduledPickupTime: new Date().toISOString(),
        driver: { firstName: 'Emily', lastName: 'Davis' },
      }
    ];
  }

  findOne(id: number) {
    return `This action returns a #${id} trip`;
  }

  update(id: number, updateTripDto: UpdateTripDto) {
    return `This action updates a #${id} trip`;
  }

  remove(id: number) {
    return `This action removes a #${id} trip`;
  }
}
