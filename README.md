# Site WordPress para cluster Incus + teste de estresse

Site WordPress empacotado para rodar em um cluster Incus e ser submetido a
testes de estresse com [k6](https://k6.io/). A aplicação é **stateless e
replicável**: várias réplicas de WordPress atrás de um load balancer nginx,
compartilhando um único banco MariaDB e um volume comum de `wp-content`.

Domínio do projeto: **viniciusdias.tech** (VPS Hostinger).

## Arquitetura

```
            ┌──────────────┐
 clientes → │  lb (nginx)  │  round-robin
            └──────┬───────┘
        ┌──────────┼──────────┐
   ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
   │  wp 1  │ │  wp 2  │ │  wp 3  │   (réplicas stateless)
   └────┬───┘ └────┬───┘ └────┬───┘
        └──────────┼──────────┘
              ┌─────▼─────┐
              │ db MariaDB│  (estado único = gargalo esperado)
              └───────────┘
   réplicas compartilham o volume wp_content (uploads/temas/plugins)
```

## Componentes

| Serviço     | Imagem              | Papel                                        |
|-------------|---------------------|----------------------------------------------|
| `lb`        | `nginx:1.27-alpine` | Load balancer round-robin entre as réplicas  |
| `wordpress` | `wordpress:6-apache`| Aplicação stateless, escala com `--scale`    |
| `db`        | `mariadb:11`        | Banco único compartilhado                    |

## Pré-requisitos

- Docker + plugin Compose v2
- [k6](https://k6.io/docs/get-started/installation/) (na **sua** máquina, para os testes)

## Como rodar localmente

```bash
cp .env.example .env        # ajuste as senhas
docker compose up -d        # 1 réplica
# ou, com 3 réplicas:
docker compose up -d --scale wordpress=3
```

Acesse `http://localhost:8080` e conclua o wizard do WordPress.

Com o Makefile:

```bash
make up REPLICAS=3
make ps
make down
```

## Como rodar na VPS (Incus)

Passo a passo completo em [`incus/README.md`](incus/README.md): criar a
VM/container no cluster, instalar Docker, clonar este repo, e configurar o
nginx do host com TLS (certbot) para `viniciusdias.tech`.

## Testes de estresse

Rode **da sua máquina**, apontando para o domínio:

```bash
# fumaça (sanidade)
BASE_URL=https://viniciusdias.tech k6 run loadtest/smoke.js

# estresse (sobe até o ponto de quebra)
BASE_URL=https://viniciusdias.tech k6 run loadtest/stress.js

# salvando resultado bruto para o relatório
mkdir -p loadtest/results
BASE_URL=https://viniciusdias.tech \
  k6 run --out json=loadtest/results/3-replicas.json loadtest/stress.js
```

### O experimento (matriz de réplicas)

Repita o mesmo teste variando as réplicas e compare:

| Réplicas | req/s pico | p95 (ms) | % erro | CPU host |
|----------|-----------|----------|--------|----------|
| 1        |           |          |        |          |
| 2        |           |          |        |          |
| 3        |           |          |        |          |

Para reescalar entre as rodadas, na VPS:

```bash
docker compose up -d --scale wordpress=2
```

Acompanhe os recursos durante o teste com `htop` no host e `docker stats`
(ou `incus top`) para correlacionar carga × latência × erros.

## Estrutura

```
.
├── docker-compose.yml      # stack: lb + wordpress + db
├── .env.example            # variáveis (copie para .env)
├── Makefile                # atalhos (up/scale/stress/...)
├── nginx/
│   └── loadbalancer.conf   # round-robin via DNS do Docker
├── loadtest/
│   ├── smoke.js            # teste de sanidade
│   └── stress.js           # teste de estresse (k6)
└── incus/
    └── README.md           # deploy no cluster Incus + TLS
```
