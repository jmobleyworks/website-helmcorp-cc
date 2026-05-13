/**
 * Local Runtime for Hydra — Emulates Cloudflare Workers + D1
 *
 * Purpose: Run the same functors locally as on CF edge
 * - WorkerRuntime: Emulates CF Worker fetch interface
 * - D1Adapter: Maps to SQLite (matches CF D1 API)
 * - LocalServer: Express.js wrapper, routes same as CF
 *
 * Usage:
 *   node local-runtime.js  # Starts localhost:3000
 *   curl http://localhost:3000/api/ventures
 */

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// CommonJS fallback for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// D1 Adapter: Maps to SQLite, matches CF D1 API exactly
// ============================================================================

class D1Adapter {
	constructor(dbPath) {
		this.dbPath = dbPath;
		this.db = new Database(dbPath);
		// Enable foreign keys
		this.db.pragma('foreign_keys = ON');
	}

	/**
	 * Prepare a SQL statement
	 * Returns object with bind(), run(), all(), first() methods
	 */
	prepare(sql) {
		const stmt = this.db.prepare(sql);

		return {
			bind: (...params) => {
				// Returns self for chaining: stmt.bind(...params).all()
				this._stmt = stmt;
				this._params = params;
				return this;
			},

			run: () => {
				const result = this._stmt
					? this._stmt.run(...this._params)
					: stmt.run();
				return {
					success: true,
					meta: {
						duration: result.duration || 0,
						last_row_id: result.lastInsertRowid || null,
						changes: result.changes || 0,
					},
				};
			},

			all: () => {
				const rows = this._stmt
					? this._stmt.all(...this._params)
					: stmt.all();
				return {
					success: true,
					results: rows || [],
				};
			},

			first: () => {
				const row = this._stmt
					? this._stmt.get(...this._params)
					: stmt.get();
				return {
					success: true,
					results: row ? [row] : [],
				};
			},
		};
	}

	/**
	 * Execute raw SQL (used for initialization)
	 */
	exec(sql) {
		return this.db.exec(sql);
	}

	/**
	 * Close database connection
	 */
	close() {
		this.db.close();
	}
}

// ============================================================================
// Worker Runtime: Emulates CF Worker fetch interface
// ============================================================================

class WorkerRuntime {
	constructor(env) {
		this.env = env || {};
	}

