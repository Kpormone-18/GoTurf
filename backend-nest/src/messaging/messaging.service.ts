import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export interface SmsJob { to: string; content: string; bookingId?: string }

@Injectable()
export class MessagingService {
  constructor(@InjectQueue('notifications') private readonly queue: Queue<SmsJob>) {}

  async queueSms(job: SmsJob) {
    return this.queue.add('send-sms', job, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
  }
}
