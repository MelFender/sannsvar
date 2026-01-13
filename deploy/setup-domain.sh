#!/bin/bash
# Setup custom domain with automatic SSL using Caddy
# Run after setup-oracle.sh

set -e

DOMAIN=${1:-""}

if [ -z "$DOMAIN" ]; then
    echo "Usage: ./setup-domain.sh YOUR_DOMAIN.com"
    echo "Example: ./setup-domain.sh ultrathink.com"
    exit 1
fi

echo "=== Setting up domain: $DOMAIN ==="
echo ""

# Install Caddy
echo "Installing Caddy web server..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Create Caddyfile with actual domain
echo "Configuring Caddy for $DOMAIN..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$DOMAIN {
    reverse_proxy localhost:7001
    encode gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}

www.$DOMAIN {
    redir https://$DOMAIN{uri} permanent
}
EOF

# Create log directory
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Restart Caddy to apply config
echo "Starting Caddy..."
sudo systemctl restart caddy
sudo systemctl enable caddy

echo ""
echo "=== Domain Setup Complete ==="
echo ""
echo "DNS Configuration Required:"
echo "  Add these DNS records at your domain registrar:"
echo ""
echo "  Type: A"
echo "  Name: @"
echo "  Value: $(curl -s ifconfig.me)"
echo ""
echo "  Type: A"
echo "  Name: www"
echo "  Value: $(curl -s ifconfig.me)"
echo ""
echo "After DNS propagates (5-30 mins), your addon will be at:"
echo "  https://$DOMAIN/manifest.json"
echo ""
echo "Caddy will automatically obtain SSL certificate from Let's Encrypt."
echo ""
