import { defineConfig } from 'prisma/config';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
}

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL,
    },
});
