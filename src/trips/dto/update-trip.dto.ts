import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsNumber, IsDateString } from 'class-validator';
import { CreateTripDto } from './create-trip.dto';

export class UpdateTripDto extends PartialType(CreateTripDto) {
    // Time tracking
    @IsOptional()
    @IsDateString()
    tripStartTime?: string;

    @IsOptional()
    @IsDateString()
    arrivedAtPickupTime?: string;

    @IsOptional()
    @IsDateString()
    actualPickupTime?: string;

    @IsOptional()
    @IsDateString()
    actualDropoffTime?: string;

    // Odometer readings at each stage
    @IsOptional()
    @IsNumber()
    startOdometer?: number;

    @IsOptional()
    @IsNumber()
    pickupOdometer?: number;

    @IsOptional()
    @IsNumber()
    dropoffOdometer?: number;

    // Mileage breakdown
    @IsOptional()
    @IsNumber()
    emptyMiles?: number;

    @IsOptional()
    @IsNumber()
    loadedMiles?: number;

    @IsOptional()
    @IsNumber()
    tripMiles?: number;

    // GPS coordinates at key events
    @IsOptional()
    @IsNumber()
    tripStartLat?: number;

    @IsOptional()
    @IsNumber()
    tripStartLng?: number;

    @IsOptional()
    @IsNumber()
    arrivedAtPickupLat?: number;

    @IsOptional()
    @IsNumber()
    arrivedAtPickupLng?: number;

    @IsOptional()
    @IsNumber()
    pickedUpLat?: number;

    @IsOptional()
    @IsNumber()
    pickedUpLng?: number;

    @IsOptional()
    @IsNumber()
    completedLat?: number;

    @IsOptional()
    @IsNumber()
    completedLng?: number;
}
