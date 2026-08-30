import { Global, Module } from '@nestjs/common';
import { getDb } from './client';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [{ provide: DB, useFactory: getDb }],
  exports: [DB],
})
export class DbModule {}
