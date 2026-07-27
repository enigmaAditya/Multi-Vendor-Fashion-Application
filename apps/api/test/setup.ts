process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://dev:dev@localhost:5432/marketplace?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
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
