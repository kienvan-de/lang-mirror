#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# OCI first-time server setup script
# Run this ONCE on the OCI VM after creating it:
#   scp scripts/oci-setup.sh ubuntu@<your-oci-ip>:~/
#   ssh ubuntu@<your-oci-ip> "bash ~/oci-setup.sh"
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  lang-mirror OCI setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System update ─────────────────────────────────────────────────────────
echo "→ Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
  curl unzip git sqlite3 rsync \
  debian-keyring debian-archive-keyring apt-transport-https

# ── 2. Install Bun ───────────────────────────────────────────────────────────
echo "→ Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
bun --version
echo "✓ Bun installed"

# ── 3. Install Caddy ─────────────────────────────────────────────────────────
echo "→ Installing Caddy..."
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update -qq
sudo apt-get install -y -qq caddy
echo "✓ Caddy installed"

# ── 4. Open OS firewall ports ────────────────────────────────────────────────
echo "→ Opening firewall ports 80 and 443..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y -qq iptables-persistent
sudo netfilter-persistent save
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

# Prevent browser-open on server (override DB setting via env is not supported,
# so we handle it by the DB update below after first run)

StandardOutput=journal
StandardError=journal
SyslogIdentifier=lang-mirror

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
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
  ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
  cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
  echo "✓ Deploy key created"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  COPY THIS PRIVATE KEY TO GITHUB SECRETS"
  echo "  Secret name: OCI_SSH_PRIVATE_KEY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat ~/.ssh/deploy_key
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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
sudo systemctl restart caddy
sudo systemctl enable caddy
echo "✓ Caddy configured"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Add these secrets to your GitHub repo:"
echo "     OCI_SSH_PRIVATE_KEY  → contents of ~/.ssh/deploy_key (shown above)"
echo "     OCI_HOST             → $PUBLIC_IP"
echo "     OCI_USER             → $USER"
echo ""
echo "  2. Push to main branch to trigger first deploy"
echo ""
echo "  3. After first deploy, disable browser-open:"
echo "     sqlite3 ~/.lang-mirror/db.sqlite \\"
echo "       \"UPDATE settings SET value='false' WHERE key='app.browserOpen';\""
echo ""
echo "  4. (Optional) For HTTPS, edit /etc/caddy/Caddyfile"
echo "     and replace :80 with your domain name"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
