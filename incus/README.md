# Deploy no cluster Incus (VPS Hostinger)

Guia para rodar o site sob **https://viniciusdias.tech/loja/**, ao lado do
portfolio/slides/tally que já existem, sem derrubá-los.

> **Por que container Incus e não VM:** a VPS já é uma KVM. Container Incus
> (LXC) não precisa de virtualização aninhada, é leve e suficiente para
> rodar Docker dentro (com `security.nesting=true`). Em 1–2 vCPU é a opção
> estável.

```
Internet → viniciusdias.tech (nginx do HOST, TLS certbot já existente)
   ├─ location /          → portfolio (503)
   ├─ location /slides/   → /var/www/slides
   ├─ location /tally/    → :3000
   └─ location /loja/     → 127.0.0.1:8080  ← NOVO (proxy device do Incus)
                                  │
                        ┌─────────▼──────────┐
                        │ container Incus "web"│
                        │  docker compose:     │
                        │   lb → wordpress ×N  │
                        │        └→ db (MariaDB)│
                        └──────────────────────┘
```

## 1. Instalar o Incus

```bash
sudo apt update
sudo apt install -y incus
sudo adduser $USER incus-admin     # relogue depois (newgrp incus-admin)
```

## 2. Inicializar e habilitar o cluster

```bash
sudo incus admin init --minimal     # storage default + bridge incusbr0
incus cluster enable web-cluster    # torna este nó um membro de cluster
incus cluster list                  # confirma o membro ONLINE
```

## 3. Profile com nesting (para Docker dentro do container)

```bash
incus profile create docker
incus profile set docker security.nesting=true
incus profile set docker limits.cpu=2
incus profile set docker limits.memory=4GiB
```

## 4. Criar o container e clonar o repo

```bash
incus launch images:ubuntu/24.04 web -p default -p docker
incus shell web      # entra no container

# --- dentro do container "web" ---
apt update && apt install -y docker.io docker-compose-v2 git
git clone <URL_DO_SEU_REPO> /opt/site
cd /opt/site
cp .env.example .env
```

Edite o `.env` dentro do container e ajuste:

```ini
WORDPRESS_DB_PASSWORD=uma_senha_forte
LB_PORT=8080
WP_HOME=https://viniciusdias.tech/loja
WP_SITEURL=https://viniciusdias.tech/loja
```

Suba o stack (comece com 1 réplica):

```bash
docker compose up -d
docker compose ps           # lb, wordpress, db de pé
curl -s localhost:8080/lb-health   # -> ok
exit                        # volta pro host
```

## 5. Expor a porta do container no host (proxy device)

No **host** (não no container). Mapeia `127.0.0.1:8080` do host para o LB
do container — IP estável, sobrevive a reinício:

```bash
incus config device add web proxy8080 proxy \
  listen=tcp:127.0.0.1:8080 connect=tcp:127.0.0.1:8080
curl -s 127.0.0.1:8080/lb-health    # -> ok (agora a partir do host)
```

## 6. nginx do host: adicionar /loja/

Cole o conteúdo de [`../nginx/host-loja.snippet.conf`](../nginx/host-loja.snippet.conf)
**dentro** do server block `listen 443 ssl` em
`/etc/nginx/sites-available/portfolio` (ao lado dos outros `location`).

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Não precisa de cert novo: o subpath usa o certificado de `viniciusdias.tech`
que o Certbot já gerencia.

## 7. Concluir a instalação do WordPress

Acesse **https://viniciusdias.tech/loja/** e finalize o wizard. Como
`WP_HOME`/`WP_SITEURL` estão fixos no `.env`, o WordPress já grava as URLs
sob `/loja` corretamente.

## 8. Escalar réplicas (o experimento)

Dentro do container `web`, em `/opt/site`:

```bash
docker compose up -d --scale wordpress=2
docker compose up -d --scale wordpress=3
```

Rode os testes de estresse da **sua máquina** apontando para o domínio:

```bash
BASE_URL=https://viniciusdias.tech/loja k6 run loadtest/stress.js
```

Monitore no host com `htop` e dentro do container com `docker stats` para
montar a matriz réplicas × req/s × p95 × erros.

---

## Variação: cluster Incus "de verdade" (vários containers)

Para demonstrar Incus orquestrando uma frota (e não só Docker escalando
dentro de um container), separe os papéis em containers Incus distintos:

```bash
# 1 container para o banco
incus launch images:ubuntu/24.04 db -p default -p docker
# N containers para a aplicação
incus launch images:ubuntu/24.04 web1 -p default -p docker
incus launch images:ubuntu/24.04 web2 -p default -p docker
```

- `db`: roda só o MariaDB; anote o IP com `incus list db`.
- `web1..N`: rodam só o `wordpress`, com `WORDPRESS_DB_HOST=<IP do db>` e o
  **mesmo** `wp-content` via volume compartilhado do Incus:
  ```bash
  incus storage volume create default wp-content
  incus config device add web1 wpc disk pool=default \
    source=wp-content path=/var/www/html/wp-content
  # repita o device em web2..N
  ```
- nginx do host com `upstream` listando os IPs de `web1..N`.

Esse cenário rende a melhor análise: ao medir 1 → 2 → 3 nós você mostra onde
o `db` único vira o gargalo do cluster.
