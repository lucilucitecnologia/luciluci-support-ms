#!/usr/bin/env node

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const pg = require('pg');

pg.defaults.parseInputDatesAsUTC = true;
pg.types.setTypeParser(1114, (value) => new Date(value.replace(' ', 'T') + 'Z'));
require('ts-node/register');
const { W1_FIXTURE, W1_ACTORS, W1_TABLES } = require('./seed/support-w1.fixture');
const { validateW1Fixture } = require('./seed/support-w1.validate');

const { Client } = pg;
const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const required = (name) => {
	if (!process.env[name]) throw new Error('Missing proof variable: ' + name);
	return process.env[name];
};
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const normalize = (value) => {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(normalize);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value).map(([key, part]) => [key, normalize(part)]),
		);
	return value;
};
const canonical = (rows) =>
	rows
		.map((row) =>
			JSON.stringify(
				Object.fromEntries(
					Object.entries(normalize(row)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
				),
			),
		)
		.sort();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stop(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((resolve) => child.once('exit', resolve));
	try {
		if (process.platform === 'win32') child.kill('SIGTERM');
		else process.kill(-child.pid, 'SIGTERM');
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
	await Promise.race([exited, pause(5000)]);
	if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
async function freePort(port) {
	await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => server.close(resolve));
	});
}
async function ready(url) {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			if ((await fetch(url)).status === 200) return;
		} catch {
			/* process starting */
		}
		await pause(250);
	}
	throw new Error('Compiled Support server did not become ready');
}

