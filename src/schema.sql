-- Hydra D1 Schema (Pure): Nervous System for MASCOM Edge Projection
-- Single source of truth: D1 contains both metadata and gene payloads (JSON)

-- Primary site registry table
-- Stores domain → gene_blob (JSON) with atomic versioning
-- No external dependencies (D1-only design)
CREATE TABLE IF NOT EXISTS site_registry (
  domain TEXT PRIMARY KEY,
  gene_blob JSON NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'staging', 'disabled', 'archived')),
  version INTEGER DEFAULT 1,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT,
  metadata JSON DEFAULT '{}'
);

-- Gene history for rollback support
-- Maintains immutable audit trail of previous genes per domain
CREATE TABLE IF NOT EXISTS gene_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  gene_blob JSON NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  checksum TEXT,
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain) REFERENCES site_registry(domain) ON DELETE CASCADE
);

-- Routing rules: Custom ingress patterns for complex multi-domain logic
-- Example: catch *.subdomain.mascom-api.mobleysoft.com → specific gene variant
CREATE TABLE IF NOT EXISTS routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL UNIQUE,
  domain_target TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_target) REFERENCES site_registry(domain) ON DELETE CASCADE
);

-- Performance indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_site_registry_status ON site_registry(status);
CREATE INDEX IF NOT EXISTS idx_site_registry_domain_status ON site_registry(domain, status);
CREATE INDEX IF NOT EXISTS idx_gene_history_domain ON gene_history(domain);
CREATE INDEX IF NOT EXISTS idx_routing_rules_pattern ON routing_rules(pattern);
CREATE INDEX IF NOT EXISTS idx_routing_rules_enabled ON routing_rules(enabled);
