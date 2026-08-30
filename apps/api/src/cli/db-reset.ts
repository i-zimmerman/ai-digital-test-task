import { PipelineService } from '../pipeline/pipeline.service';
import { withApp } from './context';

void withApp(async (app) => {
  await app.get(PipelineService).reset();
  process.stdout.write('All pipeline tables truncated\n');
});
