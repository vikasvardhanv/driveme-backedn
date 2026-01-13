import { IsString, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';

export enum TripType {
    ONE_WAY = 'one-way',
    ROUND_TRIP = 'round-trip',
    MULTIPLE_STOPS = 'multiple-stops',
}

export class CreateTripDto {
    @IsString()
    pickupAddress: string;

    @IsOptional()
    @IsNumber()
    pickupLat?: number;

    @IsOptional()
    @IsNumber()
    pickupLng?: number;

    @IsString()
    dropoffAddress: string;

    @IsOptional()
    @IsNumber()
    dropoffLat?: number;

    @IsOptional()
    @IsNumber()
    dropoffLng?: number;

    @IsString()
    customerName: string;

    @IsString()
    customerPhone: string;

    @IsOptional()
    @IsString()
    customerEmail?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    scheduledDate?: string; // YYYY-MM-DD

    @IsOptional()
    @IsString()
    scheduledTime?: string; // HH:MM

    @IsOptional()
    @IsEnum(TripType)
    tripType?: TripType;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    memberId?: string;

    @IsOptional()
    @IsString()
    companyId?: string;

    @IsOptional()
    @IsString()
    driverId?: string;

    @IsOptional()
    @IsString()
    vehicleId?: string;

    // AHCCCS-specific fields
    @IsOptional()
    @IsNumber()
    pickupOdometer?: number;

    @IsOptional()
    @IsNumber()
    dropoffOdometer?: number;

    @IsOptional()
    @IsString()
    reasonForVisit?: string;

    @IsOptional()
    @IsString()
    escortName?: string;

    @IsOptional()
    @IsString()
    escortRelationship?: string;
}
