#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# OCI first-time server setup script
# Supports: Oracle Linux 9 (default), Ubuntu 22/24
#
# Run this ONCE on the OCI VM after creating it:
#   scp scripts/oci-setup.sh opc@<your-oci-ip>:~/     # Oracle Linux default user: opc
#   ssh opc@<your-oci-ip> "bash ~/oci-setup.sh"
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  lang-mirror OCI setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Detect OS ────────────────────────────────────────────────────────────────
if [ -f /etc/oracle-release ]; then
  OS="oracle"
  PKG="dnf"
  echo "→ Detected: Oracle Linux"
elif [ -f /etc/lsb-release ] && grep -q Ubuntu /etc/lsb-release; then
  OS="ubuntu"
  PKG="apt-get"
  echo "→ Detected: Ubuntu"
else
  OS="rhel"
  PKG="dnf"
  echo "→ Detected: RHEL-compatible"
fi

# ── 1. System update ─────────────────────────────────────────────────────────
echo "→ Updating system packages..."
if [ "$PKG" = "dnf" ]; then
  sudo dnf update -y -q
  sudo dnf install -y -q curl unzip git sqlite rsync tar
else
  sudo apt-get update -qq
  sudo apt-get upgrade -y -qq
  sudo apt-get install -y -qq curl unzip git sqlite3 rsync \
    debian-keyring debian-archive-keyring apt-transport-https
fi
echo "✓ System updated"

# ── 2. Install Bun ───────────────────────────────────────────────────────────
echo "→ Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
bun --version
echo "✓ Bun installed"

# ── 3. Install Caddy ─────────────────────────────────────────────────────────
echo "→ Installing Caddy..."
if [ "$PKG" = "dnf" ]; then
  # Oracle Linux / RHEL: install via COPR
  sudo dnf install -y -q 'dnf-command(copr)'
  sudo dnf copr enable -y @caddy/caddy
  sudo dnf install -y -q caddy
else
  # Ubuntu
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
fi
echo "✓ Caddy installed"

# ── 4. Open OS firewall ports ─────────────────────────────────────────────────
echo "→ Opening firewall ports 80 and 443..."
if [ "$PKG" = "dnf" ]; then
  # Oracle Linux uses firewalld
  sudo systemctl enable --now firewalld
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
else
  # Ubuntu uses iptables
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo apt-get install -y -qq iptables-persistent
  sudo netfilter-persistent save
fi
echo "✓ Firewall configured (remember to also open ports in OCI Security List)"

# ── 5. Create app directory ───────────────────────────────────────────────────
echo "→ Creating app directory..."
mkdir -p ~/lang-mirror
echo "✓ ~/lang-mirror ready"

# ── 6. Create systemd service ─────────────────────────────────────────────────
echo "→ Creating systemd service..."
sudo tee /etc/systemd/system/lang-mirror.service > /dev/null << EOF
[Unit]
Description=lang-mirror TTS Practice App
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/lang-mirror
ExecStart=/home/$USER/.bun/bin/bun src/server/index.ts
Restart=on-failure
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=7842

StandardOutput=journal
StandardError=journal
SyslogIdentifier=lang-mirror

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable lang-mirror
echo "✓ systemd service created (not started yet — needs files first)"

# ── 7. Grant sudo restart without password ────────────────────────────────────
echo "→ Allowing passwordless service restart for CI/CD..."
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl restart lang-mirror, /bin/systemctl is-active lang-mirror, /bin/journalctl -u lang-mirror *" \
  | sudo tee /etc/sudoers.d/lang-mirror > /dev/null
sudo chmod 440 /etc/sudoers.d/lang-mirror
echo "✓ Sudo rules set"

# ── 8. Create deploy SSH key pair ─────────────────────────────────────────────
echo "→ Creating deploy SSH key pair..."
if [ ! -f ~/.ssh/deploy_key ]; then
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
  cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  echo "✓ Deploy key created"
else
  echo "✓ Deploy key already exists"
fi

# ── 9. Caddyfile ──────────────────────────────────────────────────────────────
echo "→ Writing Caddyfile..."
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "YOUR_IP")
sudo tee /etc/caddy/Caddyfile > /dev/null << EOF
# Replace :80 with yourdomain.com for automatic HTTPS via Let's Encrypt
:80 {
    reverse_proxy localhost:7842
}

# Uncomment and replace with your domain when ready:
# yourdomain.com {
#     reverse_proxy localhost:7842
# }
EOF
sudo systemctl enable caddy
sudo systemctl restart caddy
echo "✓ Caddy configured"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Add these 3 secrets to your GitHub repo:"
echo "  (Settings → Secrets → Actions → New secret)"
echo ""
echo "  OCI_HOST  =  $PUBLIC_IP"
echo "  OCI_USER  =  $USER"
echo "  OCI_SSH_PRIVATE_KEY  =  (see below)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PRIVATE KEY — copy everything below:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat ~/.ssh/deploy_key
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  After first deploy, run:"
echo "  sqlite3 ~/.lang-mirror/db.sqlite \\"
echo "    \"UPDATE settings SET value='false' WHERE key='app.browserOpen';\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
