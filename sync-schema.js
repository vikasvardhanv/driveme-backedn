/**
 * One-time script to sync Prisma schema to production database
 * Run with: node sync-schema.js
 */

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

async function syncSchema() {
  console.log('🔄 Starting schema sync...');

  // Create Prisma client
  const prisma = new PrismaClient();

  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Get database URL from Prisma config
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in environment');
    }

    // Create direct SQL connection
    const pool = new Pool({ connectionString: databaseUrl });

    console.log('\n📝 Checking for missing columns...');

    // Check Trip table columns
    const tripColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Trip'
      ORDER BY column_name;
    `);

    console.log(`Trip table has ${tripColumns.rows.length} columns`);

    // Required columns based on Prisma schema
    const requiredColumns = [
      'id', 'memberId', 'driverId', 'vehicleId', 'companyId',
      'status', 'tripType',
      'customerName', 'customerPhone', 'customerEmail', 'notes',
      'pickupAddress', 'pickupLat', 'pickupLng',
      'dropoffAddress', 'dropoffLat', 'dropoffLng',
      'secondPickupAddress', 'secondPickupLat', 'secondPickupLng',
      'secondDropoffAddress', 'secondDropoffLat', 'secondDropoffLng',
      'scheduledPickupTime', 'actualPickupTime', 'actualDropoffTime',
      'pickupOdometer', 'dropoffOdometer', 'secondPickupOdometer', 'secondDropoffOdometer',
      'tripMiles', 'reasonForVisit', 'escortName', 'escortRelationship',
      'driverSignatureUrl', 'memberSignatureUrl', 'pdfReportUrl',
      'createdAt', 'updatedAt'
    ];

    const existingColumns = tripColumns.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('\n⚠️  Missing columns:', missingColumns);
      console.log('\n🔧 Adding missing columns...\n');

      // Add missing columns with proper types
      const columnDefinitions = {
        pickupLat: 'DOUBLE PRECISION',
        pickupLng: 'DOUBLE PRECISION',
        dropoffLat: 'DOUBLE PRECISION',
        dropoffLng: 'DOUBLE PRECISION',
        secondPickupAddress: 'TEXT',
        secondPickupLat: 'DOUBLE PRECISION',
        secondPickupLng: 'DOUBLE PRECISION',
        secondDropoffAddress: 'TEXT',
        secondDropoffLat: 'DOUBLE PRECISION',
        secondDropoffLng: 'DOUBLE PRECISION',
        actualPickupTime: 'TIMESTAMP(3)',
        actualDropoffTime: 'TIMESTAMP(3)',
        pickupOdometer: 'INTEGER',
        dropoffOdometer: 'INTEGER',
        secondPickupOdometer: 'INTEGER',
        secondDropoffOdometer: 'INTEGER',
        tripMiles: 'DOUBLE PRECISION',
        reasonForVisit: 'TEXT',
        escortName: 'TEXT',
        escortRelationship: 'TEXT',
        driverSignatureUrl: 'TEXT',
        memberSignatureUrl: 'TEXT',
        pdfReportUrl: 'TEXT',
      };

      for (const col of missingColumns) {
        if (columnDefinitions[col]) {
          console.log(`  Adding column: ${col} (${columnDefinitions[col]})`);
          await pool.query(`
            ALTER TABLE "Trip"
            ADD COLUMN IF NOT EXISTS "${col}" ${columnDefinitions[col]};
          `);
        }
      }

      console.log('\n✅ All missing columns added!');
    } else {
      console.log('\n✅ All columns exist!');
    }

    // Verify Vehicle table
    console.log('\n📝 Checking Vehicle table...');
    const vehicleColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Vehicle'
      ORDER BY column_name;
    `);

    console.log(`Vehicle table has ${vehicleColumns.rows.length} columns`);

    const requiredVehicleColumns = ['currentLat', 'currentLng', 'currentSpeed', 'lastLocationUpdate', 'currentOdometer'];
    const existingVehicleColumns = vehicleColumns.rows.map(r => r.column_name);
    const missingVehicleColumns = requiredVehicleColumns.filter(col => !existingVehicleColumns.includes(col));

    if (missingVehicleColumns.length > 0) {
      console.log('\n⚠️  Missing Vehicle columns:', missingVehicleColumns);
      console.log('🔧 Adding missing Vehicle columns...\n');

      const vehicleColumnDefs = {
        currentLat: 'DOUBLE PRECISION',
        currentLng: 'DOUBLE PRECISION',
        currentSpeed: 'DOUBLE PRECISION',
        lastLocationUpdate: 'TIMESTAMP(3)',
        currentOdometer: 'INTEGER'
      };

      for (const col of missingVehicleColumns) {
        if (vehicleColumnDefs[col]) {
          console.log(`  Adding column: ${col} (${vehicleColumnDefs[col]})`);
          await pool.query(`
            ALTER TABLE "Vehicle"
            ADD COLUMN IF NOT EXISTS "${col}" ${vehicleColumnDefs[col]};
          `);
        }
      }

      console.log('\n✅ Vehicle columns added!');
    }

    await pool.end();
    console.log('\n🎉 Schema sync complete!');

  } catch (error) {
    console.error('❌ Error during schema sync:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncSchema()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
