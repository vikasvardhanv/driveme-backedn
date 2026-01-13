import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Body() body: { email: string; role: string }) {
        return this.authService.login(body);
    }

    @Post('signup')
    async signup(
        @Body()
        body: {
            email: string;
            firstName: string;
            lastName: string;
            phone: string;
            licenseNumber?: string;
            licenseExpiry?: string;
            companyId?: string;
        },
    ) {
        return this.authService.signup(body);
    }
}
