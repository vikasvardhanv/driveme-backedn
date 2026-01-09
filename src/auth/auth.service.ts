import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(private prisma: PrismaService) { }

    async login(body: { email: string; role: string }) {
        // For MVP, we are skipping password hash verification and just matching Email + Role
        // In production, use bcrypt and validate password.

        const user = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // Simple role check
        if (user.role.toString() !== body.role.toUpperCase()) {
            throw new UnauthorizedException('Invalid role for this user');
        }

        // Return user info + mock token
        return {
            access_token: 'mvp-mock-jwt-token-' + user.id,
            user: user,
        };
    }
}
