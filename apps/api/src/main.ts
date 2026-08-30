import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Local-only tool: the dev UI runs on another port and auth is out of scope.
  app.enableCors({ origin: true });
  await app.listen(config.port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${config.port}`);
}

void bootstrap();
