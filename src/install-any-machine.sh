#!/bin/bash

################################################################################
# MASCOM Hydra One-Command Installation & Setup
#
# Unified installation script for any deployment target:
# - Local development (macOS/Linux)
# - Staging environment
# - Production CloudFlare edge
# - Hybrid (local + CF sync)
#
# Usage:
#   ./install-any-machine.sh [local|cf|hybrid]
#
# Environment variables:
#   MODE              - Installation mode (default: hybrid)
#   HYDRA_SECRET      - Secret key for API authentication
#   CF_ACCOUNT_ID     - Cloudflare account ID
#   CF_D1_TOKEN       - Cloudflare D1 API token
#   HYDRA_PORT        - Local server port (default: 3000)
#
################################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MODE="${1:-hybrid}"
HYDRA_PORT="${HYDRA_PORT:-3000}"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        MASCOM HYDRA ONE-COMMAND INSTALLATION                 ║"
echo "║              Mode: ${MODE}                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

################################################################################
# Common setup
################################################################################

setup_common() {
  log_info "Common setup..."

  # Check Node.js and npm
  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Install from https://nodejs.org"
    exit 1
  fi

  log_success "Node.js $(node -v)"
  log_success "npm $(npm -v)"

  # Install dependencies
  log_info "Installing npm dependencies..."
  cd "$SCRIPT_DIR"
  npm install --save express better-sqlite3 2>/dev/null || {
    log_warn "npm install encountered an issue (continuing)"
  }

  # Create directories
  mkdir -p exports
  mkdir -p logs

  log_success "Common setup complete"
}

################################################################################
# LOCAL MODE: SQLite only, no CF dependency
################################################################################

