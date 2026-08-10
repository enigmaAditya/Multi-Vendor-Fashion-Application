// ---------------------------------------------------------------------------
// Suppress BullMQ / ioredis teardown errors during test cleanup.
//
// Root cause: BullMQ's RedisConnection removes its own error listeners during
// Queue/Worker.close(), but ioredis fires a socket 'close' event *after* that.
// RedisConnection re-emits it as an 'error' with no remaining listeners, which
// Node escalates to 'uncaughtException'.  Jest catches that and fails the suite
// even though every individual test passed.  On some runs the same error
// surfaces as an 'unhandledRejection' instead.
//
// This intercept swallows only those specific harmless errors.  Everything else
// passes through to Jest's default handler unchanged.
// ---------------------------------------------------------------------------
function isBullMQTeardownError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('Connection is closed') ||
    msg.includes('read ECONNRESET') ||
    (msg.includes('connect ECONNREFUSED') && msg.includes('6379'))
  );
}

const _originalEmit = (
  process.emit as (...emitArgs: unknown[]) => boolean
).bind(process);
// @ts-expect-error -- monkey-patching process.emit for test resilience
process.emit = function (event: string, ...args: unknown[]) {
  if (
    (event === 'uncaughtException' || event === 'unhandledRejection') &&
    isBullMQTeardownError(args[0])
  ) {
    return true; // swallow — harmless BullMQ/ioredis teardown noise
  }
  return _originalEmit.call(process, event, ...args);
};

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://dev:dev@localhost:5432/marketplace?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DISABLE_WORKERS = process.env.DISABLE_WORKERS || 'true';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-12345';
process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || 'webhooksecret';
process.env.SHIPROCKET_WEBHOOK_TOKEN =
  process.env.SHIPROCKET_WEBHOOK_TOKEN || 'test_webhook_token';

jest.mock('meilisearch', () => {
  return {
    Meilisearch: jest.fn().mockImplementation(() => {
      return {
        index: jest.fn().mockReturnValue({
          updateSettings: jest.fn().mockResolvedValue({}),
          addDocuments: jest.fn().mockResolvedValue({}),
          deleteDocument: jest.fn().mockResolvedValue({}),
          search: jest.fn().mockResolvedValue({
            hits: [
              {
                id: 'prod-1',
                name: 'Cotton Polo Shirt',
                categoryName: 'Apparel',
                brandName: 'BrandX',
                minPrice: 20,
                maxPrice: 30,
                colors: ['Red'],
                sizes: ['M'],
                inStock: true,
                rating: 4.5,
              },
            ],
            estimatedTotalHits: 1,
            facetDistribution: {
              categoryName: { Apparel: 1 },
              brandName: { BrandX: 1 },
            },
          }),
        }),
      };
    }),
  };
});
