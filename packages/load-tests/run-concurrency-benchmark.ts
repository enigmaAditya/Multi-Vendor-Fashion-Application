import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { JwtService } from '../../apps/api/src/auth/jwt-auth.guard';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

async function runBenchmark() {
  console.log('--- 🚀 Starting High-Concurrency Stock Reservation Load Test Benchmark ---');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  await app.listen(3001);

  const prisma = app.get(PrismaService);

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
      status: 'APPROVED',
    },
  });

  await prisma.sku.create({
    data: {
      id: skuId,
      productId,
      sellerId,
      skuCode: `BENCH-SKU-${skuId.substring(0, 6)}`,
      price: 150000n,
      mrp: 200000n,
    },
  });

  await prisma.warehouse.create({
    data: {
      id: warehouseId,
      name: 'Benchmark Warehouse',
      address: { city: 'Mumbai' },
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

  console.log(`✓ Seeded SKU ${skuId} with exactly 5 units on hand in Warehouse ${warehouseId}`);

  // 2. Generate 50 Buyer Tokens
  const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
  const jwtService = app.get(JwtService);

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
    // @ts-ignore
    const token = await jwtService.jwtService.signAsync(
      { sub: buyerId, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    buyerTokens.push(token);
  }

  console.log('✓ Created 50 distinct buyer accounts and JWT tokens');

  // 3. Execute Concurrency Benchmark (50 Concurrent Checkout Requests)
  console.log('⚡ Executing 50 concurrent checkout requests for 5 available units...');
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

  // 4. Verify Database Integrity & Stock Lock Invariant
  const successfulCheckouts = results.filter((r) => r.status === 201).length;
  const failedCheckouts = results.filter((r) => r.status === 400 || r.status === 409).length;

  const finalInventory = await prisma.skuInventory.findUniqueOrThrow({
    where: { warehouseId_skuId: { warehouseId, skuId } },
  });

  const createdReservations = await prisma.inventoryReservation.count({
    where: { skuId, status: 'PENDING' },
  });

  console.log('\n--- 📊 Concurrency Load Test Results ---');
  console.log(`Total Concurrent Buyers: 50`);
  console.log(`Initial Stock Units:     5`);
  console.log(`Execution Time:          ${durationMs}ms`);
  console.log(`Successful Checkouts:    ${successfulCheckouts} (HTTP 201 Created)`);
  console.log(`Failed Out-of-Stock:     ${failedCheckouts} (HTTP 400 Bad Request)`);
  console.log(`Final DB Stock onHand:   ${finalInventory.onHand}`);
  console.log(`Final DB Stock reserved: ${finalInventory.reserved}`);
  console.log(`Active DB Reservations:  ${createdReservations}`);

  if (successfulCheckouts === 5 && finalInventory.onHand === 0 && createdReservations === 5) {
    console.log('\n✅ ATOMIC STOCK LOCK INVARIANT PASSED: Exactly 5 orders succeeded, 45 blocked, 0 oversold!');
  } else {
    console.error('\n❌ CONCURRENCY FAILURE: Overselling or stock lock mismatch detected!');
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
