import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

async function runBenchmark() {
  console.log(
    '\n================================================================',
  );
  console.log('⚡ HIGH-CONCURRENCY ATOMIC STOCK RESERVATION BENCHMARK ⚡');
  console.log(
    '================================================================\n',
  );

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  await app.listen(3001);

  const prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);

  // 1. Seed Warehouse & SKU with exactly 5 stock units
  const sellerId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const skuId = crypto.randomUUID();
  const warehouseId = crypto.randomUUID();

  await prisma.user.create({
    data: {
      id: sellerId,
      phone: `+91900${Math.floor(1000000 + Math.random() * 9000000)}`,
      roles: ['SELLER'],
    },
  });

  await prisma.category.create({
    data: {
      id: categoryId,
      name: `Benchmark Category ${categoryId.substring(0, 6)}`,
      slug: `bench-cat-${categoryId.substring(0, 6)}`,
    },
  });

  await prisma.product.create({
    data: {
      id: productId,
      name: 'Concurrency Benchmark Shirt',
      slug: `bench-shirt-${productId.substring(0, 6)}`,
      categoryId,
      sellerId,
      status: 'LIVE',
    },
  });

  const variantId = crypto.randomUUID();

  await prisma.productVariant.create({
    data: {
      id: variantId,
      productId,
      color: 'Navy Blue',
    },
  });

  await prisma.sku.create({
    data: {
      id: skuId,
      variantId,
      sellerId,
      skuCode: `BENCH-SKU-${skuId.substring(0, 6)}`,
      size: 'L',
      price: 150000n,
      mrp: 200000n,
    },
  });

  await prisma.warehouse.create({
    data: {
      id: warehouseId,
      name: `Benchmark Warehouse ${warehouseId.substring(0, 6)}`,
      code: `WH-BENCH-${warehouseId.substring(0, 6)}`,
      address: 'Mumbai',
    },
  });

  await prisma.skuInventory.create({
    data: {
      skuId,
      warehouseId,
      onHand: 5,
      reserved: 0,
    },
  });

  console.log(`[SEED] Created SKU: ${skuId}`);
  console.log(`[SEED] Warehouse Stock onHand: 5 units | reserved: 0 units\n`);

  // 2. Generate 50 Buyer Tokens
  const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';

  const buyerTokens: string[] = [];
  for (let i = 0; i < 50; i++) {
    const buyerId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: buyerId,
        phone: `+919${Math.floor(100000000 + Math.random() * 900000000)}`,
        roles: ['USER'],
      },
    });
    const token = await jwtService.signAsync(
      { sub: buyerId, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    buyerTokens.push(token);
  }

  console.log(`[SETUP] Prepared 50 distinct buyer accounts and JWT tokens`);

  // 3. Execute 50 Simultaneous Checkout Requests
  console.log(
    '----------------------------------------------------------------',
  );
  console.log(
    '🔥 Simulating 50 Concurrent Buyers Competing for 5 Available Units...',
  );
  console.log(
    '----------------------------------------------------------------',
  );

  const startTime = Date.now();

  const results = await Promise.all(
    buyerTokens.map(async (token) => {
      try {
        const res = await fetch('http://localhost:3001/orders/checkout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cartItems: [{ skuId, quantity: 1 }],
            shippingAddress: { city: 'Delhi', pincode: '110001' },
          }),
        });
        return { status: res.status, body: await res.json() };
      } catch (e: any) {
        return { status: 500, error: e.message };
      }
    }),
  );

  const durationMs = Date.now() - startTime;
  const successfulCheckouts = results.filter((r) => r.status === 201).length;
  const failedCheckouts = results.filter(
    (r) => r.status === 400 || r.status === 409,
  ).length;

  const finalInventory = await prisma.skuInventory.findUniqueOrThrow({
    where: { warehouseId_skuId: { warehouseId, skuId } },
  });

  const createdReservations = await prisma.inventoryReservation.count({
    where: { skuId, status: 'PENDING' },
  });

  const availableStock = finalInventory.onHand - finalInventory.reserved;

  console.log(
    '\n================================================================',
  );
  console.log('📈 EMPIRICAL CONCURRENCY BENCHMARK RESULTS');
  console.log(
    '================================================================',
  );
  console.log(`Total Concurrent Requests:  50`);
  console.log(`Initial Stock Units:        5`);
  console.log(`Benchmark Execution Time:   ${durationMs} ms`);
  console.log(`Successful Checkouts (201): ${successfulCheckouts}`);
  console.log(`Failed Out-Of-Stock (400):  ${failedCheckouts}`);
  console.log(`Final DB Inventory onHand:  ${finalInventory.onHand}`);
  console.log(`Final DB Stock reserved:    ${finalInventory.reserved}`);
  console.log(`Calculated Available Stock: ${availableStock}`);
  console.log(`Active DB Reservations:     ${createdReservations}`);
  console.log(
    '----------------------------------------------------------------',
  );

  if (
    successfulCheckouts === 5 &&
    failedCheckouts === 45 &&
    availableStock === 0 &&
    createdReservations === 5
  ) {
    console.log(
      '✅ ATOMIC STOCK LOCK INVARIANT PASSED: Exactly 5 orders succeeded, 45 blocked, 0 oversold!\n',
    );
  } else {
    console.error(
      '❌ CONCURRENCY INVARIANT FAILURE: Overselling or stock lock mismatch detected!\n',
    );
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

// Intercept global fetch for Razorpay API endpoint
const originalFetch = global.fetch;
global.fetch = async function (
  input: string | URL | Request,
  init?: RequestInit,
) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url || '';
  if (url.includes('api.razorpay.com')) {
    return new Response(
      JSON.stringify({
        id: `order_rzp_mock_${crypto.randomUUID().slice(0, 8)}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return originalFetch(input, init);
};

runBenchmark().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
