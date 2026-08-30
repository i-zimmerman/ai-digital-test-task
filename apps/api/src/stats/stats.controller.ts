import { Controller, Get, Inject } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('api')
export class StatsController {
  // Injected by explicit token rather than by constructor type. Decorator
  // metadata needs a TypeScript-aware transpiler; naming the provider keeps
  // the app working under any of them.
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  @Get('stats')
  get() {
    return this.stats.get();
  }

  /** Everything the pipeline removed, with the reason. Shown in the UI. */
  @Get('excluded')
  excluded() {
    return this.stats.excluded();
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}
