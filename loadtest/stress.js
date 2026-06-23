// Teste de estresse com k6 — cenário de navegação realista.
//
// Rode SEMPRE da sua máquina (não na VPS), para o gerador de carga não
// competir por CPU com o alvo.
//
// Uso:
//   k6 run loadtest/stress.js
//   BASE_URL=https://viniciusdias.tech k6 run loadtest/stress.js
//   k6 run --out json=loadtest/results/run.json loadtest/stress.js
//
// Para a matriz do trabalho, repita o mesmo teste variando o número de
// réplicas na VPS (docker compose up -d --scale wordpress=1|2|3) e compare.

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const erros = new Rate('erros');

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // aquecimento
    { duration: '3m', target: 100 }, // carga sustentada
    { duration: '1m', target: 200 }, // empurra até o ponto de quebra
    { duration: '1m', target: 0 },   // desaceleração
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // meta: p95 abaixo de 2s
    erros: ['rate<0.05'],              // meta: menos de 5% de erro
  },
};

export default function () {
  // Home — caminho mais quente do site.
  const res = http.get(`${BASE_URL}/`, {
    headers: { 'User-Agent': 'k6-stress-test' },
  });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'tem conteúdo': (r) => r.body && r.body.length > 0,
  });
  erros.add(!ok);

  // "Tempo de leitura" entre cliques (0 a 2s).
  sleep(Math.random() * 2);
}
