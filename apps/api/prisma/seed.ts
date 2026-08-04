import 'dotenv/config';
import { PrismaClient, ProductStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { uuidv7 } from 'uuidv7';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://dev:dev@localhost:5432/marketplace?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clear existing data in correct dependency order
  console.log('🧹 Cleaning old database records...');
  await prisma.review.deleteMany({});
  await prisma.userProductView.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.shipmentWebhookLog.deleteMany({});
  await prisma.commissionLedger.deleteMany({});
  await prisma.promotionLedger.deleteMany({});
  await prisma.couponRedemption.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.sellerLinkedAccount.deleteMany({});
  await prisma.commissionRule.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.subOrder.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.skuInventory.deleteMany({});
  await prisma.inventoryLedger.deleteMany({});
  await prisma.inventoryReservation.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.sku.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.outboxEvent.deleteMany({});

  // 2. Create Admin & Sellers (Vendors)
  console.log('👤 Creating Users (Admin, Sellers, Buyers)...');
  const admin = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'admin@marketplace.com',
      phone: '+919000000001',
      roles: ['ADMIN', 'USER'],
    },
  });

  const vendorsData = [
    { name: 'Apex Apparel Store', email: 'seller.apex@marketplace.com', phone: '+919876543210' },
    { name: 'Urban Threads Co.', email: 'seller.urban@marketplace.com', phone: '+919876543211' },
    { name: 'Velvet & Silk Boutique', email: 'seller.velvet@marketplace.com', phone: '+919876543212' },
    { name: 'Metro Streetwear', email: 'seller.metro@marketplace.com', phone: '+919876543213' },
    { name: 'Elite Tailors', email: 'seller.elite@marketplace.com', phone: '+919876543214' },
    { name: 'Heritage Crafts', email: 'seller.heritage@marketplace.com', phone: '+919876543215' },
    { name: 'Horizon Activewear', email: 'seller.horizon@marketplace.com', phone: '+919876543216' },
    { name: 'Luxe Denim Lab', email: 'seller.luxe@marketplace.com', phone: '+919876543217' },
  ];

  const sellers = [];
  for (const v of vendorsData) {
    const seller = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: v.email,
        phone: v.phone,
        roles: ['SELLER', 'USER'],
      },
    });
    sellers.push({ ...seller, companyName: v.name });
  }

  // Buyers
  const buyersData = [
    { name: 'Alice Johnson', email: 'alice@gmail.com', phone: '+919111111111' },
    { name: 'Bob Smith', email: 'bob@gmail.com', phone: '+919222222222' },
    { name: 'Charlie Davis', email: 'charlie@gmail.com', phone: '+919333333333' },
    { name: 'Diana Prince', email: 'diana@gmail.com', phone: '+919444444444' },
  ];
  const buyers = [];
  for (const b of buyersData) {
    const buyer = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: b.email,
        phone: b.phone,
        roles: ['BUYER', 'USER'],
      },
    });
    buyers.push(buyer);
  }

  // 3. Create Brands
  console.log('🏷️ Creating Fashion Brands...');
  const brandNames = [
    'Zara', "Levi's", 'Nike', 'Adidas', 'Tommy Hilfiger',
    'Puma', 'Calvin Klein', 'Ralph Lauren', 'Gucci', 'H&M',
  ];
  const brandsMap = new Map<string, string>();
  for (const bName of brandNames) {
    const brand = await prisma.brand.create({
      data: {
        id: uuidv7(),
        name: bName,
        slug: bName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      },
    });
    brandsMap.set(bName, brand.id);
  }

  // 4. Create Hierarchical Categories
  console.log('📁 Creating Categories Hierarchy...');
  const catMenswear = await prisma.category.create({
    data: { id: uuidv7(), name: 'Menswear', slug: 'menswear', path: '/menswear' },
  });
  const catShirts = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Shirts',
      slug: 'mens-shirts',
      parentId: catMenswear.id,
      path: `${catMenswear.path}/shirts`,
    },
  });
  const catTShirts = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'T-Shirts',
      slug: 'mens-tshirts',
      parentId: catMenswear.id,
      path: `${catMenswear.path}/tshirts`,
    },
  });
  const catJeans = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Jeans',
      slug: 'mens-jeans',
      parentId: catMenswear.id,
      path: `${catMenswear.path}/jeans`,
    },
  });
  const catJackets = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Jackets & Coats',
      slug: 'mens-jackets',
      parentId: catMenswear.id,
      path: `${catMenswear.path}/jackets`,
    },
  });

  const catWomenswear = await prisma.category.create({
    data: { id: uuidv7(), name: 'Womenswear', slug: 'womenswear', path: '/womenswear' },
  });
  const catDresses = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Dresses',
      slug: 'womens-dresses',
      parentId: catWomenswear.id,
      path: `${catWomenswear.path}/dresses`,
    },
  });
  const catWomenTops = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Tops & Blouses',
      slug: 'womens-tops',
      parentId: catWomenswear.id,
      path: `${catWomenswear.path}/tops`,
    },
  });
  const catFootwear = await prisma.category.create({
    data: { id: uuidv7(), name: 'Footwear', slug: 'footwear', path: '/footwear' },
  });
  const catSneakers = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: 'Sneakers',
      slug: 'sneakers',
      parentId: catFootwear.id,
      path: `${catFootwear.path}/sneakers`,
    },
  });

  // 5. Create Warehouses
  console.log('🏭 Creating Warehouses...');
  const whMumbai = await prisma.warehouse.create({
    data: {
      id: uuidv7(),
      name: 'Mumbai Central Warehouse Hub',
      code: 'WH-BOM-01',
      address: '400001 Mumbai, Maharashtra',
    },
  });

  const whDelhi = await prisma.warehouse.create({
    data: {
      id: uuidv7(),
      name: 'Delhi NCR Logistics Center',
      code: 'WH-DEL-01',
      address: '122001 Gurugram, Haryana',
    },
  });

  const whBlr = await prisma.warehouse.create({
    data: {
      id: uuidv7(),
      name: 'Bengaluru Tech Park Hub',
      code: 'WH-BLR-01',
      address: '560001 Bengaluru, Karnataka',
    },
  });
  const warehouses = [whMumbai, whDelhi, whBlr];

  // 6. Products Catalog List Data
  console.log('🛍️ Seeding Products, Variants, SKUs, Stock, & Images...');
  const productsCatalog = [
    {
      name: 'Classic Oxford Cotton Shirt',
      brand: 'Zara',
      category: catShirts,
      sellerIdx: 0,
      description: 'Tailored fit premium 100% Oxford cotton shirt with button-down collar.',
      variants: [
        {
          color: 'Sky Blue',
          image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop',
          skus: [
            { code: 'OXF-BLU-S', size: 'S', price: 199900, mrp: 299900 },
            { code: 'OXF-BLU-M', size: 'M', price: 199900, mrp: 299900 },
            { code: 'OXF-BLU-L', size: 'L', price: 199900, mrp: 299900 },
          ],
        },
        {
          color: 'Crisp White',
          image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop',
          skus: [
            { code: 'OXF-WHT-M', size: 'M', price: 199900, mrp: 299900 },
            { code: 'OXF-WHT-L', size: 'L', price: 199900, mrp: 299900 },
          ],
        },
      ],
    },
    {
      name: '501 Original Fit Denim Jeans',
      brand: "Levi's",
      category: catJeans,
      sellerIdx: 7,
      description: 'The iconic straight fit jean with classic 5-pocket styling and signature button fly.',
      variants: [
        {
          color: 'Dark Indigo',
          image: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=800&auto=format&fit=crop',
          skus: [
            { code: 'LEV-501-30', size: '30', price: 349900, mrp: 499900 },
            { code: 'LEV-501-32', size: '32', price: 349900, mrp: 499900 },
            { code: 'LEV-501-34', size: '34', price: 349900, mrp: 499900 },
          ],
        },
        {
          color: 'Washed Black',
          image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&auto=format&fit=crop',
          skus: [
            { code: 'LEV-BLK-32', size: '32', price: 349900, mrp: 499900 },
            { code: 'LEV-BLK-34', size: '34', price: 349900, mrp: 499900 },
          ],
        },
      ],
    },
    {
      name: 'Air Force 1 Retro Sneakers',
      brand: 'Nike',
      category: catSneakers,
      sellerIdx: 6,
      description: 'Classic court style featuring stitched overlays, bold accents, and air cushion comfort.',
      variants: [
        {
          color: 'White / Royal Blue',
          image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&auto=format&fit=crop',
          skus: [
            { code: 'AF1-WHT-08', size: 'UK 8', price: 749500, mrp: 999500 },
            { code: 'AF1-WHT-09', size: 'UK 9', price: 749500, mrp: 999500 },
            { code: 'AF1-WHT-10', size: 'UK 10', price: 749500, mrp: 999500 },
          ],
        },
      ],
    },
    {
      name: 'Essential Oversized Graphic Tee',
      brand: 'Tommy Hilfiger',
      category: catTShirts,
      sellerIdx: 1,
      description: 'Heavyweight 240 GSM organic cotton t-shirt with signature brand chest print.',
      variants: [
        {
          color: 'Jet Black',
          image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop',
          skus: [
            { code: 'TEE-BLK-S', size: 'S', price: 149900, mrp: 249900 },
            { code: 'TEE-BLK-M', size: 'M', price: 149900, mrp: 249900 },
            { code: 'TEE-BLK-L', size: 'L', price: 149900, mrp: 249900 },
          ],
        },
        {
          color: 'Heather Grey',
          image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop',
          skus: [
            { code: 'TEE-GRY-M', size: 'M', price: 149900, mrp: 249900 },
            { code: 'TEE-GRY-L', size: 'L', price: 149900, mrp: 249900 },
          ],
        },
      ],
    },
    {
      name: 'Leather Biker Jacket',
      brand: 'Calvin Klein',
      category: catJackets,
      sellerIdx: 4,
      description: 'Genuine lambskin leather jacket with asymmetrical zip closure and quilted shoulder detail.',
      variants: [
        {
          color: 'Onyx Black',
          image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop',
          skus: [
            { code: 'JKT-LEA-M', size: 'M', price: 1499900, mrp: 1999900 },
            { code: 'JKT-LEA-L', size: 'L', price: 1499900, mrp: 1999900 },
          ],
        },
      ],
    },
    {
      name: 'Floral Chiffon Midi Dress',
      brand: 'Zara',
      category: catDresses,
      sellerIdx: 2,
      description: 'Elegant flowy midi dress with delicate floral print, V-neckline, and tiered skirt.',
      variants: [
        {
          color: 'Pastel Rose',
          image: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&auto=format&fit=crop',
          skus: [
            { code: 'DRS-FLR-S', size: 'S', price: 299900, mrp: 449900 },
            { code: 'DRS-FLR-M', size: 'M', price: 299900, mrp: 449900 },
          ],
        },
      ],
    },
    {
      name: 'Ultraboost Running Shoes',
      brand: 'Adidas',
      category: catSneakers,
      sellerIdx: 6,
      description: 'High-performance running sneakers featuring responsive Boost midsole cushioning.',
      variants: [
        {
          color: 'Core Black',
          image: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&auto=format&fit=crop',
          skus: [
            { code: 'UB-BLK-08', size: 'UK 8', price: 899900, mrp: 1199900 },
            { code: 'UB-BLK-09', size: 'UK 9', price: 899900, mrp: 1199900 },
          ],
        },
      ],
    },
    {
      name: 'Silk Blend Wrap Blouse',
      brand: 'H&M',
      category: catWomenTops,
      sellerIdx: 2,
      description: 'Sophisticated silk blend blouse featuring a crossover front wrap and tie belt.',
      variants: [
        {
          color: 'Emerald Green',
          image: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800&auto=format&fit=crop',
          skus: [
            { code: 'TOP-SLK-S', size: 'S', price: 179900, mrp: 279900 },
            { code: 'TOP-SLK-M', size: 'M', price: 179900, mrp: 279900 },
          ],
        },
      ],
    },
  ];

  let createdProductCount = 0;
  let createdSkuCount = 0;

  for (const item of productsCatalog) {
    const seller = sellers[item.sellerIdx];
    const brandId = brandsMap.get(item.brand);

    const product = await prisma.product.create({
      data: {
        id: uuidv7(),
        name: item.name,
        slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: item.description,
        status: ProductStatus.LIVE,
        categoryId: item.category.id,
        brandId: brandId,
        sellerId: seller.id,
      },
    });
    createdProductCount++;

    for (const vData of item.variants) {
      const variant = await prisma.productVariant.create({
        data: {
          id: uuidv7(),
          productId: product.id,
          color: vData.color,
        },
      });

      // Product Image
      await prisma.productImage.create({
        data: {
          id: uuidv7(),
          variantId: variant.id,
          url: vData.image,
          isPrimary: true,
        },
      });

      // SKUs & Inventory
      for (const skuInfo of vData.skus) {
        const sku = await prisma.sku.create({
          data: {
            id: uuidv7(),
            variantId: variant.id,
            skuCode: skuInfo.code,
            sellerId: seller.id,
            size: skuInfo.size,
            price: BigInt(skuInfo.price),
            mrp: BigInt(skuInfo.mrp),
          },
        });
        createdSkuCount++;

        // Add inventory in all 3 warehouses
        for (const wh of warehouses) {
          await prisma.skuInventory.create({
            data: {
              id: uuidv7(),
              skuId: sku.id,
              warehouseId: wh.id,
              onHand: 150,
              reserved: 0,
            },
          });
        }

        // Add a sample review for the first buyer
        await prisma.review.create({
          data: {
            id: uuidv7(),
            productId: product.id,
            skuId: sku.id,
            buyerId: buyers[0].id,
            rating: 5,
            title: 'Outstanding quality!',
            comment: 'Extremely comfortable and premium fitting. Highly recommended!',
            status: 'APPROVED',
          },
        }).catch(() => {});
      }
    }
  }

  console.log(`✅ Successfully seeded database!`);
  console.log(`   - Admin: ${admin.email}`);
  console.log(`   - Vendors (Sellers): ${sellers.length}`);
  console.log(`   - Buyers: ${buyers.length}`);
  console.log(`   - Brands: ${brandNames.length}`);
  console.log(`   - Products (LIVE): ${createdProductCount}`);
  console.log(`   - Active SKUs: ${createdSkuCount}`);
  console.log(`   - Warehouses: ${warehouses.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
