/**
 * NDAI SingularityUI Portal — Topology-Based NDA Signature System
 * Route: ndai.mobleysoft.com/mhsabtlp
 *
 * Serves a single-file NDA portal with Klein bottle topology visualization
 * and cryptographic signature embedding.
 */

// HTML payload — single self-contained application
const SINGULARITYUI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NDA Portal — SingularityUI Topology Signature</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
        }

        .header {
            background: rgba(0, 0, 0, 0.5);
            padding: 2rem;
            border-bottom: 2px solid #00d4ff;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            color: #00d4ff;
            margin-bottom: 0.5rem;
            letter-spacing: 2px;
        }

        .header p {
            color: #888;
            font-size: 0.95rem;
        }

        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            padding: 2rem;
            max-width: 1600px;
            margin: 0 auto;
            width: 100%;
        }

        .panel {
            background: rgba(15, 15, 30, 0.7);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 12px;
            padding: 2rem;
            backdrop-filter: blur(10px);
        }

        .panel h2 {
            color: #00d4ff;
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        /* NDA Panel */
        .nda-input {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .nda-input textarea {
            width: 100%;
            height: 250px;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 8px;
            color: #e0e0e0;
            padding: 1rem;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            resize: vertical;
        }

        .nda-input textarea::placeholder {
            color: #666;
        }

        .nda-info {
            background: rgba(0, 212, 255, 0.05);
            border-left: 3px solid #00d4ff;
            padding: 1rem;
            border-radius: 4px;
            font-size: 0.9rem;
            color: #aaa;
        }

        /* Signature Panel */
        .signature-panel {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .signature-canvas-wrapper {
            background: rgba(0, 0, 0, 0.5);
            border: 2px dashed rgba(0, 212, 255, 0.3);
            border-radius: 8px;
            overflow: hidden;
            aspect-ratio: 3/1;
        }

        #signatureCanvas {
            display: block;
            width: 100%;
            height: 100%;
            cursor: crosshair;
            background: rgba(10, 10, 20, 0.8);
        }

        .signature-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        button {
            padding: 0.75rem 1.5rem;
            background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
            color: #000;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            font-size: 0.85rem;
            letter-spacing: 1px;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 212, 255, 0.3);
        }

        button:active {
            transform: translateY(0);
        }

        .btn-secondary {
            background: linear-gradient(135deg, #666 0%, #333 100%);
            color: #e0e0e0;
        }

        .signer-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .form-group label {
            color: #888;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .form-group input {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 4px;
            color: #e0e0e0;
            padding: 0.75rem;
            font-size: 0.9rem;
        }

        /* Visualization Panel */
        .visualization-panel {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }

        .klein-container {
            background: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 1/1;
            position: relative;
        }

        #kleinBottleCanvas {
            display: block;
            width: 100%;
            height: 100%;
        }

        .topology-legend {
            background: rgba(15, 15, 30, 0.7);
            border: 1px solid rgba(0, 212, 255, 0.2);
            border-radius: 12px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .topology-legend h3 {
            color: #00d4ff;
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
        }

        .legend-item {
            display: flex;
            gap: 1rem;
            align-items: flex-start;
            font-size: 0.9rem;
        }

        .legend-color {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            flex-shrink: 0;
            margin-top: 2px;
        }

        .topology-flow {
            background: rgba(0, 212, 255, 0.05);
            border-left: 3px solid #00d4ff;
            padding: 1.5rem;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .flow-step {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .flow-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: #00d4ff;
            color: #000;
            border-radius: 50%;
            font-weight: bold;
            flex-shrink: 0;
        }

        .flow-text {
            font-size: 0.9rem;
            line-height: 1.4;
        }

        .flow-text strong {
            color: #00ff88;
        }

        .flow-arrow {
            text-align: center;
            color: #00d4ff;
            font-size: 1.5rem;
        }

        /* Status */
        .status-bar {
            background: rgba(0, 0, 0, 0.5);
            border-top: 1px solid rgba(0, 212, 255, 0.2);
            padding: 1rem 2rem;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 2rem;
            text-align: center;
            font-size: 0.85rem;
        }

        .status-item {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .status-label {
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-value {
            color: #00d4ff;
            font-weight: bold;
            font-size: 1.1rem;
        }

        .status-value.signed {
            color: #00ff88;
        }

        /* Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: #1a1a2e;
            border: 2px solid #00d4ff;
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            text-align: center;
        }

        .modal-content h3 {
            color: #00ff88;
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }

        .modal-content p {
            color: #ccc;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }

        .modal-content .hash {
            background: rgba(0, 0, 0, 0.5);
            padding: 1rem;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 0.75rem;
            color: #00d4ff;
            word-break: break-all;
            margin-bottom: 1.5rem;
            max-height: 150px;
            overflow-y: auto;
        }

        .modal-content button {
            width: 100%;
        }

        @media (max-width: 1200px) {
            .container {
                grid-template-columns: 1fr;
            }
            .visualization-panel {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 600px) {
            .status-bar {
                grid-template-columns: 1fr;
                gap: 1rem;
            }
            .signer-info {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>◇ NDA TOPOLOGY SIGNATURE ◇</h1>
        <p>SingularityUI — Your Agreement Embedded in Our Topology</p>
    </div>

    <div class="container">
        <!-- NDA Input Panel -->
        <div class="panel">
            <h2>📄 Agreement Text</h2>
            <div class="nda-input">
                <textarea id="ndaText" placeholder="Paste NDA text here or type your agreement...">MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into as of the date of signature below.

1. CONFIDENTIAL INFORMATION
The parties acknowledge that each may disclose to the other certain proprietary and confidential information, including but not limited to technical data, trade secrets, business plans, and financial information.

2. OBLIGATIONS
Each party agrees to:
- Maintain strict confidentiality of all disclosed information
- Use the information solely for authorized purposes
- Protect the information with reasonable security measures
- Not disclose information to third parties without consent

3. TERM
This Agreement shall remain in effect for 3 years from the date of execution, unless extended or terminated by written agreement.

4. GOVERNING LAW
This Agreement shall be governed by applicable law.</textarea>
                <div class="nda-info">
                    💡 Your agreement text will be hashed and embedded in the Klein bottle topology. The signature creates an irreversible binding.
                </div>
            </div>
        </div>

        <!-- Signature Panel -->
        <div class="panel">
            <h2>✍️ Digital Signature</h2>
            <div class="signature-panel">
                <div>
                    <label style="color: #888; font-size: 0.85rem; display: block; margin-bottom: 0.5rem;">Sign below:</label>
                    <div class="signature-canvas-wrapper">
                        <canvas id="signatureCanvas"></canvas>
                    </div>
                </div>

                <div class="signature-controls">
                    <button class="btn-secondary" onclick="clearSignature()">Clear Signature</button>
                    <button onclick="signAgreement()">Sign & Embed</button>
                </div>

                <div class="signer-info">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="signerName" placeholder="Full Name">
                    </div>
                    <div class="form-group">
                        <label>Organization</label>
                        <input type="text" id="signerOrg" placeholder="Company/Organization">
                    </div>
                </div>
            </div>
        </div>

        <!-- Visualization & Topology -->
        <div class="visualization-panel">
            <div class="klein-container">
                <canvas id="kleinBottleCanvas"></canvas>
            </div>

            <div class="topology-legend">
                <h3>🧬 Topology Transformation</h3>

                <div class="legend-item">
                    <div class="legend-color" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);"></div>
                    <div>
                        <strong>Riemannian Manifold</strong><br>
                        Your incoming topology (client agreement data in native form)
                    </div>
                </div>

                <div class="legend-item">
                    <div class="legend-color" style="background: linear-gradient(135deg, #4ecdc4 0%, #44a5c2 100%);"></div>
                    <div>
                        <strong>Möbius Strip</strong><br>
                        Single-sided integration with our systems (irreversible binding)
                    </div>
                </div>

                <div class="legend-item">
                    <div class="legend-color" style="background: linear-gradient(135deg, #95e1d3 0%, #f38181 100%);"></div>
                    <div>
                        <strong>Klein Bottle</strong><br>
                        4D topological closure (permanent embedding in MASCOM)
                    </div>
                </div>

                <div style="border-top: 1px solid rgba(0, 212, 255, 0.2); padding-top: 1rem; margin-top: 1rem;">
                    <div class="topology-flow">
                        <div class="flow-step">
                            <div class="flow-number">1</div>
                            <div class="flow-text">Your agreement arrives as a <strong>Riemannian manifold</strong> (multi-dimensional data surface)</div>
                        </div>
                        <div class="flow-arrow">↓</div>
                        <div class="flow-step">
                            <div class="flow-number">2</div>
                            <div class="flow-text">We wrap it into a <strong>Möbius strip</strong> (single-sided, irreversible transformation)</div>
                        </div>
                        <div class="flow-arrow">↓</div>
                        <div class="flow-step">
                            <div class="flow-number">3</div>
                            <div class="flow-text">Complete closure in the <strong>Klein bottle</strong> (4D embedding, no boundary)</div>
                        </div>
                        <div class="flow-arrow">✓</div>
                        <div class="flow-step">
                            <div class="flow-number">✓</div>
                            <div class="flow-text">Signature embedded. Your terms become part of our <strong>sovereign topology</strong>.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <div class="status-item">
            <div class="status-label">Agreement Hash</div>
            <div class="status-value" id="statusHash">Pending...</div>
        </div>
        <div class="status-item">
            <div class="status-label">Signature Status</div>
            <div class="status-value" id="statusSign">Unsigned</div>
        </div>
        <div class="status-item">
            <div class="status-label">Timestamp</div>
            <div class="status-value" id="statusTime">—</div>
        </div>
        <div class="status-item">
            <div class="status-label">Embedding</div>
            <div class="status-value" id="statusEmbedding">Ready</div>
        </div>
    </div>

    <!-- Success Modal -->
    <div class="modal" id="successModal">
        <div class="modal-content">
            <h3>✓ SIGNATURE EMBEDDED</h3>
            <p>Your agreement has been topologically embedded in the Klein bottle and permanently bound to MASCOM.</p>
            <div class="hash" id="finalHash"></div>
            <p style="color: #888; font-size: 0.85rem;">This signature is immutable and cryptographically verified.</p>
            <button onclick="downloadSignature()">Download Certificate</button>
        </div>
    </div>

    <script>
        // ==================== SIGNATURE CANVAS ====================
        const canvas = document.getElementById('signatureCanvas');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;

        function resizeCanvas() {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        canvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            ctx.beginPath();
            ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        });

        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseleave', () => isDrawing = false);

        function clearSignature() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // ==================== KLEIN BOTTLE VISUALIZATION ====================
        const kleinCanvas = document.getElementById('kleinBottleCanvas');
        const kleinCtx = kleinCanvas.getContext('2d');

        function resizeKleinCanvas() {
            const rect = kleinCanvas.parentElement.getBoundingClientRect();
            kleinCanvas.width = rect.width;
            kleinCanvas.height = rect.height;
        }

        resizeKleinCanvas();
        window.addEventListener('resize', resizeKleinCanvas);

        let rotationAngle = 0;

        function drawKleinBottle(time = 0) {
            const w = kleinCanvas.width;
            const h = kleinCanvas.height;
            const centerX = w / 2;
            const centerY = h / 2;
            const scale = Math.min(w, h) * 0.35;

            kleinCtx.fillStyle = 'rgba(10, 10, 20, 0.8)';
            kleinCtx.fillRect(0, 0, w, h);

            rotationAngle = (time || Date.now()) * 0.0005;

            drawTorusKnot(kleinCtx, centerX, centerY, scale, rotationAngle, '#ff6b6b', 0.4, 0);
            drawTorusKnot(kleinCtx, centerX, centerY, scale * 0.85, rotationAngle * 1.5 + Math.PI / 2, '#4ecdc4', 0.4, 0.3);
            drawTorusKnot(kleinCtx, centerX, centerY, scale * 0.7, -rotationAngle * 0.8 + Math.PI, '#95e1d3', 0.4, 0.6);

            const gradient = kleinCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, scale * 0.4);
            gradient.addColorStop(0, 'rgba(0, 212, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
            kleinCtx.fillStyle = gradient;
            kleinCtx.fillRect(centerX - scale * 0.4, centerY - scale * 0.4, scale * 0.8, scale * 0.8);
        }

        function drawTorusKnot(ctx, cx, cy, r, angle, color, alpha, phase) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);

            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 3;

            for (let i = 0; i < 2 * Math.PI; i += 0.05) {
                const x1 = Math.cos(i + phase) * r;
                const y1 = Math.sin(i + phase) * r * 0.6;
                const x2 = Math.cos(i + 0.05 + phase) * r;
                const y2 = Math.sin(i + 0.05 + phase) * r * 0.6;

                if (i === 0) {
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                } else {
                    ctx.lineTo(x2, y2);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        function animate() {
            drawKleinBottle();
            requestAnimationFrame(animate);
        }
        animate();

        // ==================== HASHING & SIGNATURE ====================
        async function sha256(text) {
            const buffer = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function updateHash() {
            const ndaText = document.getElementById('ndaText').value;
            const hash = await sha256(ndaText);
            document.getElementById('statusHash').textContent = hash.substring(0, 16) + '...';
            return hash;
        }

        document.getElementById('ndaText').addEventListener('change', updateHash);
        updateHash();

        async function signAgreement() {
            const name = document.getElementById('signerName').value;
            const org = document.getElementById('signerOrg').value;
            const ndaText = document.getElementById('ndaText').value;
            const signatureData = canvas.toDataURL();

            if (!name || !org) {
                alert('Please enter your name and organization');
                return;
            }

            if (signatureData === 'data:,') {
                alert('Please sign the canvas');
                return;
            }

            const ndaHash = await sha256(ndaText);
            const signatureHash = await sha256(signatureData);
            const timestamp = new Date().toISOString();
            const combined = await sha256(ndaHash + signatureHash + timestamp + name + org);

            document.getElementById('statusSign').textContent = 'Signed ✓';
            document.getElementById('statusSign').classList.add('signed');
            document.getElementById('statusTime').textContent = timestamp.split('T')[0];
            document.getElementById('statusEmbedding').textContent = 'Embedded ✓';
            document.getElementById('statusEmbedding').classList.add('signed');

            const signature = {
                name,
                org,
                ndaHash: ndaHash.substring(0, 32),
                signatureHash: signatureHash.substring(0, 32),
                timestamp,
                finalHash: combined,
                signatureImage: signatureData
            };
            localStorage.setItem('latestSignature', JSON.stringify(signature));

            document.getElementById('finalHash').textContent = combined;
            document.getElementById('successModal').classList.add('active');
        }

        function downloadSignature() {
            const sig = JSON.parse(localStorage.getItem('latestSignature'));
            const cert = \`
═══════════════════════════════════════════════════════════
    TOPOLOGICAL SIGNATURE CERTIFICATE
═══════════════════════════════════════════════════════════

Signer:             \${sig.name}
Organization:       \${sig.org}
Timestamp:          \${sig.timestamp}

NDA Hash:           \${sig.ndaHash}
Signature Hash:     \${sig.signatureHash}
Final Embedding:    \${sig.finalHash}

Status:             EMBEDDED IN KLEIN BOTTLE TOPOLOGY
Immutability:       CRYPTOGRAPHIC
Binding:            PERMANENT

This signature has been irreversibly embedded in the MASCOM
topology and cannot be revoked or altered.

═══════════════════════════════════════════════════════════
            ◇ SingularityUI Topology Portal ◇
═══════════════════════════════════════════════════════════
            \`;

            const blob = new Blob([cert], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`signature-certificate-\${sig.timestamp.split('T')[0]}.txt\`;
            a.click();
        }

        document.getElementById('successModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('successModal')) {
                document.getElementById('successModal').classList.remove('active');
            }
        });
    </script>
</body>
</html>`;

/**
 * Main request handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route /mhsabtlp to SingularityUI portal
    if (url.pathname === '/mhsabtlp' || url.pathname === '/mhsabtlp/') {
      return new Response(SINGULARITYUI_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        }
      });
    }

    // Root redirect
    if (url.pathname === '/') {
      return Response.redirect(url.origin + '/mhsabtlp', 302);
    }

    // 404
    return new Response('Not Found', { status: 404 });
  }
};
