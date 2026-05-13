/**
 * HYDRA: nda-tracker-worker.js
 * NDA Change Tracker for AtomBeam Partnership
 * Serves interactive Schedule A trade secret change history
 * Route: partners.mobleysoft.com/abt/ndaChangeTracker.html
 */

// HTML payload for NDA Tracker UI
const NDA_TRACKER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NDA Change Tracker - AtomBeam Partnership</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            border-bottom: 2px solid #00d4ff;
            padding-bottom: 2rem;
            margin-bottom: 2rem;
        }
        h1 {
            font-size: 2.5rem;
            color: #00d4ff;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            color: #888;
            font-size: 0.95rem;
        }
        .amendments {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }
        .amendment-card {
            background: rgba(15, 15, 30, 0.6);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 12px;
            padding: 2rem;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        .amendment-card:hover {
            border-color: #00d4ff;
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.1);
        }
        .amendment-title {
            color: #00d4ff;
            font-weight: 600;
            font-size: 1.2rem;
            margin-bottom: 1rem;
        }
        .amendment-status {
            display: inline-block;
            padding: 0.4rem 0.8rem;
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid #00d4ff;
            border-radius: 4px;
            font-size: 0.85rem;
            color: #00d4ff;
            margin-bottom: 1rem;
        }
        .amendment-content {
            font-size: 0.95rem;
            line-height: 1.6;
            color: #ccc;
        }
        .amendment-content ul {
            margin-left: 1.5rem;
            margin-top: 0.5rem;
        }
        .amendment-content li {
            margin: 0.4rem 0;
        }
        .schedule-a {
            background: rgba(25, 25, 50, 0.8);
            border-left: 4px solid #00d4ff;
            padding: 2rem;
            margin-top: 3rem;
            border-radius: 8px;
        }
        .schedule-a h2 {
            color: #00d4ff;
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }
        .trade-secret {
            background: rgba(15, 15, 30, 0.5);
            padding: 1.5rem;
            margin: 1rem 0;
            border-radius: 6px;
            border-left: 3px solid #00d4ff;
        }
        .trade-secret-name {
            color: #00ff88;
            font-weight: 600;
            font-size: 1.05rem;
            margin-bottom: 0.5rem;
        }
        .trade-secret-desc {
            color: #aaa;
            font-size: 0.9rem;
        }
        .footer {
            text-align: center;
            color: #666;
            font-size: 0.85rem;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(0, 212, 255, 0.1);
        }
        .last-updated {
            color: #00d4ff;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🔐 NDA Change Tracker</h1>
            <p class="subtitle">AtomBeam Partnership — Schedule A Perpetual Trade Secrets</p>
            <p class="subtitle" style="margin-top: 0.5rem;">Source of Truth for IP Change History</p>
        </header>

        <section class="amendments">
            <div class="amendment-card">
                <div class="amendment-title">Amendment 1: IP Ownership Clarification</div>
                <div class="amendment-status">ACTIVE</div>
                <div class="amendment-content">
                    <p><strong>Purpose:</strong> Define derivative IP ownership between MobleyFunction formulations and AtomBeam applications.</p>
                    <ul>
                        <li>MobleyFunction (Gaussian residue) remains MobleyWorks perpetual trade secret</li>
                        <li>AtomBeam adaptations are joint derivatives (co-owned)</li>
                        <li>Source code access restricted to designated engineers only</li>
                    </ul>
                </div>
            </div>

            <div class="amendment-card">
                <div class="amendment-title">Amendment 2: Derivative Patent Carve-Out</div>
                <div class="amendment-status">ACTIVE</div>
                <div class="amendment-content">
                    <p><strong>Purpose:</strong> Ensure perpetual trade secret status survives patent filings.</p>
                    <ul>
                        <li>OAC Soft Light Machines architecture not patentable (trade secret)  </li>
                        <li>Patent claims limited to specific implementations, not underlying formulations</li>
                        <li>Preserves licensing flexibility for future use cases</li>
                    </ul>
                </div>
            </div>

            <div class="amendment-card">
                <div class="amendment-title">Amendment 3: Perpetual Secrets Preservation</div>
                <div class="amendment-status">ACTIVE</div>
                <div class="amendment-content">
                    <p><strong>Purpose:</strong> Lock in perpetual confidentiality across IP generations.</p>
                    <ul>
                        <li>KPZ Evolution (Planck-frame discretization) perpetual</li>
                        <li>Time Crystal embedding algorithms perpetual</li>
                        <li>Non-expiring confidentiality obligations on all parties</li>
                    </ul>
                </div>
            </div>

            <div class="amendment-card">
                <div class="amendment-title">Amendment 4: Clawback & License Termination</div>
                <div class="amendment-status">ACTIVE</div>
                <div class="amendment-content">
                    <p><strong>Purpose:</strong> Protect MobleyWorks if partnership dissolves.</p>
                    <ul>
                        <li>License grants terminate 30 days post-termination</li>
                        <li>Clawback of all source code and formulations to MobleyWorks</li>
                        <li>AtomBeam retains only licensed derivative outputs (non-modifiable)</li>
                    </ul>
                </div>
            </div>

            <div class="amendment-card">
                <div class="amendment-title">Amendment 5: Confidentiality Escalation</div>
                <div class="amendment-status">ACTIVE</div>
                <div class="amendment-content">
                    <p><strong>Purpose:</strong> Strengthen boundary enforcement for critical formulations.</p>
                    <ul>
                        <li>Xenophysics Mining (Pauli filtering thresholds) — highest confidentiality tier</li>
                        <li>Access limited to (1) John Mobley, (2) Nadine Chen, (3) designated PhDs only</li>
                        <li>Annual audit of access logs required</li>
                    </ul>
                </div>
            </div>
        </section>

        <section class="schedule-a">
            <h2>Schedule A: Perpetual Trade Secrets</h2>
            <p style="color: #999; margin-bottom: 1.5rem; font-size: 0.95rem;">These formulations and methodologies remain confidential indefinitely and are not subject to expiration.</p>

            <div class="trade-secret">
                <div class="trade-secret-name">🔮 MobleyFunction</div>
                <div class="trade-secret-desc">Gaussian residue formulation for neuromorphic computation. Core IP of MASCOM cognitive layer.</div>
            </div>

            <div class="trade-secret">
                <div class="trade-secret-name">⚙️ OAC Soft Light Machines</div>
                <div class="trade-secret-desc">Overlapping servlet architecture for distributed quantum computation. Proprietary to MobleyWorks.</div>
            </div>

            <div class="trade-secret">
                <div class="trade-secret-name">🌊 KPZ Evolution</div>
                <div class="trade-secret-desc">Planck-frame discretization for modeling complex system dynamics. Physics breakthrough formulation.</div>
            </div>

            <div class="trade-secret">
                <div class="trade-secret-name">⏰ Time Crystals</div>
                <div class="trade-secret-desc">Embedding algorithms for persistent state in quantum-classical hybrid systems.</div>
            </div>

            <div class="trade-secret">
                <div class="trade-secret-name">⛏️ Xenophysics Mining</div>
                <div class="trade-secret-desc">Pauli filtering thresholds and nonce validation protocols for blockchain mining optimization.</div>
            </div>
        </section>

        <footer class="footer">
            <p><span class="last-updated">Last Updated: May 11, 2026</span> — Source of Truth for NDA compliance</p>
            <p style="margin-top: 0.5rem;">Controlled access. Authorized parties only. All amendments perpetual unless superseded by written agreement.</p>
        </footer>
    </div>
</body>
</html>`;

/**
 * Main request handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route /abt/* to NDA tracker
    if (url.pathname === '/abt/' || url.pathname === '/abt/ndaChangeTracker.html') {
      return new Response(NDA_TRACKER_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN'
        }
      });
    }

    // Root redirect
    if (url.pathname === '/') {
      return Response.redirect(url.origin + '/abt/', 302);
    }

    // 404
    return new Response('Not Found', { status: 404 });
  }
};
