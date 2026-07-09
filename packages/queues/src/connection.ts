import { config } from "@postly/shared";

/**
 * BullMQ bundles its own copy of ioredis internally. Constructing our
 * own `IORedis` instance and handing it to `Queue`/`Worker` causes a
 * structural type mismatch between the two installs (same version,
 * different node_modules copy) even though it works fine at runtime.
 * Passing a plain connection-options object sidesteps that entirely
 * and is the documented BullMQ pattern for a single shared connection
 * config across queues/workers.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
}

export function getRedisConnection(): RedisConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}
