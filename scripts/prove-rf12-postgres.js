#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const required = (name) => {
	if (!process.env[name]) throw new Error(`Missing proof variable: ${name}`);
	return process.env[name];
};
const quoted = (value) => `"${value.replaceAll('"', '""')}"`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeout = 15000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await pause(20);
	}
	throw new Error(`${label} timed out`);
}
async function freePort(port) {
	await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => server.close(resolve));
	});
}
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
async function main() {
	const proof = {
		host: required('S1_PROOF_DB_HOST'),
		port: Number(required('S1_PROOF_DB_PORT')),
		user: required('S1_PROOF_DB_USER'),
		password: required('S1_PROOF_DB_PASSWORD'),
		adminDatabase: required('S1_PROOF_ADMIN_DB'),
		database: required('S1_PROOF_DB_NAME'),
		serverPort: Number(required('S1_PROOF_SERVER_PORT')),
	};
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf12_[a-zA-Z0-9_]+$/);
	await freePort(proof.serverPort);
	const config = {
		host: proof.host,
		port: proof.port,
		user: proof.user,
		password: proof.password,
	};
	const admin = new Client({ ...config, database: proof.adminDatabase });
	const gateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-rf12-gate-'));
	let created = false;
	let db;
	let child;
	let logs = '';
	try {
		await admin.connect();
		assert.equal(
			(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [proof.database]))
				.rowCount,
			0,
		);
		await admin.query(`CREATE DATABASE ${quoted(proof.database)}`);
		created = true;
		console.log(
			JSON.stringify({
				proofDatabase: proof.database,
				ownership: 'created by proof:rf12:postgres',
			}),
		);
		const env = {
			...process.env,
			NODE_ENV: 'production',
			DB_HOST: proof.host,
			DB_PORT: String(proof.port),
			DB_USER: proof.user,
			DB_PASSWORD: proof.password,
			DB_NAME: proof.database,
			SERVER_PORT: String(proof.serverPort),
		};
		const migration = spawnSync(npm, ['run', 'migration:run:dist'], {
			cwd: root,
			env,
			encoding: 'utf8',
		});
		if (migration.status !== 0)
			throw new Error(`Migration failed: ${migration.stdout}\n${migration.stderr}`);
		db = new Client({ ...config, database: proof.database });
		await db.connect();
		const appEnv = {
			...env,
			RF12_PROOF_GATE_DIR: gateDir,
			NODE_OPTIONS: `--require=${path.join(__dirname, 'proof-rf12-query-gate.js')}`,
		};
		child = spawn(npm, ['run', 'start'], {
			cwd: root,
			env: appEnv,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		child.stdout.on('data', (data) => {
			logs += data;
		});
		child.stderr.on('data', (data) => {
			logs += data;
		});
		const url = `http://127.0.0.1:${proof.serverPort}`;
		await waitFor(
			async () => {
				try {
					return (await fetch(`${url}/health`)).status === 200;
				} catch {
					return false;
				}
			},
			'compiled process readiness',
			30000,
		);
		const headers = (actor = 'admin-1', role = 'admin') => ({
			'X-Correlation-ID': randomUUID(),
			'X-Performed-By': actor,
			'X-Performed-By-Type': role,
		});
		const send = (method, endpoint, actor, role, payload, extra = {}) =>
			fetch(`${url}${endpoint}`, {
				method,
				headers: {
					...headers(actor, role),
					...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
					...extra,
				},
				...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
			});
		const createDepartment = await send(
			'POST',
			'/api/support/departments',
			undefined,
			undefined,
			{ name: 'RF12 proof', type: 'todos', allowedUserIds: ['admin-1'] },
		);
		assert.equal(createDepartment.status, 201);
		const department = await createDepartment.json();
		const createTicket = await send('POST', '/api/support/tickets', undefined, undefined, {
			subject: 'RF12 proof',
			requesterId: 'owner-1',
			departmentId: department.id,
			priority: 'alta',
			origin: 'backoffice',
			originRefId: 'ref-1',
			message: { message: 'Initial', mediaIds: ['initial-media'] },
		});
		assert.equal(createTicket.status, 201);
		const ticket = await createTicket.json();
		const endpoint = `/api/support/tickets/${ticket.id}/messages`;
		const createMessage = async (actor, role, visible, label, mediaIds = []) => {
			const response = await send('POST', endpoint, actor, role, {
				message: label,
				type: role,
				authorId: actor,
				isVisibleToRequester: visible,
				mediaIds,
			});
			assert.equal(response.status, 201);
			return response.json();
		};
		const hidden = await createMessage('admin-1', 'admin', false, 'hidden', ['h1', 'h2', 'h1']);
		const visible = await createMessage('admin-1', 'admin', true, 'visible', [
			'v1',
			'v2',
			'v1',
		]);
		const replies = [];
		for (let i = 0; i < 5; i += 1)
			replies.push(await createMessage('owner-1', 'cd', true, `reply-${i}`));
		const initialId = (
			await db.query(
				"SELECT id FROM ticket_messages WHERE ticket_id=$1 AND message='Initial'",
				[ticket.id],
			)
		).rows[0].id;
		for (const [index, id] of [
			initialId,
			hidden.id,
			visible.id,
			...replies.map((reply) => reply.id),
		].entries()) {
			await db.query('UPDATE ticket_messages SET created_at=$2 WHERE id=$1', [
				id,
				new Date(Date.UTC(2026, 8, 25, 18, index, 0)),
			]);
		}
		const list = async (actor, role, query = '') => {
			const response = await send('GET', `${endpoint}${query}`, actor, role);
			return { status: response.status, body: await response.json() };
		};
		const tableNames = [
			'departments',
			'department_allowed_users',
			'tickets',
			'ticket_messages',
			'ticket_message_media',
			'ticket_audit_logs',
		];
		const snapshot = async () => {
			const result = {};
			for (const table of tableNames)
				result[table] = (
					await db.query(
						`SELECT row_to_json(t) AS row, xmin::text AS xmin FROM ${table} t ORDER BY row_to_json(t)::text`,
					)
				).rows;
			return result;
		};
		const before = await snapshot();
		const mediaQueryCount = () =>
			fs.existsSync(path.join(gateDir, 'media-queries'))
				? fs.readFileSync(path.join(gateDir, 'media-queries'), 'utf8').trim().split('\n')
						.length
				: 0;
		const messageQueryCount = () =>
			fs.existsSync(path.join(gateDir, 'message-queries'))
				? fs.readFileSync(path.join(gateDir, 'message-queries'), 'utf8').trim().split('\n')
						.length
				: 0;
		const mediaQueriesBefore = mediaQueryCount();
		const all = await list('admin-1', 'admin');
		assert.equal(
			mediaQueryCount() - mediaQueriesBefore,
			1,
			'one media query for eight messages',
		);
		console.log(JSON.stringify({ pageMessages: 8, mediaQueries: 1, nPlusOne: false }));
		assert.equal(all.status, 200);
		assert.equal(all.body.pagination.total, 8);
		assert.deepEqual(
			all.body.data.map((m) => m.message),
			['Initial', 'hidden', 'visible', 'reply-0', 'reply-1', 'reply-2', 'reply-3', 'reply-4'],
		);
		assert.deepEqual(all.body.data.find((m) => m.id === hidden.id).mediaIds, [
			'h1',
			'h2',
			'h1',
		]);
		assert.deepEqual(all.body.data.find((m) => m.id === visible.id).mediaIds, [
			'v1',
			'v2',
			'v1',
		]);
		assert.equal(Object.keys(all.body.data[0]).length, 8);
		assert.equal(
			(await list('admin-1', 'admin', '?isVisibleToRequester=true')).body.pagination.total,
			7,
		);
		assert.equal(
			(await list('admin-1', 'admin', '?isVisibleToRequester=false')).body.pagination.total,
			1,
		);
		const requester = await list('owner-1', 'cd');
		assert.equal(requester.status, 200);
		assert.equal(requester.body.pagination.total, 7);
		assert.ok(requester.body.data.every((m) => m.isVisibleToRequester));
		assert.deepEqual(
			(await list('owner-1', 'backoffice', '?isVisibleToRequester=true')).body.data,
			requester.body.data,
		);
		const messagesBeforeFalse = messageQueryCount();
		assert.deepEqual(
			(await list('owner-1', 'cd', '?isVisibleToRequester=false&page=3&size=2')).body,
			{ data: [], pagination: { page: 3, size: 2, total: 0, totalPages: 0 } },
		);
		assert.equal(
			messageQueryCount(),
			messagesBeforeFalse,
			'requester false must not query messages',
		);
		const page = await list('admin-1', 'admin', '?page=2&size=2');
		assert.deepEqual(page.body.pagination, { page: 2, size: 2, total: 8, totalPages: 4 });
		assert.deepEqual(
			page.body.data.map((m) => m.message),
			['visible', 'reply-0'],
		);
		assert.deepEqual((await list('admin-1', 'admin', '?page=9&size=2')).body.pagination, {
			page: 9,
			size: 2,
			total: 8,
			totalPages: 4,
		});
		assert.deepEqual((await list('admin-1', 'admin', '?page=9&size=2')).body.data, []);
		assert.deepEqual(await snapshot(), before, 'RF12 reads must preserve rows and xmin');
		await db.query('UPDATE departments SET active=false WHERE id=$1', [department.id]);
		assert.equal((await list('admin-1', 'admin')).status, 200);
		assert.equal((await list('owner-1', 'cd')).status, 200);
		await db.query('UPDATE departments SET active=true WHERE id=$1', [department.id]);
		const beforeValidation = await snapshot();
		assert.equal((await list('other', 'admin')).status, 403);
		assert.equal((await list('other', 'cd')).status, 403);
		assert.equal((await list('admin-1', 'admin', '?page=0')).status, 422);
		assert.equal((await list('admin-1', 'admin', '?size=101')).status, 422);
		assert.equal((await list('admin-1', 'admin', '?isVisibleToRequester=TRUE')).status, 422);
		assert.equal((await list('admin-1', 'admin', '?page=1&page=2')).status, 422);
		assert.equal((await list('admin-1', 'admin', '?include=media')).status, 422);
		assert.equal(
			(await send('GET', `/api/support/tickets/${randomUUID()}/messages`, 'admin-1', 'admin'))
				.status,
			404,
		);
		assert.equal(
			(await send('GET', '/api/support/tickets/bad/messages', 'admin-1', 'admin')).status,
			422,
		);
		const bodyStatus = await new Promise((resolve, reject) => {
			const body = '{}';
			const request = http.request(
				`${url}${endpoint}`,
				{
					method: 'GET',
					headers: {
						...headers('admin-1', 'admin'),
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(body),
					},
				},
				(response) => {
					response.resume();
					response.on('end', () => resolve(response.statusCode));
				},
			);
			request.on('error', reject);
			request.end(body);
		});
		assert.equal(bodyStatus, 422);
		assert.equal((await send('GET', endpoint, '', 'admin')).status, 400);
		assert.equal((await send('GET', endpoint, 'admin-1', 'wrong')).status, 400);
		assert.deepEqual(
			await snapshot(),
			beforeValidation,
			'all RF12 reads must leave six tables identical',
		);
		console.log(
			JSON.stringify({ readOnlyTables: tableNames, beforeAfterEqual: true, noAudit: true }),
		);

		const gated = async (readActor, readRole, writer, label) => {
			fs.writeFileSync(path.join(gateDir, 'arm'), label);
			const pending = list(readActor, readRole);
			try {
				await waitFor(() => fs.existsSync(path.join(gateDir, 'paused')), `${label} pause`);
			} catch (error) {
				const queries = fs.existsSync(path.join(gateDir, 'message-queries'))
					? fs.readFileSync(path.join(gateDir, 'message-queries'), 'utf8').slice(-3000)
					: 'no message SQL';
				throw new Error(
					`${error.message}; queries=${queries}; appLogs=${logs.slice(-1500)}`,
				);
			}
			fs.unlinkSync(path.join(gateDir, 'paused'));
			const writeResult = await writer();
			fs.writeFileSync(path.join(gateDir, 'resume'), label);
			const result = await pending;
			return { result, writeResult };
		};
		const priorTotal = requester.body.pagination.total;
		const rf10 = await gated(
			'owner-1',
			'cd',
			() => createMessage('admin-1', 'admin', true, 'concurrent', ['new-a', 'new-b']),
			'rf10',
		);
		assert.equal(rf10.result.body.pagination.total, priorTotal);
		assert.ok(!rf10.result.body.data.some((m) => m.id === rf10.writeResult.id));
		assert.equal((await list('owner-1', 'cd')).body.pagination.total, priorTotal + 1);
		console.log(
			JSON.stringify({
				concurrent: 'RF12xRF10',
				snapshot: 'before writer commit',
				total: rf10.result.body.pagination.total,
				mediaPartial: false,
				timeout: false,
			}),
		);
		const beforeVisibilityTotal = (await list('owner-1', 'cd')).body.pagination.total;
		const rf11 = await gated(
			'owner-1',
			'cd',
			async () => {
				const response = await send(
					'PATCH',
					`${endpoint}/${hidden.id}/visibility`,
					'admin-1',
					'admin',
					{ isVisibleToRequester: true },
				);
				assert.equal(response.status, 200);
				return response.json();
			},
			'rf11',
		);
		assert.equal(rf11.result.body.pagination.total, beforeVisibilityTotal);
		assert.ok(!rf11.result.body.data.some((m) => m.id === hidden.id));
		assert.equal(
			(await list('owner-1', 'cd')).body.pagination.total,
			beforeVisibilityTotal + 1,
		);
		console.log(
			JSON.stringify({
				concurrent: 'RF12xRF11',
				snapshot: 'before writer commit',
				total: rf11.result.body.pagination.total,
				mixedVisibility: false,
				timeout: false,
			}),
		);
		const adminRead = await gated(
			'admin-1',
			'admin',
			async () => {
				const response = await send(
					'PATCH',
					`${endpoint}/${hidden.id}/visibility`,
					'admin-1',
					'admin',
					{ isVisibleToRequester: false },
				);
				assert.equal(response.status, 200);
				return response.json();
			},
			'rf11-admin',
		);
		assert.equal(
			adminRead.result.body.data.find((message) => message.id === hidden.id)
				.isVisibleToRequester,
			true,
		);
		assert.equal(
			(await list('admin-1', 'admin')).body.data.find((message) => message.id === hidden.id)
				.isVisibleToRequester,
			false,
		);
		console.log(
			JSON.stringify({
				concurrent: 'RF12_admin_x_RF11',
				snapshotVisibility: true,
				laterVisibility: false,
				timeout: false,
			}),
		);
		const spec = await (await fetch(`${url}/api-docs-json`)).json();
		assert.ok(spec.paths['/api/support/tickets/{ticketId}/messages']?.get);
		console.log(
			'RF12 PostgreSQL compiled process, ACL, snapshot, read-only and concurrency proof OK',
		);
	} finally {
		fs.rmSync(gateDir, { recursive: true, force: true });
		await stop(child);
		if (db) await db.end().catch(() => undefined);
		if (created) {
			await admin.query(
				'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
				[proof.database],
			);
			await admin.query(`DROP DATABASE ${quoted(proof.database)} WITH (FORCE)`);
			console.log(
				JSON.stringify({ proofDatabase: proof.database, cleanup: 'dropped by owner' }),
			);
		}
		await admin.end().catch(() => undefined);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
