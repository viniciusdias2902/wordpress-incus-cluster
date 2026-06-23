# Rodando na VPS com Incus

Este stack roda dentro de um container/VM do Incus na VPS. O modelo é:

```
Internet → viniciusdias.tech
              │
        nginx do HOST  (TLS via certbot, porta 443/80)
              │  proxy_pass http://<ip-do-container-incus>:8080
              │
        ┌─────┴─────────────────────────┐
        │  Incus VM/container "web"      │
        │   docker compose (este repo)   │
        │   ├─ lb (nginx round-robin)    │
        │   ├─ wordpress × N réplicas    │
        │   └─ db (MariaDB)              │
        └────────────────────────────────┘
```

> Em 1–2 vCPU, rodar Docker dentro de **uma** VM Incus é o caminho mais
> simples e estável. Se o trabalho exigir várias máquinas Incus de fato,
> dá pra separar `db` em um container e as réplicas `wordpress` em outros —
> veja a observação no fim.

## 1. Criar a VM no cluster Incus

```bash
# VM com Docker habilitado (nesting para containers)
incus launch images:ubuntu/24.04 web --vm \
  -c limits.cpu=2 -c limits.memory=4GiB

# entrar na VM
incus shell web
```

## 2. Dentro da VM: instalar Docker e clonar o repo

```bash
apt update && apt install -y docker.io docker-compose-v2 git
git clone <URL_DO_SEU_REPO_GITHUB> /opt/site
cd /opt/site
cp .env.example .env
# edite .env e defina senhas
docker compose up -d                 # 1 réplica
# docker compose up -d --scale wordpress=3   # 3 réplicas
```

## 3. Descobrir o IP da VM (visto pelo host)

```bash
incus list web    # coluna IPV4
```

## 4. nginx do HOST → VM (TLS do domínio)

No **host** da VPS (não dentro da VM), com o domínio já apontando:

```nginx
server {
    server_name viniciusdias.tech;
    location / {
        proxy_pass http://<IP_DA_VM>:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo certbot --nginx -d viniciusdias.tech
```

## 5. Concluir a instalação do WordPress

Acesse `https://viniciusdias.tech` e finalize o wizard do WordPress.

---

## Variação: réplicas em VMs Incus separadas (cluster "de verdade")

Para mostrar escala horizontal entre nós do cluster, em vez do `--scale`:

1. `db` em uma VM dedicada (`incus launch ... db`).
2. Uma VM por réplica de WordPress, todas com `WORDPRESS_DB_HOST` apontando
   para o IP da VM do `db` e montando o **mesmo** `wp-content` via disco
   compartilhado do Incus:
   ```bash
   incus storage volume create default wp-content
   incus config device add web1 wpcontent disk \
     pool=default source=wp-content path=/opt/site/wp-content
   ```
3. O `lb` (nginx) com `upstream` listando os IPs das VMs de WordPress.

Esse é o experimento que rende a melhor análise: medir 1 → 2 → 3 nós e ver
onde o `db` único vira gargalo.
