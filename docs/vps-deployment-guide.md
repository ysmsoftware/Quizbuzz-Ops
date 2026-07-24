# Quizbuzz Ops Dashboard - VPS Deployment & Operations Guide

This guide covers the initial setup, environment configuration, database connectivity, and CI/CD operations for running the **Quizbuzz Operational Dashboard** on an **AlmaLinux VPS** connected to an **AWS RDS PostgreSQL** cluster.

---

## Architecture Quick Reference

- **App Server**: AlmaLinux Private Cloud VPS
- **Domain**: `ops.ysmquizbuzz.com`
- **Reverse Proxy**: Nginx (System service on AlmaLinux)
- **Container Port**: `3010:3000` (`quizbuzz-ops-app`)
- **Container Registry**: GitHub Container Registry (`ghcr.io/ysmsoftware/quizbuzz-ops-next`)
- **Database**: AWS RDS PostgreSQL Instance (Shared with Main App)
  - `OPS_DATABASE_URL` -> `quizbuzz_ops`
  - `MAIN_DATABASE_URL` -> `quizbuzz`

---

## Part 1: AlmaLinux VPS One-Time Preparation

### 1. Directory Structure
Log into your AlmaLinux VPS via SSH and create the target deployment directory:
```bash
sudo mkdir -p /var/www/quizbuzz-ops-next
sudo chown -R $USER:$USER /var/www/quizbuzz-ops-next
cd /var/www/quizbuzz-ops-next
```

### 2. Copy Production Files
Copy `docker-compose.prod.yml` and `.env.production` into `/var/www/quizbuzz-ops-next/`:
```bash
# Create .env.production on VPS
nano /var/www/quizbuzz-ops-next/.env.production
```
*(Populate variables using [.env.production.example](file:///Users/austinmakasare/Desktop/YSM/quizbuzz-ops-next/.env.production.example))*

### 3. Setup Shared Docker Network
Ensure the shared Docker network exists on the VPS:
```bash
docker network create quizbuzz-new_default || true
```

### 4. AWS RDS Security Group Configuration
In your AWS Management Console:
1. Go to **EC2 / RDS Security Groups**.
2. Edit Inbound Rules for your RDS cluster.
3. Add Rule:
   - **Type**: PostgreSQL (Port 5432)
   - **Source**: Custom -> `YOUR_ALMALINUX_VPS_PUBLIC_IP/32`

---

## Part 2: Nginx Reverse Proxy Setup on AlmaLinux

1. Copy the Nginx configuration file:
   ```bash
   sudo cp nginx/ops.ysmquizbuzz.com.conf /etc/nginx/conf.d/ops.ysmquizbuzz.com.conf
   ```
2. Test Nginx configuration and reload:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```
3. Issue SSL Certificate via Certbot:
   ```bash
   sudo certbot --nginx -d ops.ysmquizbuzz.com
   ```

---

## Part 3: GitHub Actions CI/CD Setup

In your GitHub repository (`ysmsoftware/Quizbuzz-Ops`), go to **Settings > Secrets and variables > Actions** and add the following repository secrets:

| Secret Name | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `VPS_HOST` | IP address or domain of your AlmaLinux VPS | `192.0.2.1` or `vps.ysmquizbuzz.com` |
| `VPS_USER` | SSH username | `root` or `deploy` |
| `VPS_SSH_KEY` | Private SSH key (PEM format) matching VPS `authorized_keys` | `-----BEGIN OPENSSH PRIVATE KEY----- ...` |
| `VPS_SSH_PORT` | SSH port (Optional) | `22` |

---

## Part 4: Automated CI/CD & Rollback Mechanism

When a commit is pushed to `main`:
1. GitHub Actions builds a standalone Next.js Docker image.
2. Image is tagged with Git commit SHA and pushed to `ghcr.io`.
3. GitHub Actions SSHs into AlmaLinux VPS.
4. Performs database migrations against AWS RDS (`npx prisma migrate deploy`).
5. Launches the new image tag on port `3010`.
6. Executes 10 health probes against `http://127.0.0.1:3010/api/health`.
7. **If Health Check Fails**:
   - Automatically stops the failing container.
   - Rolls back to the previously recorded working container image tag.
8. **If Health Check Succeeds**:
   - Executes `docker image prune -af --filter "until=24h"` to remove unused images and maintain disk space.

---

## Part 5: Manual Operational Commands

### Checking Application Health
```bash
curl http://127.0.0.1:3010/api/health
```

### Inspecting Container Logs on VPS
```bash
docker logs -f quizbuzz-ops-app
```

### Manual Rollback (If needed)
```bash
cd /var/www/quizbuzz-ops-next
DOCKER_IMAGE=ghcr.io/ysmsoftware/quizbuzz-ops-next:<PREVIOUS_STABLE_SHA> docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### Manual Database Seed on RDS
```bash
docker run --rm --env-file .env.production ghcr.io/ysmsoftware/quizbuzz-ops-next:latest node prisma/seed.js
```
