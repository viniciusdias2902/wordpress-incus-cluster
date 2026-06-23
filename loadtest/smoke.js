// Teste rápido de fumaça (smoke) — valida que o site responde antes de
// rodar o estresse pesado.
//
//   k6 run loadtest/smoke.js
//   BASE_URL=https://viniciusdias.tech k6 run loadtest/smoke.js

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 1,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);
  check(res, {
    'status 200': (r) => r.status === 200,
  });
}
