const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const query = `ALTER TABLE "Trip" ALTER COLUMN "memberId" DROP NOT NULL;`;
        console.log(`Executing: ${query}`);

        await client.query(query);
        console.log('Migration successful');
    } catch (err) {
        console.error('Migration failed', err);
    } finally {
        await client.end();
    }
}

migrate();
