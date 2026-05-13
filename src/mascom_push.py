#!/usr/bin/env python3
"""
MASCOM Hydra Control Plane: Local Mac → D1 Sync Bridge

Syncs gene.json files from ~/mascom/sites/<domain>/ to the D1 hydra_db.

Usage:
    python3 mascom_push.py push-all                    # Sync all domains
    python3 mascom_push.py push <domain>               # Sync specific domain
    python3 mascom_push.py status                      # Check registry status
    python3 mascom_push.py rollback <domain> <version> # Restore previous gene
"""

import json
import os
import sys
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
import urllib.request
import urllib.error

# Configuration
SITES_ROOT = Path.home() / "mascom" / "sites"
HYDRA_ENDPOINT = os.getenv("HYDRA_ENDPOINT", "http://localhost:3000/hydra/registry-update")
MASCOM_SECRET = os.getenv("MASCOM_SECRET", "")


def calculate_checksum(data: str) -> str:
    """Calculate SHA256 checksum of gene blob."""
    return hashlib.sha256(data.encode()).hexdigest()


def load_gene(domain: str) -> Optional[Dict[str, Any]]:
    """Load gene.json from ~/mascom/sites/<domain>/data.json"""
    gene_path = SITES_ROOT / domain / "data.json"

    if not gene_path.exists():
        print(f"❌ Gene not found: {gene_path}")
        return None

    try:
        with open(gene_path, "r") as f:
            gene = json.load(f)
        print(f"✓ Loaded gene: {domain} ({len(json.dumps(gene))} bytes)")
        return gene
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error in {gene_path}: {e}")
        return None
    except Exception as e:
        print(f"❌ Error loading {gene_path}: {e}")
        return None


def push_gene_to_d1(domain: str, gene: Dict[str, Any], status: str = "active") -> bool:
    """
    Push gene to D1 via /hydra/registry-update endpoint.

    This endpoint handles:
    - INSERT or UPDATE in site_registry
    - Automatic version increment
    - History preservation
    - Checksum calculation
    """
    if not MASCOM_SECRET:
        print("❌ MASCOM_SECRET not set. Set via: export MASCOM_SECRET=<secret>")
        return False

    gene_blob = json.dumps(gene)
    checksum = calculate_checksum(gene_blob)

    payload = {
        "domain": domain,
        "gene_blob": gene,  # Worker will store as JSON
        "status": status,
        "checksum": checksum,
    }

    try:
        req = urllib.request.Request(
            HYDRA_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-MASCOM-SECRET": MASCOM_SECRET,
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
            if result.get("success"):
                print(f"✓ Pushed {domain} v{result.get('version', 1)} (checksum: {checksum[:8]}...)")
                return True
            else:
                print(f"❌ Push failed: {result.get('error')}")
                return False

    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code}: {e.reason}")
        if e.code == 403:
            print("   (Check MASCOM_SECRET)")
        return False
    except Exception as e:
        print(f"❌ Push error: {e}")
        return False


def discover_domains() -> list[str]:
    """Find all domains by scanning ~/mascom/sites/"""
    domains = []
    if not SITES_ROOT.exists():
        print(f"❌ Sites root not found: {SITES_ROOT}")
        return domains

    for item in SITES_ROOT.iterdir():
        if item.is_dir() and (item / "data.json").exists():
            domains.append(item.name)

    return sorted(domains)


def push_all():
    """Sync all domains to D1."""
    domains = discover_domains()

    if not domains:
        print(f"❌ No domains found in {SITES_ROOT}")
        return

    print(f"Found {len(domains)} domain(s):")
    for domain in domains:
        print(f"  - {domain}")

    print("\n" + "=" * 60)
    success = 0
    failed = 0

    for domain in domains:
        gene = load_gene(domain)
        if gene and push_gene_to_d1(domain, gene):
            success += 1
        else:
            failed += 1

    print("=" * 60)
    print(f"\n✓ Pushed {success}/{len(domains)}")
    if failed:
        print(f"❌ Failed: {failed}")
        sys.exit(1)


def push_single(domain: str):
    """Sync specific domain to D1."""
    gene = load_gene(domain)
    if gene:
        if push_gene_to_d1(domain, gene):
            sys.exit(0)
    sys.exit(1)


def status():
    """Query D1 registry status (requires /api/status endpoint on Worker)."""
    print(
        "Registry status endpoint not yet implemented."
        "\nFor now, query D1 directly via Wrangler CLI:"
    )
    print("\n  wrangler d1 execute hydra_db --command 'SELECT domain, version, last_updated FROM site_registry'")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "push-all":
        push_all()
    elif command == "push" and len(sys.argv) > 2:
        push_single(sys.argv[2])
    elif command == "status":
        status()
    elif command == "rollback" and len(sys.argv) > 3:
        print(f"Rollback not yet implemented (would revert {sys.argv[2]} to v{sys.argv[3]})")
        sys.exit(1)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
