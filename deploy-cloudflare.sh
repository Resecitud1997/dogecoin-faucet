#!/bin/bash

# Dogecoin Faucet - Cloudflare Deployment Script
# Este script despliega el proyecto en Cloudflare Pages y Workers

set -e

echo "🐕 Dogecoin Faucet - Cloudflare Deployment"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: Wrangler CLI not found${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Login to Cloudflare (if not already logged in)
echo -e "${BLUE}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo "Please login to Cloudflare:"
    wrangler login
fi

# Deploy Frontend to Cloudflare Pages
echo -e "${BLUE}Building frontend...${NC}"
cd frontend
npm install
npm run build

echo -e "${BLUE}Deploying frontend to Cloudflare Pages...${NC}"
wrangler pages deploy build --project-name=dogecoin-faucet-frontend

cd ..

# Deploy Backend as Cloudflare Worker
echo -e "${BLUE}Deploying backend to Cloudflare Workers...${NC}"

# Create wrangler.toml if it doesn't exist
if [ ! -f "backend/wrangler.toml" ]; then
    echo -e "${BLUE}Creating wrangler.toml...${NC}"
    cat > backend/wrangler.toml << EOF
name = "dogecoin-faucet-api"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[env.production]
workers_dev = false
route = "api.tu-dominio.com/*"

[[env.production.kv_namespaces]]
binding = "FAUCET_DB"
id = "tu_kv_namespace_id"

[vars]
ENVIRONMENT = "production"
EOF
fi

cd backend

# Create Worker entry point
echo -e "${BLUE}Creating Worker entry point...${NC}"
cat > src/worker.js << 'EOF'
// Cloudflare Worker entry point
import { Router } from 'itty-router';

const router = Router();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
router.options('*', () => new Response(null, { headers: corsHeaders }));

// Health check
router.get('/health', () => {
  return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});

// Auth endpoint
router.post('/api/auth/connect', async (request, env) => {
  try {
    const { walletAddress } = await request.json();
    
    // Validate Dogecoin address
    const regex = /^D[A-Za-z0-9]{33}$/;
    if (!regex.test(walletAddress)) {
      return new Response(JSON.stringify({ error: 'Invalid Dogecoin address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Store in KV
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      walletAddress,
      balance: 0,
      totalEarned: 0,
      createdAt: new Date().toISOString()
    };

    await env.FAUCET_DB.put(`user:${walletAddress}`, JSON.stringify(user));

    return new Response(JSON.stringify({ success: true, user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Catch all
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
EOF

echo -e "${BLUE}Installing dependencies...${NC}"
npm install

echo -e "${BLUE}Deploying to Cloudflare Workers...${NC}"
wrangler deploy

cd ..

# Create D1 Database (Cloudflare's SQL database)
echo -e "${BLUE}Setting up D1 Database...${NC}"
echo "Run manually: wrangler d1 create dogecoin-faucet-db"
echo "Then add to wrangler.toml:"
echo "[[d1_databases]]"
echo "binding = \"DB\""
echo "database_name = \"dogecoin-faucet-db\""
echo "database_id = \"your-database-id\""

# Setup environment variables
echo -e "${BLUE}Don't forget to set environment variables in Cloudflare Dashboard:${NC}"
echo "- JWT_SECRET"
echo "- DOGE_RPC_USER"
echo "- DOGE_RPC_PASSWORD"
echo "- RECAPTCHA_SECRET_KEY"

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Frontend URL: https://dogecoin-faucet-frontend.pages.dev"
echo "API URL: https://api.tu-dominio.com"
echo ""
echo "Next steps:"
echo "1. Configure your custom domain in Cloudflare Dashboard"
echo "2. Set environment variables in Workers settings"
echo "3. Update CORS_ORIGIN in environment variables"
echo "4. Test the application"
echo ""
echo "🐕 To the moon! 🚀"
