import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function parseCorsOrigins(rawOrigins?: string): string[] {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildHttpCorsOptions(origins: string[], isProduction: boolean): CorsOptions {
  return {
    origin: origins.length > 0 ? origins : isProduction ? [] : true,
    credentials: true,
  };
}

export function buildSocketCorsOptions(origins: string[], isProduction: boolean) {
  return {
    origin: origins.length > 0 ? origins : isProduction ? [] : '*',
    credentials: true,
  };
}
