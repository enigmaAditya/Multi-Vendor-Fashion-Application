import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    checkout_burst: {
      executor: 'per-vu-iterations',
      vus: 50, // 50 concurrent buyers competing for 5 stock units
      iterations: 1,
      maxDuration: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.95'],
  },
};

const API_BASE_URL = __ENV.API_URL || 'http://localhost:3001';
const BUYER_TOKEN = __ENV.BUYER_TOKEN || 'mock-buyer-jwt-token';
const SKU_ID = __ENV.TEST_SKU_ID || 'mock-sku-id';

export default function () {
  const payload = JSON.stringify({
    cartItems: [
      {
        skuId: SKU_ID,
        quantity: 1,
      },
    ],
    shippingAddress: {
      fullName: 'Stress Test Buyer',
      phone: '+919999999999',
      street: '100 Load Test Way',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
  });

  const params = {
    headers: {
      Authorization: `Bearer ${BUYER_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${API_BASE_URL}/orders/checkout`, payload, params);

  // Expect either 201 Created (success claim) or 400 Bad Request (Stock lock depleted)
  check(res, {
    'status is 201 or 400': (r) => r.status === 201 || r.status === 400,
    'no 500 internal server errors': (r) => r.status !== 500,
  });

  sleep(0.1);
}
