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
