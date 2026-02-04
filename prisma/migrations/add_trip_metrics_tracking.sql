-- Add comprehensive trip metrics tracking
-- This migration adds time tracking, odometer readings, and GPS coordinates at each trip stage

-- Add time tracking fields
ALTER TABLE "Trip" ADD COLUMN "tripStartTime" TIMESTAMP(3);
ALTER TABLE "Trip" ADD COLUMN "arrivedAtPickupTime" TIMESTAMP(3);

-- Rename existing odometer fields for clarity
ALTER TABLE "Trip" RENAME COLUMN "pickupOdometer" TO "startOdometer";

-- Re-add pickupOdometer as a separate field (if data exists, copy it over)
ALTER TABLE "Trip" ADD COLUMN "pickupOdometer_new" INTEGER;
UPDATE "Trip" SET "pickupOdometer_new" = "startOdometer" WHERE "startOdometer" IS NOT NULL;
ALTER TABLE "Trip" RENAME COLUMN "pickupOdometer_new" TO "pickupOdometer";

-- Add mileage breakdown fields
ALTER TABLE "Trip" ADD COLUMN "emptyMiles" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "loadedMiles" DOUBLE PRECISION;

-- Add GPS coordinates at each stage
ALTER TABLE "Trip" ADD COLUMN "tripStartLat" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "tripStartLng" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "arrivedAtPickupLat" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "arrivedAtPickupLng" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "pickedUpLat" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "pickedUpLng" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "completedLat" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "completedLng" DOUBLE PRECISION;

-- Add comments for clarity
COMMENT ON COLUMN "Trip"."tripStartTime" IS 'When driver started trip (EN_ROUTE status)';
COMMENT ON COLUMN "Trip"."arrivedAtPickupTime" IS 'When driver arrived at pickup location (ARRIVED status)';
COMMENT ON COLUMN "Trip"."startOdometer" IS 'Odometer reading when trip started (EN_ROUTE)';
COMMENT ON COLUMN "Trip"."pickupOdometer" IS 'Odometer reading when member was picked up (PICKED_UP)';
COMMENT ON COLUMN "Trip"."dropoffOdometer" IS 'Odometer reading at trip completion (COMPLETED)';
COMMENT ON COLUMN "Trip"."emptyMiles" IS 'Miles driven without passenger (start to pickup)';
COMMENT ON COLUMN "Trip"."loadedMiles" IS 'Miles driven with passenger (pickup to dropoff)';
