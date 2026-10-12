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
async function waitFor(predicate, label, timeout = 20000) {
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf13_[a-zA-Z0-9_]+$/);
	await freePort(proof.serverPort);
	const config = {
		host: proof.host,
		port: proof.port,
		user: proof.user,
		password: proof.password,
	};
	const admin = new Client({ ...config, database: proof.adminDatabase });
	const gateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-rf13-gate-'));
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
				ownership: 'created by proof:rf13:postgres',
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
		child = spawn(npm, ['run', 'start'], {
			cwd: root,
			env: {
				...env,
				RF13_PROOF_GATE_DIR: gateDir,
				NODE_OPTIONS: `--require=${path.join(__dirname, 'proof-rf13-query-gate.js')}`,
			},
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
		const json = async (response) => ({ status: response.status, body: await response.json() });
		const createDepartment = async (name, allowedUserIds) => {
			const response = await send('POST', '/api/support/departments', undefined, undefined, {
				name,
				type: 'todos',
				allowedUserIds,
			});
			assert.equal(response.status, 201);
			return response.json();
		};
		const department = await createDepartment('RF13 authorized', ['admin-1']);
		const foreignDepartment = await createDepartment('RF13 foreign', ['admin-2']);
		const createTicket = async (departmentId, requesterId, origin) => {
			const response = await send('POST', '/api/support/tickets', undefined, undefined, {
				subject: 'RF13 proof',
				requesterId,
				departmentId,
				priority: 'alta',
				origin,
				originRefId: 'ref-1',
				message: { message: 'Initial' },
			});
			assert.equal(response.status, 201);
			return response.json();
		};
		const ticket = await createTicket(department.id, 'owner-1', 'backoffice');
		const second = await createTicket(department.id, 'owner-1', 'cd');
		const foreign = await createTicket(foreignDepartment.id, 'owner-2', 'cd');
		const message = async (actor, role, visible, label, target = ticket.id) => {
			const response = await send(
				'POST',
				`/api/support/tickets/${target}/messages`,
				actor,
				role,
				{
					message: label,
					type: role,
					authorId: actor,
					isVisibleToRequester: visible,
				},
			);
			assert.equal(response.status, 201);
			return response.json();
		};
		const hidden = await message('admin-1', 'admin', false, 'internal');
		const publicAdmin = await message('admin-1', 'admin', true, 'public');
		await message('owner-1', 'cd', true, 'own');
		const update = await send(
			'PATCH',
			`/api/support/tickets/${ticket.id}`,
			'admin-1',
			'admin',
			{ adminStatus: 'em_andamento' },
		);
		assert.equal(update.status, 200);
		const tieCandidates = (
			await db.query(
				"SELECT id, action FROM ticket_audit_logs WHERE ticket_id=$1 AND (action='criacao_ticket' OR (action='alteracao_status' AND author_id='admin-1'))",
				[ticket.id],
			)
		).rows;
		assert.equal(tieCandidates.length, 2);
		for (const row of tieCandidates) {
			const fixedId =
				row.action === 'criacao_ticket'
					? 'ffffffff-ffff-4fff-8fff-000000000001'
					: 'ffffffff-ffff-4fff-8fff-000000000002';
			await db.query('UPDATE ticket_audit_logs SET id=$2 WHERE id=$1', [row.id, fixedId]);
		}
		const tieRows = (
			await db.query(
				'SELECT id, action FROM ticket_audit_logs WHERE id=ANY($1::uuid[]) ORDER BY id DESC',
				[['ffffffff-ffff-4fff-8fff-000000000001', 'ffffffff-ffff-4fff-8fff-000000000002']],
			)
		).rows;
		assert.deepEqual(
			tieRows.map((row) => row.action),
			['alteracao_status', 'criacao_ticket'],
		);
		await db.query(
			'UPDATE ticket_audit_logs SET datetime=$2::timestamp WHERE id=ANY($1::uuid[])',
			[tieRows.map((row) => row.id), '2099-01-01 00:00:00'],
		);
		await db.query('UPDATE departments SET active=false WHERE id=$1', [department.id]);
		const history = async (actor, role, query = '') =>
			json(await send('GET', `/api/support/tickets/history${query}`, actor, role));
		const tables = [
			'departments',
			'department_allowed_users',
			'tickets',
			'ticket_messages',
			'ticket_message_media',
			'ticket_audit_logs',
		];
		const snapshot = async () => {
			const result = {};
			for (const table of tables)
				result[table] = (
					await db.query(
						`SELECT row_to_json(t) AS row, xmin::text AS xmin FROM ${table} t ORDER BY row_to_json(t)::text`,
					)
				).rows;
			return result;
		};
		const before = await snapshot();
		const messageQueryLog = path.join(gateDir, 'message-queries');
		const messageQueriesBefore = fs.existsSync(messageQueryLog)
			? fs.readFileSync(messageQueryLog, 'utf8')
			: '';
		const adminHistory = await history('admin-1', 'admin');
		assert.equal(adminHistory.status, 200);
		assert.equal(adminHistory.body.pagination.total, 7);
		assert.deepEqual(
			adminHistory.body.data.slice(0, 2).map((row) => row.action),
			tieRows.map((row) => row.action),
			'datetime DESC, id DESC tie-breaker',
		);
		assert.deepEqual(
			adminHistory.body.data.slice(0, 2).map((row) => row.datetime),
			['2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'],
			'PostgreSQL timestamp without time zone must serialize as UTC in every process TZ',
		);
		assert.equal(
			adminHistory.body.data.filter(
				(row) => row.action === 'nova_mensagem' && row.origin === 'admin',
			).length,
			2,
		);
		assert.ok(adminHistory.body.data.every((row) => row.ticketId !== foreign.id));
		assert.ok(adminHistory.body.data.some((row) => row.ticketId === second.id));
		assert.ok(
			adminHistory.body.data.every((row) =>
				row.ticketId === ticket.id
					? row.number === ticket.number
					: row.ticketId === second.id && row.number === second.number,
			),
			'number must be projected from the joined Ticket',
		);
		assert.deepEqual(
			Object.keys(adminHistory.body.data[0]).sort(),
			[
				'ticketId',
				'number',
				'datetime',
				'authorId',
				'origin',
				'action',
				'statusType',
				'newStatus',
			].sort(),
		);
		const requester = await history('owner-1', 'cd');
		assert.equal(requester.body.pagination.total, 5);
		assert.ok(
			requester.body.data.every(
				(row) => row.origin !== 'admin' || row.action !== 'nova_mensagem',
			),
		);
		assert.ok(
			requester.body.data.some(
				(row) => row.action === 'nova_mensagem' && row.authorId === 'owner-1',
			),
		);
		assert.ok(requester.body.data.some((row) => row.action === 'alteracao_status'));
		assert.ok(requester.body.data.some((row) => row.action === 'criacao_ticket'));
		assert.deepEqual((await history('owner-1', 'backoffice')).body, requester.body);
		assert.equal(
			(await history('owner-1', 'cd', `?ticketId=${ticket.id}`)).body.pagination.total,
			4,
		);
		assert.equal(
			(await history('admin-1', 'admin', `?ticketId=${ticket.id}`)).body.pagination.total,
			6,
		);
		assert.equal((await history('owner-1', 'cd', `?ticketId=${foreign.id}`)).status, 403);
		assert.equal((await history('admin-1', 'admin', `?ticketId=${foreign.id}`)).status, 403);
		assert.equal((await history('owner-1', 'cd', `?ticketId=${randomUUID()}`)).status, 404);
		assert.equal((await history('owner-1', 'cd', '?ticketId=bad')).status, 422);
		assert.deepEqual((await history('nobody', 'admin')).body, {
			data: [],
			pagination: { page: 1, size: 20, total: 0, totalPages: 0 },
		});
		assert.deepEqual(
			(await history('owner-1', 'cd', `?ticketId=${ticket.id}&page=3&size=2`)).body,
			{ data: [], pagination: { page: 3, size: 2, total: 4, totalPages: 2 } },
		);
		const page = await history('owner-1', 'cd', `?ticketId=${ticket.id}&page=1&size=2`);
		assert.equal(page.body.pagination.total, 4);
		assert.equal(page.body.data.length, 2);
		const scoped = (await history('owner-1', 'cd', `?ticketId=${ticket.id}`)).body;
		const compactPages = [];
		for (let index = 1; index <= 4; index += 1) {
			const slice = (
				await history('owner-1', 'cd', `?ticketId=${ticket.id}&page=${index}&size=1`)
			).body;
			assert.deepEqual(slice.pagination, { page: index, size: 1, total: 4, totalPages: 4 });
			compactPages.push(...slice.data);
		}
		assert.deepEqual(
			compactPages,
			scoped.data,
			'hidden admin audits must create no pagination gaps',
		);
		assert.deepEqual(
			(await history('owner-1', 'cd', `?ticketId=${ticket.id}&page=5&size=1`)).body,
			{ data: [], pagination: { page: 5, size: 1, total: 4, totalPages: 4 } },
		);
		assert.ok(
			scoped.data.some(
				(row) =>
					row.action === 'nova_mensagem' &&
					row.authorId === 'owner-1' &&
					row.statusType === null &&
					row.newStatus === null,
			),
		);
		assert.ok(
			scoped.data.some(
				(row) =>
					row.action === 'criacao_ticket' &&
					row.statusType === null &&
					row.newStatus === null,
			),
		);
		assert.deepEqual(
			await snapshot(),
			before,
			'RF13 must preserve six tables and physical xmin',
		);
		const messageQueries = fs.existsSync(messageQueryLog)
			? fs.readFileSync(messageQueryLog, 'utf8')
			: '';
		const auditQueries = fs.readFileSync(path.join(gateDir, 'audit-queries'), 'utf8');
		assert.ok(auditQueries.includes('ticket_audit_logs'));
		assert.equal(
			messageQueries,
			messageQueriesBefore,
			'RF13 reads must never query TicketMessage',
		);
		for (const query of [
			'?page=0',
			'?size=101',
			'?page=1&page=2',
			'?action=nova_mensagem',
			'?ticketId=',
		])
			assert.equal((await history('admin-1', 'admin', query)).status, 422);
		for (const body of ['{}', 'null', '[]', 'text']) {
			const status = await new Promise((resolve, reject) => {
				const request = http.request(
					`${url}/api/support/tickets/history`,
					{
						method: 'GET',
						headers: {
							...headers(),
							'Content-Type': 'text/plain',
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
			assert.equal(status, 422);
		}
		assert.equal((await history('', 'admin')).status, 400);
		assert.equal((await history('admin-1', 'wrong')).status, 400);
		assert.equal(
			(
				await fetch(`${url}/api/support/tickets/history`, {
					headers: { ...headers(), 'X-Correlation-ID': 'bad' },
				})
			).status,
			400,
		);
		assert.deepEqual(await snapshot(), before, 'validation must not write');
		const visibility = await send(
			'PATCH',
			`/api/support/tickets/${ticket.id}/messages/${publicAdmin.id}/visibility`,
			'admin-1',
			'admin',
			{ isVisibleToRequester: false },
		);
		assert.equal(visibility.status, 200);
		const messageQueriesAfterRf11 = fs.existsSync(messageQueryLog)
			? fs.readFileSync(messageQueryLog, 'utf8')
			: '';
		assert.deepEqual(
			(await history('owner-1', 'cd')).body,
			requester.body,
			'RF11 must not change RF13 visibility',
		);
		assert.equal((await history('admin-1', 'admin')).body.pagination.total, 7);
		assert.equal(
			fs.existsSync(messageQueryLog) ? fs.readFileSync(messageQueryLog, 'utf8') : '',
			messageQueriesAfterRf11,
			'RF13 after RF11 must not inspect current Message visibility',
		);
		assert.ok(hidden.id && publicAdmin.id);
		const gated = async (label, actor, role, writer, increment) => {
			const previous = await history(actor, role);
			fs.writeFileSync(path.join(gateDir, 'arm'), label);
			const pending = history(actor, role);
			try {
				await waitFor(
					() => fs.existsSync(path.join(gateDir, 'paused')),
					`${label} count pause`,
				);
				fs.unlinkSync(path.join(gateDir, 'paused'));
				const writeResponse = await writer();
				assert.ok(
					[200, 201].includes(writeResponse.status),
					`${label} writer status ${writeResponse.status}`,
				);
			} finally {
				fs.writeFileSync(path.join(gateDir, 'resume'), 'resume');
			}
			const concurrent = await pending;
			assert.deepEqual(
				concurrent.body,
				previous.body,
				`${label} must see the pre-write snapshot for total and page`,
			);
			const later = await history(actor, role);
			assert.equal(later.body.pagination.total, previous.body.pagination.total + increment);
			console.log(
				JSON.stringify({
					concurrent: label,
					snapshotTotal: concurrent.body.pagination.total,
					laterTotal: later.body.pagination.total,
					deadlock: false,
				}),
			);
		};
		await gated(
			'RF13_x_RF10',
			'owner-1',
			'cd',
			() =>
				send('POST', `/api/support/tickets/${ticket.id}/messages`, 'owner-1', 'cd', {
					message: 'concurrent requester',
					type: 'cd',
					authorId: 'owner-1',
					isVisibleToRequester: true,
				}),
			2,
		);
		await gated(
			'RF13_x_RF06',
			'admin-1',
			'admin',
			() =>
				send('PATCH', `/api/support/tickets/${ticket.id}`, 'admin-1', 'admin', {
					adminStatus: 'finalizado',
				}),
			1,
		);
		await gated(
			'RF13_x_RF08',
			'owner-1',
			'cd',
			() => send('POST', `/api/support/tickets/${ticket.id}/resolve`, 'owner-1', 'cd'),
			1,
		);
		await gated(
			'RF13_x_RF11',
			'owner-1',
			'cd',
			() =>
				send(
					'PATCH',
					`/api/support/tickets/${ticket.id}/messages/${hidden.id}/visibility`,
					'admin-1',
					'admin',
					{ isVisibleToRequester: true },
				),
			0,
		);
		const beforeNoOps = await history('owner-1', 'cd');
		assert.equal(
			(
				await send('PATCH', `/api/support/tickets/${ticket.id}`, 'admin-1', 'admin', {
					adminStatus: 'finalizado',
				})
			).status,
			200,
		);
		assert.equal(
			(await send('POST', `/api/support/tickets/${ticket.id}/resolve`, 'owner-1', 'cd'))
				.status,
			200,
		);
		assert.deepEqual(
			(await history('owner-1', 'cd')).body,
			beforeNoOps.body,
			'RF06/RF08 no-op must add no audit',
		);
		const spec = await (await fetch(`${url}/api-docs-json`)).json();
		assert.ok(spec.paths['/api/support/tickets/history']?.get);
		assert.equal(spec.paths['/api/support/tickets/history'].get.requestBody, undefined);
		console.log(
			JSON.stringify({
				adminTotal: 7,
				requesterTotal: 5,
				readOnlyTables: tables,
				physicalXminEqual: true,
				noMessageVisibilityLookup: true,
				rf11Stable: true,
			}),
		);
		console.log(
			JSON.stringify({
				timezone: process.env.TZ ?? 'system',
				fixedDatetime: adminHistory.body.data[0].datetime,
				tiedActions: adminHistory.body.data.slice(0, 2).map((row) => row.action),
				compactPageCount: compactPages.length,
			}),
		);
		console.log('RF13 PostgreSQL compiled process, ACL, read-only and visibility proof OK');
	} finally {
		fs.rmSync(gateDir, { recursive: true, force: true });
		await stop(child);
		if (db) await db.end().catch(() => undefined);
		if (created) {
			await admin.query(
				'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
				[proof.database],
			);
			await admin.query(`DROP DATABASE ${quoted(proof.database)}`);
		}
		await admin.end().catch(() => undefined);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
