import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const { ip, method, originalUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const startTime = Date.now();

        // Log request details
        this.logger.log(`Incoming Request: ${method} ${originalUrl} - IP: ${ip} - UA: ${userAgent}`);

        // Log body if present (sanitize sensitive data)
        if (Object.keys(req.body).length > 0) {
            const sanitizedBody = { ...req.body };
            if (sanitizedBody.password) sanitizedBody.password = '***';
            if (sanitizedBody.token) sanitizedBody.token = '***';
            this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
        }

        res.on('finish', () => {
            const { statusCode } = res;
            const contentLength = res.get('content-length');
            const duration = Date.now() - startTime;

            this.logger.log(
                `Response: ${method} ${originalUrl} ${statusCode} ${contentLength} - ${duration}ms`,
            );

            if (statusCode >= 400) {
                this.logger.warn(`Request failed with status ${statusCode}`);
            }
        });

        next();
    }
}
