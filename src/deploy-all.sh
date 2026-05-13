#!/bin/bash
set -e

echo "🚀 Deploying Hydra System (D1 + getdomains + getventures)"
echo "=================================================="

# Step 1: Create or get hydra_db
echo "📦 Setting up D1 database..."

DB_ID=$(wrangler d1 list --format json 2>/dev/null | jq -r '.[] | select(.name == "hydra_db") | .uuid' 2>/dev/null || echo "")

if [ -z "$DB_ID" ]; then
  echo "Creating new D1 database: hydra_db"
  wrangler d1 create hydra_db --name hydra_db
  DB_ID=$(wrangler d1 list --format json | jq -r '.[] | select(.name == "hydra_db") | .uuid')
  echo "Created with ID: $DB_ID"
  
  echo "Initializing schema..."
  wrangler d1 execute hydra_db --file ./schema.sql
else
  echo "✓ Found existing D1: $DB_ID"
fi

echo ""
echo "📝 Updating worker configs with database_id: $DB_ID"

# Update all wrangler.toml files with the database_id
for toml_file in wrangler.toml getdomains-wrangler.toml getventures-wrangler.toml; do
  if [ -f "$toml_file" ]; then
    sed -i '' "s/database_id = \"\"/database_id = \"$DB_ID\"/g" "$toml_file"
    echo "  ✓ Updated $toml_file"
  fi
done

echo ""
echo "🌐 Deploying mascom-hydra (main orchestrator)..."
wrangler deploy --config wrangler.toml --env production

echo ""
echo "📋 Deploying getdomains.johnmobley99.workers.dev..."
wrangler deploy --config getdomains-wrangler.toml --env production

echo ""
echo "🏢 Deploying getventures.johnmobley.workers.dev..."
wrangler deploy --config getventures-wrangler.toml --env production

echo ""
echo "=================================================="
echo "✅ Deployment complete!"
echo ""
echo "API Endpoints:"
echo "  • https://mascom-hydra.johnmobley.workers.dev/"
echo "  • https://getdomains.johnmobley99.workers.dev/"
echo "  • https://getventures.johnmobley.workers.dev/"
echo ""
echo "Next: python3 mascom_push.py push-all"
