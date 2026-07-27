import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('meilisearch', () => {
  return {
    Meilisearch: jest.fn().mockImplementation(() => {
      return {
        index: jest.fn().mockReturnValue({
          updateSettings: jest.fn().mockResolvedValue({}),
          search: jest.fn().mockResolvedValue({
            hits: [{ id: 'prod-1', name: 'Cotton T-Shirt' }],
            estimatedTotalHits: 1,
          }),
          addDocuments: jest.fn().mockResolvedValue({}),
          deleteDocument: jest.fn().mockResolvedValue({}),
        }),
      };
    }),
  };
});

describe('SearchService', () => {
  let service: SearchService;
  let prisma: PrismaService;

  const mockPrisma = {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    review: {
      aggregate: jest.fn().mockResolvedValue({
        _avg: { rating: 4.5 },
      }),
    },
    searchQueryLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should construct search parameters and query Meilisearch', async () => {
    // Setup Service
    await service.onModuleInit();

    const result = await service.search({
      q: 'cotton',
      category: 'Apparel',
      minPrice: 1000,
      maxPrice: 10000,
      sort: 'price_asc',
    });

    expect(result.hits).toBeDefined();
    expect(result.hits[0].id).toBe('prod-1');
  });

  it('should map LIVE products to flat documents correctly', async () => {
    const mockProduct = {
      id: 'prod-1',
      name: 'Cotton T-Shirt',
      description: '100% Cotton',
      status: 'LIVE',
      brandId: 'brand-1',
      brand: { name: 'Premium Brand' },
      categoryId: 'cat-1',
      category: { name: 'Apparel' },
      createdAt: new Date(),
      attributes: [
        {
          attributeValue: {
            value: 'Red',
            attribute: { name: 'Color' },
          },
        },
      ],
      variants: [
        {
          color: 'Red',
          skus: [
            {
              size: 'M',
              price: 1500n, // $15.00
              mrp: 2000n,
              inventories: [{ onHand: 10, reserved: 2 }],
            },
          ],
        },
      ],
    };

    mockPrisma.product.findUnique.mockResolvedValue(mockProduct);

    await service.onModuleInit();
    const indexSpy = jest.spyOn((service as any).index, 'addDocuments');

    await service.upsertProductToIndex('prod-1');

    expect(indexSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'prod-1',
        name: 'Cotton T-Shirt',
        inStock: true,
        colors: ['Red'],
        sizes: ['M'],
        minPrice: 1500,
        maxPrice: 1500,
      }),
    ]);
  });
});