async function main() {
	validateW1Fixture(W1_FIXTURE);
	const config = {
		host: required('S1_PROOF_DB_HOST'),
		port: Number(required('S1_PROOF_DB_PORT')),
		user: required('S1_PROOF_DB_USER'),
		password: required('S1_PROOF_DB_PASSWORD'),
	};
	const adminDatabase = required('S1_PROOF_ADMIN_DB');
	const baseName = required('S1_PROOF_DB_NAME');
	const serverPort = Number(required('S1_PROOF_SERVER_PORT'));
	assert.match(baseName, /^support_s1_(?:proof|ci)_seed_[A-Za-z0-9_]+$/);
	assert.ok(Number.isInteger(serverPort) && serverPort > 0);
	await freePort(serverPort);
	const admin = new Client({ ...config, database: adminDatabase });
	const owned = [];
	const evidence = {};
	let child;
	const dbConfig = (name) => ({ ...config, database: name });
	const commandEnv = (name, extra = {}) => ({
		...process.env,
		NODE_ENV: 'test',
		SUPPORT_SEED_CONFIRM: 'W1_DISPOSABLE',
		DB_HOST: config.host,
		DB_PORT: String(config.port),
		DB_USER: config.user,
		DB_PASSWORD: config.password,
		DB_NAME: name,
		...extra,
	});
	const command = (script, name, extra = {}) =>
		spawnSync(npm, ['run', script], {
			cwd: root,
			env: commandEnv(name, extra),
			encoding: 'utf8',
			timeout: 90000,
		});
	const seed = (name, extra = {}, marker, status = 0) => {
		const result = command('seed', name, extra);
		assert.equal(result.status, status, 'seed process exit: ' + result.stdout + result.stderr);
		assert.match(result.stdout + result.stderr, new RegExp(marker));
		return result;
	};
	const seedAsync = (name) =>
		new Promise((resolve, reject) => {
			const process = spawn(npm, ['run', 'seed'], {
				cwd: root,
				env: commandEnv(name),
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let output = '';
			process.stdout.on('data', (data) => {
				output += data;
			});
			process.stderr.on('data', (data) => {
				output += data;
			});
			process.once('error', reject);
			process.once('close', (code) => resolve({ code, output }));
		});
	const create = async (name, migrate = true) => {
		assert.match(name, /^support_s1_(?:proof|ci)_seed_[A-Za-z0-9_]+$/);
		const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
		assert.equal(exists.rowCount, 0, 'Proof database must be absent: ' + name);
		await admin.query('CREATE DATABASE ' + quote(name));
		owned.push(name);
		console.log(
			JSON.stringify({ proofDatabase: name, ownership: 'created by proof:seed:w1:postgres' }),
		);
		if (migrate) {
			const migrated = command('migration:run', name);
			assert.equal(
				migrated.status,
				0,
				'Migration failed: ' + migrated.stdout + migrated.stderr,
			);
		}
	};
	const connect = async (name) => {
		const db = new Client(dbConfig(name));
		await db.connect();
		return db;
	};
	const snapshot = async (db) => {
		const rows = {};
		const xmin = {};
		for (const table of W1_TABLES) {
			const result = await db.query('SELECT *, xmin::text AS w1_xmin FROM ' + table);
			rows[table] = result.rows.map(({ w1_xmin, ...row }) => normalize(row));
			xmin[table] = result.rows
				.map((row) => [
					row.id ?? row.department_id ?? row.ticket_message_id,
					row.position ?? null,
					row.w1_xmin,
				])
				.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		}
		const sequence = (await db.query('SELECT last_value, is_called FROM tickets_number_seq'))
			.rows[0];
		return {
			rows,
			xmin,
			sequence: { lastValue: Number(sequence.last_value), isCalled: sequence.is_called },
		};
	};
	const samePhysical = (before, after) => {
		for (const table of W1_TABLES) {
			assert.deepEqual(
				canonical(after.rows[table]),
				canonical(before.rows[table]),
				table + ' changed',
			);
			assert.deepEqual(after.xmin[table], before.xmin[table], table + ' xmin changed');
		}
		assert.deepEqual(after.sequence, before.sequence, 'sequence changed');
	};
	const exact = (state) => {
		for (const table of W1_TABLES)
			assert.deepEqual(
				canonical(state.rows[table]),
				canonical(W1_FIXTURE[table]),
				table + ' content',
			);
		assert.deepEqual(state.sequence, { lastValue: 16, isCalled: true });
	};
	const empty = (state, sequence = { lastValue: 1, isCalled: false }) => {
		for (const table of W1_TABLES)
			assert.equal(state.rows[table].length, 0, table + ' should be empty');
		assert.deepEqual(state.sequence, sequence);
	};
	const smoke = async (name) => {
		let logs = '';
		child = spawn(npm, ['run', 'start'], {
			cwd: root,
			env: commandEnv(name, { NODE_ENV: 'production', SERVER_PORT: String(serverPort) }),
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		child.stdout.on('data', (data) => {
			logs += data;
		});
		child.stderr.on('data', (data) => {
			logs += data;
		});
		const base = 'http://127.0.0.1:' + serverPort;
		try {
			await ready(base + '/health');
			const get = async (path, actor, role) => {
				const response = await fetch(base + path, {
					headers: {
						'X-Correlation-ID': randomUUID(),
						'X-Performed-By': actor,
						'X-Performed-By-Type': role,
					},
				});
				return { status: response.status, body: await response.json() };
			};
			const departments = await get('/api/support/departments', W1_ACTORS.adminA, 'admin');
			assert.equal(departments.status, 200);
			assert.equal(departments.body.pagination.total, 4);
			assert.deepEqual(
				new Set(departments.body.data.map((row) => row.type)),
				new Set(['todos', 'backoffice', 'cd']),
			);
			const requester = await get(
				'/api/support/tickets/requester/' + W1_ACTORS.backofficeA,
				W1_ACTORS.backofficeA,
				'backoffice',
			);
			assert.equal(requester.status, 200);
			assert.equal(requester.body.pagination.total, 4);
			const adminList = await get(
				'/api/support/tickets/admin/' + W1_ACTORS.adminA,
				W1_ACTORS.adminA,
				'admin',
			);
			assert.equal(adminList.status, 200);
			assert.equal(adminList.body.pagination.total, 6);
			const t02 = W1_FIXTURE.tickets[1].id;
			const t01 = W1_FIXTURE.tickets[0].id;
			const t13 = W1_FIXTURE.tickets[12].id;
			const detail = await get('/api/support/tickets/' + t13, W1_ACTORS.cdB, 'cd');
			assert.equal(detail.status, 200);
			assert.equal(detail.body.id, t13);
			const ownerMessages = await get(
				'/api/support/tickets/' + t02 + '/messages',
				W1_ACTORS.backofficeA,
				'backoffice',
			);
			const adminMessages = await get(
				'/api/support/tickets/' + t02 + '/messages',
				W1_ACTORS.adminA,
				'admin',
			);
			assert.equal(ownerMessages.status, 200);
			assert.equal(adminMessages.status, 200);
			assert.equal(ownerMessages.body.pagination.total, 2);
			assert.equal(adminMessages.body.pagination.total, 3);
			const publicAdminMessages = await get(
				'/api/support/tickets/' + t01 + '/messages',
				W1_ACTORS.backofficeA,
				'backoffice',
			);
			assert.equal(publicAdminMessages.status, 200);
			assert.equal(publicAdminMessages.body.pagination.total, 3);
			assert.ok(
				publicAdminMessages.body.data.some(
					(row) => row.type === 'admin' && row.isVisibleToRequester === true,
				),
			);
			const ownerHistory = await get(
				'/api/support/tickets/history?ticketId=' + t02,
				W1_ACTORS.backofficeA,
				'backoffice',
			);
			const adminHistory = await get(
				'/api/support/tickets/history?ticketId=' + t02,
				W1_ACTORS.adminA,
				'admin',
			);
			assert.equal(ownerHistory.status, 200);
			assert.equal(adminHistory.status, 200);
			assert.equal(ownerHistory.body.pagination.total, 4);
			assert.equal(adminHistory.body.pagination.total, 5);
			assert.ok(
				ownerHistory.body.data.some(
					(row) =>
						row.action === 'nova_mensagem' &&
						row.origin === 'backoffice' &&
						row.authorId === W1_ACTORS.backofficeA,
				),
			);
			assert.ok(
				!ownerHistory.body.data.some(
					(row) => row.action === 'nova_mensagem' && row.origin === 'admin',
				),
			);
			assert.ok(
				adminHistory.body.data.some(
					(row) => row.action === 'nova_mensagem' && row.origin === 'admin',
				),
			);
			evidence.http = {
				departments: 4,
				requesterTickets: 4,
				adminTickets: 6,
				ownerMessages: 2,
				adminMessages: 3,
				ownerHistory: 4,
				adminHistory: 5,
			};
		} catch (error) {
			throw new Error(String(error) + '\nCompiled process logs: ' + logs.slice(-3000));
		} finally {
			await stop(child);
			child = null;
		}
	};
	const proveNextApiNumber = async (name) => {
		let logs = '';
		child = spawn(npm, ['run', 'start'], {
			cwd: root,
			env: commandEnv(name, { NODE_ENV: 'production', SERVER_PORT: String(serverPort) }),
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		child.stdout.on('data', (data) => {
			logs += data;
		});
		child.stderr.on('data', (data) => {
			logs += data;
		});
		try {
			const base = 'http://127.0.0.1:' + serverPort;
			await ready(base + '/health');
			const response = await fetch(base + '/api/support/tickets', {
				method: 'POST',
				headers: { 'X-Correlation-ID': randomUUID(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'W1 proof next Ticket',
					requesterId: W1_ACTORS.backofficeA,
					departmentId: W1_FIXTURE.departments[0].id,
					priority: 'baixa',
					origin: 'backoffice',
					originRefId: 'ref-1',
					message: { message: 'W1 proof only' },
				}),
			});
			if (response.status !== 201) {
				throw new Error(
					'Next Ticket API returned ' + response.status + ': ' + (await response.text()),
				);
			}
			const body = await response.json();
			assert.equal(body.number, 17);
			evidence.nextApiTicketNumber = body.number;
		} catch (error) {
			throw new Error(String(error) + '\nCompiled process logs: ' + logs.slice(-3000));
		} finally {
			await stop(child);
			child = null;
		}
	};
	try {
		// Static gates must reject before connecting to a deliberately invalid host.
		for (const [label, extra] of [
			['missing-confirm', { SUPPORT_SEED_CONFIRM: '', DB_HOST: 'unreachable.invalid' }],
			['missing-node-env', { NODE_ENV: '', DB_HOST: 'unreachable.invalid' }],
			['production', { NODE_ENV: 'production', DB_HOST: 'unreachable.invalid' }],
			['missing-db-name', { DB_NAME: '', DB_HOST: 'unreachable.invalid' }],
			['unsafe-name', { DB_NAME: 'support_ms', DB_HOST: 'unreachable.invalid' }],
			['unsafe-host', { DB_HOST: 'unreachable.invalid' }],
		]) {
			const result = seed(baseName, extra, 'SEED_W1_REFUSED', 1);
			assert.doesNotMatch(result.stderr, /ENOTFOUND|ECONNREFUSED|timeout/i);
			evidence[label] = {
				connected: false,
				wrote: false,
				exit: 1,
				marker: 'SEED_W1_REFUSED',
			};
		}
		await admin.connect();
		await create(baseName + '_unmigrated', false);
		seed(baseName + '_unmigrated', {}, 'W1_SCHEMA_NOT_READY', 1);
		await create(baseName);
		const base = await connect(baseName);
		try {
			const initial = await snapshot(base);
			empty(initial);
			await base.query(
				"INSERT INTO idempotency_keys (id,key,fingerprint,method,route,correlation_id,state) VALUES ('00000009-0000-4000-8000-000000000001','w1-proof-technical','proof','POST','/proof','w1-proof','completed')",
			);
			const technicalBefore = (
				await base.query('SELECT *, xmin::text AS w1_xmin FROM idempotency_keys')
			).rows;
			seed(baseName, { TZ: 'UTC' }, 'SEED_W1_CREATED');
			const seeded = await snapshot(base);
			exact(seeded);
			assert.deepEqual(
				(await base.query('SELECT *, xmin::text AS w1_xmin FROM idempotency_keys')).rows,
				technicalBefore,
			);
			evidence.created = {
				counts: Object.fromEntries(
					W1_TABLES.map((table) => [table, seeded.rows[table].length]),
				),
				sequence: seeded.sequence,
			};
			seed(baseName, { TZ: 'UTC' }, 'ALREADY_SEEDED');
			const repeated = await snapshot(base);
			samePhysical(seeded, repeated);
			seed(baseName, { PGOPTIONS: '-csearch_path=pg_catalog' }, 'ALREADY_SEEDED');
			samePhysical(repeated, await snapshot(base));
			assert.deepEqual(
				(await base.query('SELECT *, xmin::text AS w1_xmin FROM idempotency_keys')).rows,
				technicalBefore,
			);
			evidence.rerun = {
				marker: 'ALREADY_SEEDED',
				xmin: 'identical',
				rows: 'identical',
				sequence: repeated.sequence,
				searchPath: 'pg_catalog no-op',
			};
			await smoke(baseName);
			await create(baseName + '_tz');
			seed(baseName + '_tz', { TZ: 'America/Sao_Paulo' }, 'SEED_W1_CREATED');
			const tz = await connect(baseName + '_tz');
			try {
				const other = await snapshot(tz);
				exact(other);
				for (const table of W1_TABLES)
					assert.deepEqual(canonical(other.rows[table]), canonical(seeded.rows[table]));
				evidence.timezones = { UTC: 'identical', America_Sao_Paulo: 'identical' };
			} finally {
				await tz.end();
			}
			await base.query('UPDATE departments SET name=$1 WHERE id=$2', [
				'W1 changed manually',
				W1_FIXTURE.departments[0].id,
			]);
			const drift = await snapshot(base);
			seed(baseName, {}, 'SEED_W1_DIVERGENT', 1);
			samePhysical(drift, await snapshot(base));
			evidence.fieldDrift = {
				connected: true,
				wrote: false,
				exit: 1,
				marker: 'SEED_W1_DIVERGENT',
			};
		} finally {
			await base.end();
		}

		await create(baseName + '_manual');
		const manual = await connect(baseName + '_manual');
		try {
			await manual.query(
				'INSERT INTO departments (id,name,type,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
				[
					'00000009-0000-4000-8000-000000000999',
					'Manual',
					'todos',
					true,
					'2026-01-01T00:00:00.000Z',
					'2026-01-01T00:00:00.000Z',
				],
			);
			const before = await snapshot(manual);
			seed(baseName + '_manual', {}, 'SEED_W1_DIVERGENT', 1);
			samePhysical(before, await snapshot(manual));
			evidence.manual = {
				connected: true,
				wrote: false,
				exit: 1,
				marker: 'SEED_W1_DIVERGENT',
			};
		} finally {
			await manual.end();
		}

		await create(baseName + '_partial');
		const partial = await connect(baseName + '_partial');
		try {
			const row = W1_FIXTURE.departments[0];
			await partial.query(
				'INSERT INTO departments (id,name,type,active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
				[row.id, row.name, row.type, row.active, row.created_at, row.updated_at],
			);
			const before = await snapshot(partial);
			seed(baseName + '_partial', {}, 'SEED_W1_DIVERGENT', 1);
			samePhysical(before, await snapshot(partial));
			evidence.partial = {
				connected: true,
				wrote: false,
				exit: 1,
				marker: 'SEED_W1_DIVERGENT',
			};
		} finally {
			await partial.end();
		}

		await create(baseName + '_sequence');
		const sequence = await connect(baseName + '_sequence');
		try {
			await sequence.query("SELECT nextval('tickets_number_seq')");
			const before = await snapshot(sequence);
			empty(before, { lastValue: 1, isCalled: true });
			seed(baseName + '_sequence', {}, 'SEED_W1_DIVERGENT', 1);
			samePhysical(before, await snapshot(sequence));
			evidence.sequenceDrift = {
				connected: true,
				wrote: false,
				exit: 1,
				marker: 'SEED_W1_DIVERGENT',
			};
		} finally {
			await sequence.end();
		}

		await create(baseName + '_fault');
		const fault = await connect(baseName + '_fault');
		try {
			await fault.query(
				"CREATE FUNCTION w1_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'W1_FAULT'; END $$",
			);
			await fault.query(
				'CREATE TRIGGER w1_fault BEFORE INSERT ON ticket_audit_logs FOR EACH ROW EXECUTE FUNCTION w1_fault()',
			);
			const failed = command('seed', baseName + '_fault');
			assert.equal(failed.status, 1);
			assert.match(failed.stderr, /SEED_W1_FAILED.*W1_FAULT/s);
			const afterFault = await snapshot(fault);
			for (const table of W1_TABLES)
				assert.equal(afterFault.rows[table].length, 0, table + ' did not roll back');
			assert.deepEqual(afterFault.sequence, { lastValue: 16, isCalled: true });
			seed(baseName + '_fault', {}, 'SEED_W1_DIVERGENT', 1);
			evidence.rollback = {
				rows: 0,
				sequence: afterFault.sequence,
				rerun: 'SEED_W1_DIVERGENT',
			};
		} finally {
			await fault.end();
		}
		await create(baseName + '_recovered');
		seed(baseName + '_recovered', {}, 'SEED_W1_CREATED');
		const recovered = await connect(baseName + '_recovered');
		try {
			exact(await snapshot(recovered));
		} finally {
			await recovered.end();
		}
		await proveNextApiNumber(baseName + '_recovered');
		evidence.recreated = 'SEED_W1_CREATED';
		await create(baseName + '_concurrent');
		const barrier = await connect(baseName + '_concurrent');
		let concurrent;
		try {
			await barrier.query('BEGIN');
			await barrier.query('SELECT pg_advisory_xact_lock(19383184)');
			const competing = [
				seedAsync(baseName + '_concurrent'),
				seedAsync(baseName + '_concurrent'),
			];
			let waitingCount = 0;
			for (let attempt = 0; attempt < 120; attempt++) {
				const waiting = await admin.query(
					"SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'",
					[baseName + '_concurrent'],
				);
				waitingCount = waiting.rows[0].count;
				if (waitingCount === 2) break;
				await pause(250);
			}
			assert.equal(waitingCount, 2, 'Both seed processes must overlap at the advisory lock');
			await barrier.query('COMMIT');
			concurrent = await Promise.all(competing);
		} finally {
			await barrier.query('ROLLBACK').catch(() => undefined);
			await barrier.end();
		}
		assert.deepEqual(
			concurrent.map((result) => result.code),
			[0, 0],
		);
		assert.equal(
			concurrent.filter((result) => result.output.includes('SEED_W1_CREATED')).length,
			1,
		);
		assert.equal(
			concurrent.filter((result) => result.output.includes('ALREADY_SEEDED')).length,
			1,
		);
		const concurrentDb = await connect(baseName + '_concurrent');
		try {
			exact(await snapshot(concurrentDb));
		} finally {
			await concurrentDb.end();
		}
		evidence.concurrent = 'one created, one no-op, both exit 0';
		// An ordinary writer does not participate in the advisory lock. Hold its
		// uncommitted row while the seed starts, then commit: table locks must make
		// the seed classify the committed manual row as DIVERGENT before writing.
		await create(baseName + '_external');
		const external = await connect(baseName + '_external');
		const observer = await connect(baseName + '_external');
		try {
			await external.query('BEGIN');
			await external.query(
				"INSERT INTO departments (id,name,type,active,created_at,updated_at) VALUES ('00000009-0000-4000-8000-000000000998','External writer','todos',true,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
			);
			let earlyResult;
			const competingSeed = seedAsync(baseName + '_external').then((result) => {
				earlyResult = result;
				return result;
			});
			let blocked = false;
			let observed = [];
			for (let attempt = 0; attempt < 120; attempt++) {
				const waiting = await observer.query(
					'SELECT pid, state, wait_event_type, query FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()',
					[baseName + '_external'],
				);
				observed = waiting.rows;
				if (waiting.rows.some((row) => row.wait_event_type === 'Lock')) {
					blocked = true;
					break;
				}
				await pause(250);
			}
			assert.ok(
				blocked,
				'Seed did not block behind an external writer: ' +
					JSON.stringify({ observed, earlyResult }),
			);
			await external.query('COMMIT');
			const competingResult = await competingSeed;
			assert.equal(competingResult.code, 1, competingResult.output);
			assert.match(competingResult.output, /SEED_W1_DIVERGENT/);
			const state = await snapshot(external);
			assert.equal(state.rows.departments.length, 1);
			for (const table of W1_TABLES.filter((name) => name !== 'departments'))
				assert.equal(state.rows[table].length, 0);
			evidence.externalWriter = 'manual row committed first; seed refused without writes';
		} finally {
			await external.query('ROLLBACK').catch(() => undefined);
			await observer.end();
			await external.end();
		}
	} finally {
		await stop(child);
		const cleanupErrors = [];
		for (const name of owned.reverse()) {
			try {
				await admin.query('DROP DATABASE ' + quote(name) + ' WITH (FORCE)');
			} catch (error) {
				cleanupErrors.push(name + ': ' + error.message);
			}
		}
		await admin.end().catch(() => undefined);
		if (cleanupErrors.length) {
			throw new Error('Owned proof database cleanup failed: ' + cleanupErrors.join('; '));
		}
	}
	console.log('SEED_W1_PROOF_PASS ' + JSON.stringify(evidence));
}

main().catch((error) => {
	console.error('SEED_W1_PROOF_FAIL: ' + (error?.stack ?? String(error)));
	process.exitCode = 1;
});
