import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { HubtelSmsService } from './hubtel-sms.service.js';
import type { SmsJob } from './messaging.service.js';

@Processor('notifications')
export class SmsProcessor extends WorkerHost {
  constructor(private readonly hubtel: HubtelSmsService) { super(); }

  async process(job: Job<SmsJob>) {
    if (job.name !== 'send-sms') return;
    return this.hubtel.send(job.data);
  }
}
