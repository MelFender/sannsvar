#!/bin/bash
# Oracle Cloud Always Free - Sannsvar Deployment Setup
# Run this on a fresh Oracle Cloud Ubuntu instance

set -e

echo "=== Sannsvar Deployment Setup ==="
echo ""

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools for native modules (better-sqlite3)
echo "Installing build tools..."
sudo apt install -y build-essential python3

# Verify installations
echo ""
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Clone or copy project (assuming it's already uploaded)
cd /home/ubuntu

if [ -d "sannsvar" ]; then
    echo "Project directory exists, updating..."
    cd sannsvar
    git pull 2>/dev/null || echo "Not a git repo, skipping pull"
else
    echo "Clone your repo or upload the project to /home/ubuntu/sannsvar"
    exit 1
fi

# Install dependencies
echo "Installing npm dependencies..."
npm ci --omit=dev || npm install --omit=dev

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Copy systemd service
echo "Installing systemd service..."
sudo cp deploy/sannsvar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sannsvar

# Create .env from example if not exists
if [ ! -f ".env" ]; then
    echo ""
    echo "IMPORTANT: Create .env file with your credentials:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    echo ""
fi

# Open firewall ports
echo "Configuring firewall..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 7001 -j ACCEPT

# Save iptables rules
sudo apt install -y iptables-persistent
sudo netfilter-persistent save

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys"
echo "2. Start the service: sudo systemctl start sannsvar"
echo "3. Check status: sudo systemctl status sannsvar"
echo "4. View logs: journalctl -u sannsvar -f"
echo ""
echo "The addon will be available at:"
echo "  http://YOUR_SERVER_IP:7001/manifest.json"
echo ""
