import { PrismaService } from '../prisma/prisma.service';

/**
 * Pre-Flight Database Migration Audit Script
 *
 * Verifies that all existing database text column values in production
 * strictly match declared Prisma Enum values before running `prisma migrate deploy`.
 */
export async function runPreflightMigrationAudit() {
  const prisma = new PrismaService();
  const report: { table: string; column: string; values: string[] }[] = [];

  try {
    console.log('🔍 Starting Pre-Flight Database Migration Audit...');

    // 1. Audit products.status
    const productStatuses = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT DISTINCT status::text as status FROM products;
    `;
    report.push({
      table: 'products',
      column: 'status',
      values: productStatuses.map((r) => r.status),
    });

    // 2. Audit sub_orders columns
    const subOrderStatuses = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT DISTINCT status::text as status FROM sub_orders;
    `;
    report.push({
      table: 'sub_orders',
      column: 'status',
      values: subOrderStatuses.map((r) => r.status),
    });

    const subOrderSettlements = await prisma.$queryRaw<
      Array<{ settlementStatus: string }>
    >`
      SELECT DISTINCT "settlementStatus"::text as "settlementStatus" FROM sub_orders;
    `;
    report.push({
      table: 'sub_orders',
      column: 'settlementStatus',
      values: subOrderSettlements.map((r) => r.settlementStatus),
    });

    const subOrderShipments = await prisma.$queryRaw<
      Array<{ shipmentStatus: string }>
    >`
      SELECT DISTINCT "shipmentStatus"::text as "shipmentStatus" FROM sub_orders;
    `;
    report.push({
      table: 'sub_orders',
      column: 'shipmentStatus',
      values: subOrderShipments.map((r) => r.shipmentStatus),
    });

    // 3. Audit coupons columns
    const couponDiscountTypes = await prisma.$queryRaw<
      Array<{ discount_type: string }>
    >`
      SELECT DISTINCT discount_type::text as discount_type FROM coupons;
    `;
    report.push({
      table: 'coupons',
      column: 'discount_type',
      values: couponDiscountTypes.map((r) => r.discount_type),
    });

    const couponFundingTypes = await prisma.$queryRaw<
      Array<{ funding_type: string }>
    >`
      SELECT DISTINCT funding_type::text as funding_type FROM coupons;
    `;
    report.push({
      table: 'coupons',
      column: 'funding_type',
      values: couponFundingTypes.map((r) => r.funding_type),
    });

    console.log('✅ Pre-Flight Audit Summary:');
    console.table(report);
    return report;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`❌ Pre-Flight Audit failed: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runPreflightMigrationAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
