import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 50 },  // Ramp up to 50 VUs
    { duration: '10s', target: 200 }, // Peak load 200 VUs
    { duration: '5s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'], // 95% of search queries should finish under 150ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

const API_BASE_URL = __ENV.API_URL || 'http://localhost:3001';

export default function () {
  const searchTerms = ['shirt', 'denim', 'cotton', 'linen', 'black', 'jacket'];
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const res = http.get(`${API_BASE_URL}/search?q=${term}`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response latency p95 under threshold': (r) => r.timings.duration < 150,
  });

  sleep(0.05);
}
