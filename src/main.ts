import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildHttpCorsOptions, parseCorsOrigins } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  if (isProduction && corsOrigins.length === 0) {
    logger.warn('CORS_ORIGINS is not set; browser clients will be blocked.');
  }

  app.enableCors(buildHttpCorsOptions(corsOrigins, isProduction));
  app.enableShutdownHooks();

  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();
  if (instance?.disable) {
    instance.disable('x-powered-by');
  }

  const port = Number.parseInt(process.env.PORT ?? '', 10) || 3001;
  await app.listen(port);
  logger.log(`Listening on port ${port}`);
}
bootstrap();
