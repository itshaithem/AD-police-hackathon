#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (run as root; deploy.sh does this for you).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl ufw rsync unattended-upgrades

# Docker Engine + Compose plugin (official install script)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# Firewall: SSH + HTTP(S) only. Only Caddy publishes ports (80/443); the backend, sandbox and demo sites are internal.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSH: keys only
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true

# Automatic security updates
dpkg-reconfigure -f noninteractive unattended-upgrades

# 4 GB swap so image builds and CLIP don't run out of memory
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/scamshield/data
touch /opt/scamshield/.setup-done
echo "Server setup complete."
