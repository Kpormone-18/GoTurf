import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import pg from 'pg';

const { Pool } = pg;

@Injectable()
export class InfrastructureService implements OnModuleDestroy {
  private readonly logger = new Logger(InfrastructureService.name);
  private readonly redis: Redis;
  private readonly database: pg.Pool;

  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://');
    this.database = new Pool({ connectionString: databaseUrl, max: 10, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined });
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: 1, enableReadyCheck: true, lazyConnect: true });
    this.redis.on('error', (error: Error) => this.logger.error(`Redis connection error: ${error.message}`));
  }

  async health() {
    const [database, redis] = await Promise.all([
      this.database.query('SELECT 1').then(() => true).catch(() => false),
      this.redis.connect().catch(() => undefined).then(() => this.redis.ping()).then(() => true).catch(() => false),
    ]);
    return { database, redis };
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(`goturf:cache:${key}`);
    return value ? (JSON.parse(value) as T) : null;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(`goturf:cache:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async consumeRateLimit(scope: string, identity: string, maxAttempts: number, windowSeconds: number) {
    const key = `goturf:limit:${scope}:${identity}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) await this.redis.expire(key, windowSeconds);
    const retryAfter = await this.redis.ttl(key);
    return { allowed: attempts <= maxAttempts, remaining: Math.max(0, maxAttempts - attempts), retryAfter: Math.max(0, retryAfter) };
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.database.end(), this.redis.quit()]);
  }
}
