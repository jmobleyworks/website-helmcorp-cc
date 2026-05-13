#!/bin/bash
# ============================================================================
# Hydra Local Setup — Install dependencies and initialize
# ============================================================================

set -e

echo "🔧 Hydra Local Development Setup"
echo "=================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js ${NODE_VERSION}"

# Create package.json if needed
if [ ! -f "package.json" ]; then
    echo "📝 Creating package.json..."
    cat > package.json << 'EOF'
{
  "name": "mascom-hydra-local",
  "version": "1.0.0",
  "description": "Local development runtime for MASCOM Hydra edge system",
  "type": "module",
  "main": "local-runtime.js",
  "scripts": {
    "start": "node local-runtime.js",
    "dev": "NODE_ENV=development node local-runtime.js",
    "test": "node --test test/*.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "fetch": "^1.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create hydra-local.db if needed
if [ ! -f "hydra-local.db" ]; then
    echo "🗄️  Initializing database..."
    sqlite3 hydra-local.db < schema.sql

    # Insert sample data
    sqlite3 hydra-local.db << 'EOF'
INSERT OR IGNORE INTO site_registry (domain, gene_blob, status, checksum)
VALUES
  ('getventures.example.com', '{"site_name":"GetVentures","description":"Venture discovery platform","version":"1.0","species":"venture-scout"}', 'active', 'sample-1'),
  ('getdomains.example.com', '{"site_name":"GetDomains","description":"Domain management system","version":"1.0","species":"domain-registry"}', 'active', 'sample-2');
EOF
    echo "✓ Database initialized with sample data"
fi

# Set environment variables
export MASCOM_SECRET="${MASCOM_SECRET:-$(openssl rand -base64 32)}"
export PORT="${PORT:-3000}"

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the local server:"
echo "  npm start       # Production mode"
echo "  npm run dev     # Development mode"
echo ""
echo "Or directly:"
echo "  node local-runtime.js"
echo ""
echo "Environment variables:"
echo "  MASCOM_SECRET=${MASCOM_SECRET:0:20}..."
echo "  PORT=${PORT}"
echo ""
echo "Test endpoints:"
echo "  curl http://localhost:3000/health"
echo "  curl http://localhost:3000/api/ventures"
echo "  curl http://localhost:3000/api/domains"
echo ""
