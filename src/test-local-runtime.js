/**
 * Test suite for Hydra Local Runtime
 * Verifies D1Adapter and WorkerRuntime functionality
 *
 * Run: node test-local-runtime.js
 */

import { WorkerRuntime, D1Adapter, EnvBuilder, LocalServer } from './local-runtime.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`✅ ${name}`);
		testsPassed++;
	} catch (error) {
		console.error(`❌ ${name}`);
		console.error(`   ${error.message}`);
		testsFailed++;
	}
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message || 'Assertion failed');
	}
}

function assertEqual(a, b, message) {
	if (a !== b) {
		throw new Error(
			message || `Expected ${b}, got ${a}`
		);
	}
}

// ============================================================================
// Test Suite
// ============================================================================

async function runTests() {
	console.log('\n🧪 Hydra Local Runtime Tests\n');

	// Setup test database
	const testDbPath = path.join(__dirname, 'test-hydra.db');

	// Clean up old test database
	if (fs.existsSync(testDbPath)) {
		fs.unlinkSync(testDbPath);
	}

	// ========================================================================
	// D1Adapter Tests
	// ========================================================================

	console.log('📋 D1Adapter Tests');

	test('D1Adapter: Initialize database', () => {
		const db = new D1Adapter(testDbPath);
		assert(fs.existsSync(testDbPath), 'Database file created');
		db.close();
	});

	test('D1Adapter: Create table', () => {
		const db = new D1Adapter(testDbPath);
		db.exec(`
			CREATE TABLE IF NOT EXISTS test_table (
				id INTEGER PRIMARY KEY,
				name TEXT,
				value INTEGER
			)
		`);
		db.close();
	});

	test('D1Adapter: Insert data', () => {
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
		const result = stmt.bind('test1', 100).run();
		assert(result.success, 'Insert returned success');
		db.close();
	});

	test('D1Adapter: Query with bind()', () => {
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare('SELECT * FROM test_table WHERE name = ?');
		const result = stmt.bind('test1').all();
		assert(result.success, 'Query returned success');
		assert(Array.isArray(result.results), 'Results is array');
		assert(result.results.length === 1, 'Found 1 row');
		assert(result.results[0].name === 'test1', 'Column name matches');
		assert(result.results[0].value === 100, 'Column value matches');
		db.close();
	});

	test('D1Adapter: Query without params', () => {
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare('SELECT * FROM test_table');
		const result = stmt.all();
		assert(result.success, 'Query returned success');
		assert(result.results.length >= 1, 'Found at least 1 row');
		db.close();
	});

	test('D1Adapter: first() returns single row', () => {
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare('SELECT * FROM test_table LIMIT 1');
		const result = stmt.first();
		assert(result.success, 'Query returned success');
		assert(Array.isArray(result.results), 'Results is array');
		assert(result.results.length === 1, 'Returns 1 row');
		db.close();
	});

	test('D1Adapter: Multiple inserts', () => {
		const db = new D1Adapter(testDbPath);
		for (let i = 2; i <= 5; i++) {
			const stmt = db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
			stmt.bind(`test${i}`, i * 100).run();
		}
		const stmt = db.prepare('SELECT COUNT(*) as cnt FROM test_table');
		const result = stmt.all();
		assert(result.results[0].cnt >= 4, 'Multiple rows inserted');
		db.close();
	});

	// ========================================================================
	// Schema Tests
	// ========================================================================

	console.log('\n📋 Schema Tests');

	test('Schema: Initialize Hydra schema', () => {
		EnvBuilder.initializeDatabase(testDbPath);
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
		const result = stmt.all();
		const tableNames = result.results.map((r) => r.name);
		assert(
			tableNames.includes('site_registry'),
			'site_registry table exists'
		);
		assert(
			tableNames.includes('gene_history'),
			'gene_history table exists'
		);
		db.close();
	});

	test('Schema: site_registry has correct columns', () => {
		const db = new D1Adapter(testDbPath);
		const stmt = db.prepare('PRAGMA table_info(site_registry)');
		const result = stmt.all();
		const columns = result.results.map((r) => r.name);
		assert(columns.includes('domain'), 'domain column exists');
		assert(columns.includes('gene_blob'), 'gene_blob column exists');
		assert(columns.includes('status'), 'status column exists');
		assert(columns.includes('version'), 'version column exists');
		db.close();
	});

	// ========================================================================
	// Routes Tests
	// ========================================================================

	console.log('\n📋 Routes Tests');

	test('Routes: Import routes.js successfully', async () => {
		const routes = await import('./routes.js');
		assert(typeof routes.getDomains === 'function', 'getDomains exported');
		assert(typeof routes.getVentures === 'function', 'getVentures exported');
		assert(typeof routes.getConfig === 'function', 'getConfig exported');
	});

	// ========================================================================
	// EnvBuilder Tests
	// ========================================================================

	console.log('\n📋 EnvBuilder Tests');

	test('EnvBuilder: Create env object', () => {
		const env = EnvBuilder.create(testDbPath);
		assert(env.HYDRA_DB, 'HYDRA_DB binding exists');
		assert(env.MASCOM_SECRET, 'MASCOM_SECRET exists');
		assert(
			typeof env.MASCOM_SECRET === 'string',
			'MASCOM_SECRET is string'
		);
	});

	test('EnvBuilder: HYDRA_DB is D1Adapter', () => {
		const env = EnvBuilder.create(testDbPath);
		assert(
			env.HYDRA_DB instanceof D1Adapter,
			'HYDRA_DB is D1Adapter instance'
		);
		assert(typeof env.HYDRA_DB.prepare === 'function', 'prepare() method exists');
	});

	// ========================================================================
	// WorkerRuntime Tests
	// ========================================================================

	console.log('\n📋 WorkerRuntime Tests');

	test('WorkerRuntime: Initialize with env', () => {
		const env = EnvBuilder.create(testDbPath);
		const runtime = new WorkerRuntime(env);
		assert(runtime.env === env, 'Env stored correctly');
	});

	test('WorkerRuntime: fetch() returns Response', async () => {
		const env = EnvBuilder.create(testDbPath);
		const runtime = new WorkerRuntime(env);

		const request = {
			method: 'GET',
			url: 'http://localhost:3000/health',
			headers: new Map(),
		};

		const response = await runtime.fetch(request);
		assert(response, 'Response returned');
		assert(typeof response.status === 'number', 'Response has status');
	});

	// ============================================================================
	// Summary
	// ============================================================================

	console.log('\n' + '='.repeat(50));
	console.log(`✅ Passed: ${testsPassed}`);
	console.log(`❌ Failed: ${testsFailed}`);
	console.log('='.repeat(50) + '\n');

	// Clean up test database
	if (fs.existsSync(testDbPath)) {
		fs.unlinkSync(testDbPath);
	}

	return testsFailed === 0 ? 0 : 1;
}

// Run tests
runTests()
	.then((exitCode) => {
		process.exit(exitCode);
	})
	.catch((error) => {
		console.error('Test suite error:', error);
		process.exit(1);
	});
