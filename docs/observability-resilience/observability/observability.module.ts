import { Global, Module } from '@nestjs/common';

import { JobHealthService } from './job-health.service';
import { ApiErrorLogCleanupJob } from './api-error-cleanup.job';

/** Global, so every scheduled job and the admin metrics can inject `JobHealthService`. */
@Global()
@Module({
  providers: [JobHealthService, ApiErrorLogCleanupJob],
  exports: [JobHealthService],
})
export class ObservabilityModule {}
