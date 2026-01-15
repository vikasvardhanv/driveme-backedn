import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
    ) { }

    async login(body: { email: string; role: string; password: string }) {
        const user = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // 1. Verify Password
        const isPasswordValid = await bcrypt.compare(body.password, user.password);

        // Fallback for older unhashed passwords (optional, but good for transition)
        // const isPlainMatch = user.password === body.password;

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // 2. Verify Role Access
        // Check that the user's role matches the portal they're logging into
        if (body.role === 'DRIVER') {
            // Driver portal - only allow DRIVER role
            if (user.role !== 'DRIVER') {
                throw new UnauthorizedException('Access denied: You must be a Driver to log in here.');
            }
        } else {
            // Dispatch portal - allow ADMIN and DISPATCHER
            const allowedRoles = ['ADMIN', 'DISPATCHER'];
            if (!allowedRoles.includes(user.role)) {
                throw new UnauthorizedException('Access denied: You must be an Admin or Dispatcher to log in here.');
            }
        }

        // Return user info + token
        return {
            access_token: 'mvp-mock-jwt-token-' + user.id,
            user: user,
        };
    }

    /**
     * Driver Signup - creates a new driver account
     */
    async signup(signupDto: {
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        licenseNumber?: string;
        licenseExpiry?: string;
        companyId?: string;
    }) {
        // Check if user already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: signupDto.email },
        });

        if (existingUser) {
            throw new ConflictException('A user with this email already exists');
        }

        // Generate temporary password
        const tempPassword = this.generateTempPassword();

        // Hash the password
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Create the driver
        const driver = await this.prisma.user.create({
            data: {
                email: signupDto.email,
                password: hashedPassword,
                firstName: signupDto.firstName,
                lastName: signupDto.lastName,
                phone: signupDto.phone,
                role: 'DRIVER',
                licenseNumber: signupDto.licenseNumber,
                licenseExpiry: signupDto.licenseExpiry ? new Date(signupDto.licenseExpiry) : null,
                companyId: signupDto.companyId,
            },
        });

        // Send welcome email with credentials
        await this.emailService.sendDriverWelcomeEmail(
            driver.email,
            `${driver.firstName} ${driver.lastName}`,
            tempPassword,
        );

        // Return user info (without password)
        const { password, ...userWithoutPassword } = driver;

        return {
            message: 'Driver account created successfully. Welcome email sent.',
            user: userWithoutPassword,
            tempPassword, // Return this for display purposes (in real app, only send via email)
        };
    }

    /**
     * Generate a random temporary password
     */
    private generateTempPassword(): string {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    }
}
