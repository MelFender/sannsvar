# Sannsvar AI - Oracle Cloud Deployment Guide

Deploy your Stremio addon to Oracle Cloud's **Always Free** tier. No credit card charges, ever.

## What You Get (Free Forever)

- 4 ARM CPU cores (Ampere A1)
- 24 GB RAM
- 200 GB block storage
- 10 TB/month outbound data
- Custom domain with automatic SSL

---

## Step 1: Create Oracle Cloud Account

1. Go to [cloud.oracle.com](https://cloud.oracle.com)
2. Click "Sign Up" for a free tier account
3. Complete verification (credit card required but won't be charged)
4. Select your home region (choose closest to you)

**Important:** Select "Always Free" resources only during setup.

---

## Step 2: Create a Free VM Instance

1. Go to **Compute > Instances > Create Instance**

2. Configure:
   - **Name:** `sannsvar-addon`
   - **Image:** Ubuntu 22.04 (or latest)
   - **Shape:** Click "Change Shape"
     - Select **Ampere** (ARM)
     - Select **VM.Standard.A1.Flex**
     - Set **1 OCPU** and **6 GB RAM** (or up to 4 OCPU/24GB)
   - **Networking:** Create new VCN or use default
   - **Add SSH keys:** Paste your public key (`~/.ssh/id_rsa.pub`)

3. Click **Create** and wait for instance to start

4. Note the **Public IP Address** (you'll need this)

---

## Step 3: Configure Security List (Firewall)

1. Go to **Networking > Virtual Cloud Networks**
2. Click your VCN > Click the Subnet > Click the Security List
3. Add **Ingress Rules**:

| Source CIDR | Protocol | Port | Description |
|-------------|----------|------|-------------|
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |
| 0.0.0.0/0 | TCP | 7001 | Sannsvar (optional) |

---

## Step 4: Connect and Deploy

SSH into your instance:

```bash
ssh ubuntu@YOUR_PUBLIC_IP
```

Upload your project (from your local machine):

```bash
# Option A: Using SCP
scp -r ~/Desktop/sannsvar ubuntu@YOUR_PUBLIC_IP:~/

# Option B: Clone from Git (if you've pushed to GitHub)
git clone https://github.com/yourusername/sannsvar.git
```

Run the setup script:

```bash
cd sannsvar
chmod +x deploy/setup-oracle.sh
./deploy/setup-oracle.sh
```

---

## Step 5: Configure Environment

Create your production `.env`:

```bash
cp .env.example .env
nano .env
```

Fill in your actual API keys from your local `.env` file.

---

## Step 6: Start the Addon

```bash
sudo systemctl start sannsvar
sudo systemctl status sannsvar
```

Test it's working:

```bash
curl http://localhost:7001/manifest.json
```

Your addon is now running at:
```
http://YOUR_PUBLIC_IP:7001/manifest.json
```

---

## Step 7: Setup Custom Domain (Optional)

If you have a domain like `sannsvar.com`:

1. Run the domain setup script:

```bash
chmod +x deploy/setup-domain.sh
./deploy/setup-domain.sh sannsvar.com
```

2. Add DNS records at your domain registrar:

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_PUBLIC_IP |
| A | www | YOUR_PUBLIC_IP |

3. Wait 5-30 minutes for DNS propagation

4. Your addon is now at:
```
https://sannsvar.com/manifest.json
```

Caddy automatically obtains and renews SSL certificates from Let's Encrypt.

---

## Useful Commands

```bash
# View logs
journalctl -u sannsvar -f

# Restart addon
sudo systemctl restart sannsvar

# Stop addon
sudo systemctl stop sannsvar

# Update code and restart
cd ~/sannsvar
git pull
npm ci --omit=dev
npm run build
sudo systemctl restart sannsvar

# Check Caddy status (if using custom domain)
sudo systemctl status caddy
```

---

## Installing in Stremio

Once deployed, install in Stremio:

1. Open Stremio app
2. Go to **Settings > Addons**
3. Enter your addon URL:
   - Without domain: `http://YOUR_IP:7001/manifest.json`
   - With domain: `https://sannsvar.com/manifest.json`
4. Click **Install**

Your AI-powered recommendations will appear in the **Discover** section.

---

## Troubleshooting

**Port not accessible:**
```bash
sudo iptables -L -n  # Check iptables rules
# Also verify Oracle Security List allows the port
```

**App won't start:**
```bash
journalctl -u sannsvar --no-pager -n 50  # Check logs
cat .env  # Verify environment file exists
node dist/index.js  # Try running manually to see errors
```

**SSL not working:**
```bash
sudo systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile
# Ensure DNS is pointing to your IP: dig +short yourdomain.com
```
