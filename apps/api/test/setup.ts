// ---------------------------------------------------------------------------
// Suppress BullMQ "Connection is closed" errors during test teardown.
//
// Root cause: BullMQ's RedisConnection removes its own error listeners during
// Queue/Worker.close(), but ioredis fires a socket 'close' event *after* that.
// RedisConnection re-emits it as an 'error' with no remaining listeners, which
// Node escalates to 'uncaughtException'.  Jest catches that and fails the suite
// even though every individual test passed.
//
// This intercept swallows only that specific harmless error.  Everything else
// passes through to Jest's default handler unchanged.
// ---------------------------------------------------------------------------
const _originalEmit = (
  process.emit as (...emitArgs: unknown[]) => boolean
).bind(process);
// @ts-expect-error -- monkey-patching process.emit for test resilience
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'uncaughtException') {
    const err = args[0] as Error | undefined;
    if (err?.message === 'Connection is closed.') {
      return true; // swallow — harmless BullMQ teardown noise
    }
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
