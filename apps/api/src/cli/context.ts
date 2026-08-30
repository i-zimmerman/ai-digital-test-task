import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { closeDb } from '../db/client';

/** Boots a Nest context without an HTTP server, so CLI scripts reuse the services. */
export async function withApp<T>(
  fn: (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>) => Promise<T>,
): Promise<T> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    return await fn(app);
  } finally {
    await app.close();
    await closeDb();
  }
}

export function fail(message: string): never {
  new Logger('cli').error(message);
  process.exit(1);
}