setup_local() {
  log_info "Setting up LOCAL mode (SQLite only)..."

  # Create database schema
  if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 CLI not found"
    exit 1
  fi

  DB_PATH="${HOME}/mascom/hydra-local.db"
  log_info "Creating database at ${DB_PATH}..."

  sqlite3 "$DB_PATH" < "$SCRIPT_DIR/schema.sql" || {
    log_warn "Database may already exist (continuing)"
  }

  log_success "Local database initialized"

  # Create local runtime wrapper
  cat > "$SCRIPT_DIR/local-runtime.js" << 'EOF'
#!/usr/bin/env node
/**
 * Local Hydra Runtime - Pure SQLite backed server
 * Routes requests to local database only (no CF dependency)
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new Database(path.join(process.env.HOME, 'mascom', 'hydra-local.db'));
const PORT = process.env.HYDRA_PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'local', port: PORT });
});

// Get domain
app.get('/api/getventures/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const row = db.prepare(
      'SELECT domain, gene_blob, status, version FROM site_registry WHERE domain = ?'
    ).get(domain);

    if (!row) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({
      success: true,
      domain: row.domain,
      gene: JSON.parse(row.gene_blob),
      status: row.status,
      version: row.version,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List domains
app.get('/api/getdomains', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT domain, status, version FROM site_registry WHERE status = ?'
    ).all('active');

    res.json({
      success: true,
      count: rows.length,
      domains: rows.map(r => ({ domain: r.domain, status: r.status, version: r.version })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update registry (with secret check)
app.post('/hydra/registry-update', (req, res) => {
  try {
    const secret = req.headers['x-mascom-secret'];
    const expected = process.env.MASCOM_SECRET || 'development';

    if (secret !== expected) {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    const { domain, gene_blob, status = 'active' } = req.body;

    if (!domain || !gene_blob) {
      return res.status(400).json({ error: 'Missing domain or gene_blob' });
    }

    const version = (db.prepare(
      'SELECT COALESCE(MAX(version), 0) as v FROM site_registry WHERE domain = ?'
    ).get(domain).v || 0) + 1;

    const geneStr = JSON.stringify(gene_blob);
    const checksum = require('crypto')
      .createHash('sha256')
      .update(geneStr)
      .digest('hex');

    db.prepare(`
      INSERT INTO site_registry (domain, gene_blob, status, version, checksum)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        gene_blob = excluded.gene_blob,
        status = excluded.status,
        version = version + 1,
        checksum = excluded.checksum,
        last_updated = CURRENT_TIMESTAMP
    `).run(domain, geneStr, status, version, checksum);

    res.json({
      success: true,
      domain,
      version,
      checksum: checksum.substring(0, 8) + '...',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nMASCOM Hydra Local Runtime`);
  console.log(`Mode: local (SQLite backed)`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.HOME}/mascom/hydra-local.db\n`);
});
EOF

  chmod +x "$SCRIPT_DIR/local-runtime.js"

  # Start server
  log_info "Starting local server on port ${HYDRA_PORT}..."
  node "$SCRIPT_DIR/local-runtime.js" &
  PID=$!
  echo "$PID" > "$SCRIPT_DIR/.local-server.pid"

  sleep 2

  # Test connectivity
  if curl -s "http://localhost:${HYDRA_PORT}/health" > /dev/null; then
    log_success "Local server running (PID: $PID)"
    echo ""
    echo "Local mode ready!"
    echo "  API: http://localhost:${HYDRA_PORT}"
    echo "  DB: ${DB_PATH}"
    echo "  Stop: kill $PID"
  else
    log_error "Failed to start local server"
    exit 1
  fi
}

################################################################################
# CF MODE: Deploy to CloudFlare edge
################################################################################

setup_cf() {
  log_info "Setting up CF mode (CloudFlare Workers)..."

  # Check for wrangler
  if ! command -v wrangler &> /dev/null; then
    log_error "wrangler not found. Install with: npm install -g wrangler"
    exit 1
  fi

  log_success "wrangler $(wrangler --version)"

  # Check for credentials
  if [ -z "$CF_ACCOUNT_ID" ]; then
    log_error "CF_ACCOUNT_ID not set"
    exit 1
  fi

  if [ -z "$CF_D1_TOKEN" ]; then
    log_warn "CF_D1_TOKEN not set - continuing without automatic secrets"
  fi

  # Deploy workers
  log_info "Deploying mascom-hydra worker..."
  cd "$SCRIPT_DIR"
  wrangler deploy --name mascom-hydra 2>&1 | head -20

  log_info "Deploying getdomains worker..."
  wrangler deploy --name getdomains --env getdomains 2>&1 | head -20

  log_info "Deploying getventures worker..."
  wrangler deploy --name getventures --env getventures 2>&1 | head -20

  log_success "CF deployment complete"
  echo ""
  echo "CloudFlare workers deployed!"
  echo "  mascom-hydra: https://*.mobleysoft.com/*"
  echo "  getdomains: https://getdomains.johnmobley99.workers.dev"
  echo "  getventures: https://getventures.johnmobley99.workers.dev"
}

################################################################################
# HYBRID MODE: Local + CF sync
################################################################################

setup_hybrid() {
  log_info "Setting up HYBRID mode (local + CF sync)..."

  # Setup local
  setup_local

  # Setup CF if credentials available
  if [ -n "$CF_ACCOUNT_ID" ] && [ -n "$CF_D1_TOKEN" ]; then
    setup_cf
  else
    log_warn "Skipping CF setup (set CF_ACCOUNT_ID and CF_D1_TOKEN to enable)"
  fi

  # Create sync supervisor
  log_info "Setting up bidirectional sync..."

  cat > "$SCRIPT_DIR/sync-supervisor.js" << 'EOF'
#!/usr/bin/env node
/**
 * Sync Supervisor - Manages continuous local ↔ CF sync
 * Runs sync cycle every 5 minutes (configurable)
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '300'); // 5 minutes

console.log(`\nMASCOM Hydra Sync Supervisor`);
console.log(`Sync interval: ${SYNC_INTERVAL}s`);
console.log(`Status: monitoring\n`);

setInterval(() => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running sync cycle...`);

  try {
    execSync(`node "${path.join(__dirname, 'migrate.js')}" sync-bidirectional`, {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`[${timestamp}] Sync failed: ${error.message}`);
  }
}, SYNC_INTERVAL * 1000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nSync supervisor stopped');
  process.exit(0);
});
EOF

  chmod +x "$SCRIPT_DIR/sync-supervisor.js"

  # Start sync supervisor in background
  log_info "Starting sync supervisor..."
  node "$SCRIPT_DIR/sync-supervisor.js" > "$SCRIPT_DIR/logs/sync.log" 2>&1 &
  SYNC_PID=$!
  echo "$SYNC_PID" > "$SCRIPT_DIR/.sync-supervisor.pid"

  log_success "Sync supervisor running (PID: $SYNC_PID)"

  echo ""
  echo "Hybrid mode ready!"
  echo "  Local API: http://localhost:${HYDRA_PORT}"
  echo "  CF edge: https://mascom-hydra.mobleysoft.com"
  echo "  Sync: Every 5 minutes"
  echo "  Logs: ${SCRIPT_DIR}/logs/sync.log"
}

################################################################################
# Main dispatch
################################################################################

case "$MODE" in
  local)
    setup_common
    setup_local
    ;;
  cf)
    setup_common
    setup_cf
    ;;
  hybrid)
    setup_common
    setup_hybrid
    ;;
  *)
    log_error "Unknown mode: $MODE"
    echo "Valid modes: local, cf, hybrid"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Installation complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Summary
log_info "Installation Summary"
echo "  Mode: $MODE"
echo "  Hydra directory: $SCRIPT_DIR"
echo "  Config: wrangler.toml"
echo "  Audit log: migration_audit.jsonl"
echo ""
echo "Next steps:"
case "$MODE" in
  local)
    echo "  1. Test: curl http://localhost:${HYDRA_PORT}/health"
    echo "  2. Export local: node migrate.js export-local"
    ;;
  cf)
    echo "  1. View logs: wrangler tail mascom-hydra"
    echo "  2. Deploy staging: wrangler deploy --env staging"
    ;;
  hybrid)
    echo "  1. Check sync: tail -f logs/sync.log"
    echo "  2. Validate: node migrate.js validate-consistency"
    echo "  3. Stop all: kill \$(cat .local-server.pid .sync-supervisor.pid)"
    ;;
esac
echo ""
