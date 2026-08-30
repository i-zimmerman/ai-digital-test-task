import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { IssuesModule } from './issues/issues.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [DbModule, PipelineModule, IssuesModule, StatsModule],
})
export class AppModule {}
