export type TextAlign = 'left' | 'center' | 'right';

export type TextPosition = {
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
  lineHeight?: number;
  align?: TextAlign;
};

export type BoxPosition = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TripReportLayout = {
  providerInfo?: TextPosition;
  driverName?: TextPosition;
  tripDate?: TextPosition;
  vehicleLicense?: TextPosition;
  vehicleMakeColor?: TextPosition;

  ahcccsNumber?: TextPosition;
  memberDob?: TextPosition;
  memberName?: TextPosition;
  mailingAddress?: TextPosition;

  pickupAddress?: TextPosition;
  pickupTime?: TextPosition;
  pickupOdometer?: TextPosition;
  dropoffAddress?: TextPosition;
  dropoffTime?: TextPosition;
  dropoffOdometer?: TextPosition;
  tripMiles?: TextPosition;

  reasonForVisit?: TextPosition;
  escortName?: TextPosition;
  escortRelationship?: TextPosition;

  secondPickupAddress?: TextPosition;
  secondPickupTime?: TextPosition;
  secondPickupOdometer?: TextPosition;
  secondDropoffAddress?: TextPosition;
  secondDropoffTime?: TextPosition;
  secondDropoffOdometer?: TextPosition;
  secondTripMiles?: TextPosition;

  checkboxes?: {
    tripTypeOneWay?: BoxPosition;
    tripTypeRoundTrip?: BoxPosition;
    tripTypeMultipleStops?: BoxPosition;
    vehicleTaxi?: BoxPosition;
    vehicleWheelchairVan?: BoxPosition;
    vehicleBus?: BoxPosition;
    vehicleStretcherCar?: BoxPosition;
    vehicleOther?: BoxPosition;
  };

  signatures?: {
    member?: BoxPosition;
    driver?: BoxPosition;
  };
};

// TODO: Populate these coordinates from the final AHCCCS template.
export const tripReportLayout: TripReportLayout = {
  providerInfo: {
    page: 0,
    x: 15,
    y: 744,
    size: 9,
    maxWidth: 280,
    lineHeight: 10,
  },
  driverName: { page: 0, x: 417, y: 730, size: 10, maxWidth: 178 },
  tripDate: { page: 0, x: 376, y: 716, size: 10, maxWidth: 210 },
  vehicleLicense: { page: 0, x: 460, y: 701, size: 10, maxWidth: 130 },
  vehicleMakeColor: { page: 0, x: 448, y: 687, size: 10, maxWidth: 92 },

  ahcccsNumber: { page: 0, x: 68, y: 635, size: 10, maxWidth: 205 },
  memberDob: { page: 0, x: 340, y: 635, size: 10, maxWidth: 237 },
  memberName: { page: 0, x: 85, y: 619, size: 10, maxWidth: 184 },
  mailingAddress: { page: 0, x: 306, y: 619, size: 10, maxWidth: 264 },

  pickupAddress: {
    page: 0,
    x: 16,
    y: 574,
    size: 9,
    maxWidth: 430,
    lineHeight: 10,
  },
  pickupTime: { page: 0, x: 457, y: 580, size: 9, maxWidth: 35 },
  pickupOdometer: { page: 0, x: 503, y: 580, size: 9, maxWidth: 43 },
  dropoffAddress: {
    page: 0,
    x: 16,
    y: 530,
    size: 9,
    maxWidth: 430,
    lineHeight: 10,
  },
  dropoffTime: { page: 0, x: 457, y: 536, size: 9, maxWidth: 35 },
  dropoffOdometer: { page: 0, x: 503, y: 536, size: 9, maxWidth: 43 },
  tripMiles: { page: 0, x: 555, y: 536, size: 9, maxWidth: 40 },

  reasonForVisit: { page: 0, x: 90, y: 437, size: 9, maxWidth: 460 },
  escortName: { page: 0, x: 90, y: 424, size: 9, maxWidth: 200 },
  escortRelationship: { page: 0, x: 360, y: 424, size: 9, maxWidth: 190 },

  secondPickupAddress: {
    page: 0,
    x: 16,
    y: 374,
    size: 9,
    maxWidth: 430,
    lineHeight: 10,
  },
  secondPickupTime: { page: 0, x: 457, y: 380, size: 9, maxWidth: 35 },
  secondPickupOdometer: { page: 0, x: 503, y: 380, size: 9, maxWidth: 43 },
  secondDropoffAddress: {
    page: 0,
    x: 16,
    y: 330,
    size: 9,
    maxWidth: 430,
    lineHeight: 10,
  },
  secondDropoffTime: { page: 0, x: 457, y: 336, size: 9, maxWidth: 35 },
  secondDropoffOdometer: { page: 0, x: 503, y: 336, size: 9, maxWidth: 43 },
  secondTripMiles: { page: 0, x: 555, y: 336, size: 9, maxWidth: 40 },

  checkboxes: {
    tripTypeOneWay: { page: 0, x: 120, y: 481, width: 10, height: 10 },
    tripTypeRoundTrip: { page: 0, x: 125, y: 294, width: 10, height: 10 },
    tripTypeMultipleStops: { page: 0, x: 220, y: 481, width: 10, height: 10 },
    vehicleTaxi: { page: 0, x: 510, y: 672, width: 10, height: 10 },
    vehicleWheelchairVan: { page: 0, x: 430, y: 672, width: 10, height: 10 },
    vehicleBus: { page: 0, x: 554, y: 672, width: 10, height: 10 },
    vehicleStretcherCar: { page: 0, x: 357, y: 655, width: 10, height: 10 },
    vehicleOther: { page: 0, x: 428, y: 655, width: 10, height: 10 },
  },

  signatures: {
    member: { page: 1, x: 100, y: 190, width: 305, height: 15 },
    driver: { page: 1, x: 93, y: 54, width: 318, height: 15 },
  },
};
