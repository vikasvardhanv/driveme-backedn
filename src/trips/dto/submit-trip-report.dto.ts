import { IsString, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { TripType } from './create-trip.dto';

export class SubmitTripReportDto {
  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  tripDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  vehicleMakeColor?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  ahcccsNumber?: string;

  @IsOptional()
  @IsString()
  memberDob?: string;

  @IsOptional()
  @IsString()
  memberName?: string;

  @IsOptional()
  @IsString()
  mailingAddress?: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsNumber()
  pickupOdometer?: number;

  @IsOptional()
  @IsString()
  dropoffAddress?: string;

  @IsOptional()
  @IsString()
  dropoffTime?: string;

  @IsOptional()
  @IsNumber()
  dropoffOdometer?: number;

  @IsOptional()
  @IsNumber()
  tripMiles?: number;

  @IsOptional()
  @IsEnum(TripType)
  tripType?: TripType;

  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @IsOptional()
  @IsString()
  escortName?: string;

  @IsOptional()
  @IsString()
  escortRelationship?: string;

  @IsOptional()
  @IsString()
  secondPickupAddress?: string;

  @IsOptional()
  @IsString()
  secondPickupTime?: string;

  @IsOptional()
  @IsNumber()
  secondPickupOdometer?: number;

  @IsOptional()
  @IsString()
  secondDropoffAddress?: string;

  @IsOptional()
  @IsString()
  secondDropoffTime?: string;

  @IsOptional()
  @IsNumber()
  secondDropoffOdometer?: number;

  @IsOptional()
  @IsNumber()
  secondTripMiles?: number;

  @IsOptional()
  @IsDateString()
  actualPickupTime?: string;

  @IsOptional()
  @IsDateString()
  actualDropoffTime?: string;

}