	/**
	 * Main fetch handler (same signature as CF Worker)
	 * @param {Request} request - Native Node.js Request (or polyfill)
	 * @returns {Promise<Response>} - Native Response object
	 */
	async fetch(request) {
		try {
			// Import routes dynamically to use fresh bindings
			const { routeRequest } = await import('./routes.js');

			// Extract method and URL
			const method = request.method || 'GET';
			const url = request.url || '/';
			const fullUrl = url.startsWith('http')
				? url
				: `http://localhost:3000${url}`;

			// Create mock request if needed
			const mockRequest = {
				method,
				url: fullUrl,
				headers: request.headers || new Map(),
				body: request.body || null,
			};

			// Call router with D1 and env
			const response = await routeRequest(mockRequest, this.env.HYDRA_DB, this.env);

			return response;
		} catch (error) {
			console.error('Worker fetch error:', error);
			return new Response(
				JSON.stringify({
					error: 'Worker error',
					message: error.message,
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	}
}

// ============================================================================
// Local Server: Express.js wrapper
// ============================================================================

class LocalServer {
	constructor(port = 3000, env) {
		this.port = port;
		this.app = express();
		this.runtime = new WorkerRuntime(env);
		this.setupMiddleware();
		this.setupRoutes();
	}

	setupMiddleware() {
		// Parse JSON bodies
		this.app.use(express.json({ limit: '10mb' }));
		this.app.use(express.text({ limit: '10mb' }));

		// Logging
		this.app.use((req, res, next) => {
			console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
			next();
		});

		// CORS headers
		this.app.use((req, res, next) => {
			res.header('Access-Control-Allow-Origin', '*');
			res.header(
				'Access-Control-Allow-Headers',
				'Content-Type, X-MASCOM-SECRET'
			);
			res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

			if (req.method === 'OPTIONS') {
				return res.sendStatus(200);
			}
			next();
		});
	}

	setupRoutes() {
		// All requests → Worker runtime
		this.app.all('*', async (req, res) => {
			try {
				// Build Node.js Request-like object
				const requestLike = {
					method: req.method,
					url: `http://${req.get('host')}${req.originalUrl}`,
					headers: new Map(Object.entries(req.headers)),
					body: req.body
						? typeof req.body === 'string'
							? req.body
							: JSON.stringify(req.body)
						: null,
				};

				// Call worker runtime
				const response = await this.runtime.fetch(requestLike);

				// Copy status and headers
				res.status(response.status || 200);

				// Copy response headers
				if (response.headers && response.headers.entries) {
					for (const [key, value] of response.headers.entries()) {
						res.set(key, value);
					}
				}

				// Send body
				if (response.body) {
					// Handle both ReadableStream and string
					if (typeof response.body === 'string') {
						res.send(response.body);
					} else {
						// Assume it's a stream or buffer
						res.send(response.body);
					}
				} else {
					res.send('');
				}
			} catch (error) {
				console.error('Request error:', error);
				res.status(500).json({
					error: 'Request error',
					message: error.message,
				});
			}
		});
	}

	listen() {
		return new Promise((resolve) => {
			const server = this.app.listen(this.port, () => {
				console.log(`\n✓ Hydra Local Runtime listening on http://localhost:${this.port}`);
				console.log(`  Endpoints:`);
				console.log(`    GET  /api/domains    - List all domains`);
				console.log(`    GET  /api/ventures   - List ventures (with descriptions)`);
				console.log(`    GET  /api/config/:domain  - Get gene for domain`);
				console.log(`    GET  /api/stats      - Database statistics`);
				console.log(`    POST /api/register   - Register new domain`);
				console.log(`    GET  /health         - Health check\n`);
				resolve(server);
			});
		});
	}
}

// ============================================================================
// Env Builder: Create local env matching CF
// ============================================================================

class EnvBuilder {
	static create(dbPath = './hydra-local.db') {
		const secret = process.env.MASCOM_SECRET || 'local-dev-secret-12345';

		return {
			HYDRA_DB: new D1Adapter(dbPath),
			MASCOM_SECRET: secret,
		};
	}

	static initializeDatabase(dbPath) {
		const db = new D1Adapter(dbPath);

		// Read schema
		const schemaPath = path.join(__dirname, 'schema.sql');
		const schema = fs.readFileSync(schemaPath, 'utf-8');

		// Execute schema
		db.exec(schema);

		// Optional: Insert sample data
		const sampleData = `
			INSERT OR IGNORE INTO site_registry (domain, gene_blob, status, checksum)
			VALUES
			  ('getventures.example.com', '{"site_name":"GetVentures","description":"Venture discovery platform","version":"1.0","species":"venture-scout"}', 'active', 'sample-1'),
			  ('getdomains.example.com', '{"site_name":"GetDomains","description":"Domain management system","version":"1.0","species":"domain-registry"}', 'active', 'sample-2');
		`;

		try {
			db.exec(sampleData);
			console.log('✓ Sample data inserted');
		} catch (e) {
			console.log('  (Sample data already exists)');
		}

		db.close();
	}
}

// ============================================================================
// Main: Start local server
// ============================================================================

async function main() {
	const dbPath = './hydra-local.db';
	const port = process.env.PORT || 3000;

	// Initialize database if needed
	if (!fs.existsSync(dbPath)) {
		console.log('Initializing database...');
		EnvBuilder.initializeDatabase(dbPath);
	}

	// Create environment
	const env = EnvBuilder.create(dbPath);

	// Start server
	const server = new LocalServer(port, env);
	await server.listen();

	// Handle shutdown
	process.on('SIGINT', () => {
		console.log('\n\nShutting down...');
		env.HYDRA_DB.close();
		process.exit(0);
	});
}

// Export classes for testing/importing
export { WorkerRuntime, D1Adapter, LocalServer, EnvBuilder };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error('Fatal error:', err);
		process.exit(1);
	});
}
