import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { MessagingModule } from './messaging/messaging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: { url: config.getOrThrow<string>('REDIS_URL') } }),
    }),
    InfrastructureModule,
    MessagingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
