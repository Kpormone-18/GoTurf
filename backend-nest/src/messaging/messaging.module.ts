import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HubtelSmsService } from './hubtel-sms.service.js';
import { MessagingService } from './messaging.service.js';
import { SmsProcessor } from './sms.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  providers: [HubtelSmsService, MessagingService, SmsProcessor],
  exports: [MessagingService],
})
export class MessagingModule {}
