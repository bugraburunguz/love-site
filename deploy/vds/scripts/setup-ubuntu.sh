#!/usr/bin/env bash
# First boot of a fresh Ubuntu 24.04 VDS, as root, once:
#
#   scp setup-ubuntu.sh root@SERVER: && ssh root@SERVER 'bash setup-ubuntu.sh'
#
# Updates, automatic security updates, a "deploy" user with your SSH key, SSH without passwords or root login, firewall
# (22, 80, 443), Docker Engine + compose plugin from Docker's own repository, 2 GB swap, Istanbul time, /srv folders.
# Before you close the root session: open a NEW terminal and check `ssh deploy@SERVER` works.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_ID" = "24.04" ] || echo "warning: written for Ubuntu 24.04, this is $PRETTY_NAME"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Europe/Istanbul

# deploy user with the same SSH key root was given by the provider
if ! id deploy > /dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG sudo deploy
fi
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [ -s /root/.ssh/authorized_keys ] && [ ! -s /home/deploy/.ssh/authorized_keys ]; then
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi
# sudo without a password only for this user (it has no password: key login only)
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-deploy
chmod 440 /etc/sudoers.d/90-deploy

# SSH: keys only, no root. Only when deploy really has a key, otherwise you would lock yourself out.
if [ -s /home/deploy/.ssh/authorized_keys ]; then
  cat > /etc/ssh/sshd_config.d/90-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  sshd -t && systemctl reload ssh
  echo "ssh: password and root login off"
else
  echo "ssh: /home/deploy/.ssh/authorized_keys is empty, password login left ON. Add your key and run this again." >&2
fi

# Firewall. Docker publishes ports past ufw, so compose.yml publishes nothing but Caddy's 80/443.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Docker Engine from download.docker.com (the Ubuntu docker.io package lags behind)
if ! command -v docker > /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker deploy

# 2 GB swap: room for the image builds and for a memory spike, so the OOM killer is the last resort
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf
  sysctl -p /etc/sysctl.d/90-swap.conf
fi

install -d -o deploy -g deploy /srv/src /srv/backups
echo "ready: log in as deploy (new terminal) before closing this session"
