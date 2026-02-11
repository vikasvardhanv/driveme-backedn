import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@yazdrive.com' },
        update: {},
        create: {
            email: 'admin@yazdrive.com',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
        },
    });

    // Create Driver 1
    const driver1 = await prisma.user.upsert({
        where: { email: 'driver1@yazdrive.com' },
        update: {},
        create: {
            email: 'driver1@yazdrive.com',
            password: hashedPassword,
            firstName: 'John',
            lastName: 'Driver',
            role: 'DRIVER',
        },
    });

    // Create Main Driver Account
    const mainDriverPassword = await bcrypt.hash('password123', 10);
    const mainDriver = await prisma.user.upsert({
        where: { email: 'driver@yazdrive.com' },
        update: {},
        create: {
            email: 'driver@yazdrive.com',
            password: mainDriverPassword,
            firstName: 'Yaz',
            lastName: 'Driver',
            role: 'DRIVER',
        },
    });

    // Create Dispatcher
    const dispatcher = await prisma.user.upsert({
        where: { email: 'dispatch@yazdrive.com' },
        update: {},
        create: {
            email: 'dispatch@yazdrive.com',
            password: hashedPassword,
            firstName: 'Jane',
            lastName: 'Dispatch',
            role: 'DISPATCHER',
        },
    });

    console.log({ admin, driver1, mainDriver, dispatcher });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
