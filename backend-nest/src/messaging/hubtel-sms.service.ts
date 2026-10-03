import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsJob } from './messaging.service.js';

@Injectable()
export class HubtelSmsService {
  private readonly logger = new Logger(HubtelSmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send({ to, content, bookingId }: SmsJob) {
    const clientId = this.config.get<string>('HUBTEL_CLIENT_ID');
    const clientSecret = this.config.get<string>('HUBTEL_CLIENT_SECRET');
    const senderId = this.config.get<string>('HUBTEL_SENDER_ID');
    if (!clientId || !clientSecret || !senderId) {
      throw new ServiceUnavailableException('SMS delivery is not configured');
    }

    const response = await fetch(this.config.get<string>('HUBTEL_SMS_URL') ?? 'https://smsc.hubtel.com/v1/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ From: senderId, To: to, Content: content }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.text();
    if (!response.ok) {
      this.logger.warn(`Hubtel SMS failed for booking ${bookingId ?? 'unknown'}: HTTP ${response.status}`);
      throw new Error(`Hubtel SMS request failed: HTTP ${response.status}`);
    }
    return body ? JSON.parse(body) : { accepted: true };
  }
}
