#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const required = (name) => {
	if (!process.env[name]) throw new Error(`Missing proof variable: ${name}`);
	return process.env[name];
};
const quoted = (value) => `"${value.replaceAll('"', '""')}"`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
	await Promise.race([exited, pause(5_000)]);
	if (child.exitCode === null && child.signalCode === null) {
		if (process.platform === 'win32') child.kill('SIGKILL');
		else process.kill(-child.pid, 'SIGKILL');
		await Promise.race([exited, pause(5_000)]);
	}
}
async function bounded(promise, name) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`${name} timed out`)), 15_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf11_[a-zA-Z0-9_]+$/);
	await freePort(proof.serverPort);
	const config = {
		host: proof.host,
		port: proof.port,
		user: proof.user,
		password: proof.password,
	};
	const admin = new Client({ ...config, database: proof.adminDatabase });
	let created = false;
	let db;
	let child;
	let gate;
	try {
		await admin.connect();
		assert.equal(
			(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [proof.database]))
				.rowCount,
			0,
			'proof DB must not already exist',
		);
		await admin.query(`CREATE DATABASE ${quoted(proof.database)}`);
		created = true;
		console.log(
			JSON.stringify({
				proofDatabase: proof.database,
				ownership: 'created by proof:rf11:postgres',
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
			env,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let logs = '';
		child.stdout.on('data', (data) => {
			logs += data;
		});
		child.stderr.on('data', (data) => {
			logs += data;
		});
		const url = `http://127.0.0.1:${proof.serverPort}`;
		let ready = false;
		for (let i = 0; i < 120; i += 1) {
			try {
				if ((await fetch(`${url}/health`)).status === 200) {
					ready = true;
					break;
				}
			} catch {
				/* retry */
			}
			await pause(250);
		}
		assert.ok(ready, `Compiled process not ready: ${logs}`);
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
		const messagePath = (ticketId, messageId) =>
			`/api/support/tickets/${ticketId}/messages/${messageId}/visibility`;
		const patch = (ticketId, messageId, visible, actor = 'admin-1', role = 'admin') =>
			send('PATCH', messagePath(ticketId, messageId), actor, role, {
				isVisibleToRequester: visible,
			});
		const createDepartment = async (name, allowedUserIds) => {
			const response = await send('POST', '/api/support/departments', undefined, undefined, {
				name,
				type: 'todos',
				allowedUserIds,
			});
			assert.equal(response.status, 201);
			return response.json();
		};
		const department = await createDepartment('RF11 proof', ['admin-1', 'admin-2']);
		const otherDepartment = await createDepartment('RF11 transfer', ['admin-2']);
		const createTicket = async (departmentId) => {
			const response = await send('POST', '/api/support/tickets', undefined, undefined, {
				subject: 'RF11 proof',
				requesterId: 'owner-1',
				departmentId,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				message: { message: 'Initial' },
			});
			assert.equal(response.status, 201);
			return response.json();
		};
		const ticket = await createTicket(department.id);
		const otherTicket = await createTicket(department.id);
		const initial = (
			await db.query('SELECT id FROM ticket_messages WHERE ticket_id=$1', [ticket.id])
		).rows[0];
		assert.ok(initial);
		const createMessage = async (ticketId, actor, role, visible = true, mediaIds = []) => {
			const response = await send(
				'POST',
				`/api/support/tickets/${ticketId}/messages`,
				actor,
				role,
				{
					message: 'RF11 target',
					type: role,
					authorId: actor,
					mediaIds,
					isVisibleToRequester: visible,
				},
			);
			assert.equal(response.status, 201);
			return response.json();
		};
		const message = await createMessage(ticket.id, 'admin-1', 'admin', true, [
			'media-a',
			'media-b',
			'media-a',
		]);
		const foreign = await createMessage(otherTicket.id, 'admin-1', 'admin');
		const requester = await createMessage(ticket.id, 'owner-1', 'backoffice');
		const cd = await createMessage(ticket.id, 'owner-1', 'cd');
		await db.query('CREATE TABLE rf11_update_probe (message_id uuid NOT NULL)');
		await db.query(
			'CREATE FUNCTION rf11_count_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO rf11_update_probe(message_id) VALUES (OLD.id); RETURN NEW; END; $$',
		);
		await db.query(
			'CREATE TRIGGER rf11_count BEFORE UPDATE ON ticket_messages FOR EACH ROW EXECUTE FUNCTION rf11_count_update()',
		);
		const snapshot = async () => ({
			ticket: (
				await db.query('SELECT xmin::text AS xmin, * FROM tickets WHERE id=$1', [ticket.id])
			).rows[0],
			message: (
				await db.query('SELECT xmin::text AS xmin, * FROM ticket_messages WHERE id=$1', [
					message.id,
				])
			).rows[0],
			media: (
				await db.query(
					'SELECT * FROM ticket_message_media WHERE ticket_message_id=$1 ORDER BY position',
					[message.id],
				)
			).rows,
			audits: (
				await db.query('SELECT * FROM ticket_audit_logs WHERE ticket_id=$1 ORDER BY id', [
					ticket.id,
				])
			).rows,
			updates: Number(
				(
					await db.query(
						'SELECT count(*) AS count FROM rf11_update_probe WHERE message_id=$1',
						[message.id],
					)
				).rows[0].count,
			),
		});
		const assertResponse = async (response, visible) => {
			assert.equal(response.status, 200);
			const body = await response.json();
			assert.deepEqual(
				Object.keys(body).sort(),
				[
					'id',
					'ticketId',
					'message',
					'type',
					'authorId',
					'mediaIds',
					'isVisibleToRequester',
					'createdAt',
				].sort(),
			);
			assert.equal(body.id, message.id);
			assert.equal(body.isVisibleToRequester, visible);
			assert.deepEqual(body.mediaIds, ['media-a', 'media-b', 'media-a']);
			return body;
		};
		let before = await snapshot();
		await assertResponse(await patch(ticket.id, message.id, false), false);
		let after = await snapshot();
		assert.equal(after.updates, before.updates + 1);
		assert.deepEqual(after.ticket, before.ticket);
		assert.deepEqual(after.media, before.media);
		assert.deepEqual(after.audits, before.audits);
		before = after;
		await assertResponse(await patch(ticket.id, message.id, true, 'admin-2'), true);
		after = await snapshot();
		assert.equal(after.updates, before.updates + 1);
		assert.deepEqual(after.ticket, before.ticket);
		assert.deepEqual(after.media, before.media);
		assert.deepEqual(after.audits, before.audits);
		before = after;
		await assertResponse(await patch(ticket.id, message.id, true), true);
		const noOpAfter = await snapshot();
		assert.deepEqual(
			noOpAfter,
			before,
			'no-op must preserve Message and Ticket xmin and all rows',
		);
		console.log(
			JSON.stringify({
				physicalNoOp: true,
				messageXminBefore: before.message.xmin,
				messageXminAfter: noOpAfter.message.xmin,
				ticketXminBefore: before.ticket.xmin,
				ticketXminAfter: noOpAfter.ticket.xmin,
				messageUpdatesBefore: before.updates,
				messageUpdatesAfter: noOpAfter.updates,
				mediaRows: noOpAfter.media.length,
				auditRows: noOpAfter.audits.length,
			}),
		);
		const invalid = [
			[() => patch(ticket.id, message.id, false, 'owner-1', 'backoffice'), 403],
			[() => patch(ticket.id, message.id, false, 'owner-1', 'cd'), 403],
			[() => patch(ticket.id, message.id, false, 'nonmember'), 403],
			[() => patch(ticket.id, foreign.id, false), 404],
			[() => patch(ticket.id, randomUUID(), false), 404],
			[() => patch(randomUUID(), message.id, false), 404],
			[() => patch(ticket.id, requester.id, false), 422],
			[() => patch(ticket.id, cd.id, false), 422],
			[() => patch(ticket.id, initial.id, false), 422],
			[() => patch('bad', message.id, false), 422],
			[() => patch(ticket.id, 'bad', false), 422],
			[() => send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin'), 422],
			[() => send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', {}), 422],
			[
				() => send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', null),
				422,
			],
			[() => send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', []), 422],
			[() => send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', 123), 422],
			[
				() =>
					send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', {
						visible: false,
					}),
				422,
			],
			[
				() =>
					send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', {
						isVisibleToRequester: 'false',
					}),
				422,
			],
			[
				() =>
					send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'admin', {
						isVisibleToRequester: false,
						extra: 1,
					}),
				422,
			],
			[
				() =>
					send(
						'PATCH',
						`${messagePath(ticket.id, message.id)}?foo=bar`,
						'admin-1',
						'admin',
						{ isVisibleToRequester: false },
					),
				422,
			],
			[
				() =>
					send('PATCH', messagePath(ticket.id, message.id), '', 'admin', {
						isVisibleToRequester: false,
					}),
				400,
			],
			[
				() =>
					send('PATCH', messagePath(ticket.id, message.id), 'admin-1', 'unknown', {
						isVisibleToRequester: false,
					}),
				400,
			],
			[
				() =>
					fetch(`${url}${messagePath(ticket.id, message.id)}`, {
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json',
							'X-Performed-By': 'admin-1',
							'X-Performed-By-Type': 'admin',
						},
						body: JSON.stringify({ isVisibleToRequester: false }),
					}),
				400,
			],
		];
		for (const [request, status] of invalid) assert.equal((await request()).status, status);
		assert.deepEqual(await snapshot(), before, 'rejected requests must not write');
		await db.query(
			"CREATE FUNCTION rf11_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RF11 injected failure'; END; $$",
		);
		await db.query(
			'CREATE TRIGGER rf11_reject BEFORE UPDATE ON ticket_messages FOR EACH ROW EXECUTE FUNCTION rf11_reject_update()',
		);
		try {
			assert.equal((await patch(ticket.id, message.id, false)).status, 500);
			assert.deepEqual(await snapshot(), before, 'failed update must roll back');
		} finally {
			await db.query('DROP TRIGGER rf11_reject ON ticket_messages');
			await db.query('DROP FUNCTION rf11_reject_update()');
		}
		console.log(
			JSON.stringify({
				rollback: 'message_update',
				http: 500,
				visibilityBefore: before.message.is_visible_to_requester,
				visibilityAfter: (await snapshot()).message.is_visible_to_requester,
				unchanged: true,
			}),
		);
		await db.query('UPDATE departments SET active=false WHERE id=$1', [department.id]);
		await assertResponse(await patch(ticket.id, message.id, false, 'admin-2'), false);
		await db.query('UPDATE departments SET active=true WHERE id=$1', [department.id]);
		const concurrent = async (name, requests, staggerMs = 0) => {
			gate = new Client({ ...config, database: proof.database });
			await gate.connect();
			await gate.query('BEGIN');
			await gate.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [ticket.id]);
			try {
				const pending = [];
				for (const request of requests) {
					pending.push(request());
					if (staggerMs) await pause(staggerMs);
				}
				await pause(150);
				await gate.query('COMMIT');
				const responses = await bounded(Promise.all(pending), name);
				console.log(
					JSON.stringify({
						concurrency: name,
						statuses: responses.map((r) => r.status),
						deadlock: false,
					}),
				);
				return responses;
			} finally {
				await gate.query('ROLLBACK').catch(() => undefined);
				await gate.end();
				gate = undefined;
			}
		};
		await assertResponse(await patch(ticket.id, message.id, true), true);
		before = await snapshot();
		let responses = await concurrent('RF11_same', [
			() => patch(ticket.id, message.id, false),
			() => patch(ticket.id, message.id, false, 'admin-2'),
		]);
		for (const response of responses) await assertResponse(response, false);
		after = await snapshot();
		assert.equal(after.updates, before.updates + 1, 'one physical update');
		assert.deepEqual(after.ticket, before.ticket);
		assert.deepEqual(after.audits, before.audits);
		await assertResponse(await patch(ticket.id, message.id, true), true);
		before = await snapshot();
		responses = await concurrent(
			'RF11_opposite',
			[
				() => patch(ticket.id, message.id, false),
				() => patch(ticket.id, message.id, true, 'admin-2'),
			],
			100,
		);
		const results = [];
		for (const response of responses) {
			assert.equal(response.status, 200);
			results.push(await response.json());
		}
		after = await snapshot();
		assert.ok([true, false].includes(after.message.is_visible_to_requester));
		assert.equal(results[0].isVisibleToRequester, false);
		assert.equal(results[1].isVisibleToRequester, true);
		assert.equal(after.message.is_visible_to_requester, true);
		assert.equal(after.updates, before.updates + 2);
		assert.ok(after.updates - before.updates >= 0 && after.updates - before.updates <= 2);
		assert.deepEqual(after.ticket, before.ticket);
		assert.deepEqual(after.audits, before.audits);
		if (!after.message.is_visible_to_requester)
			await assertResponse(await patch(ticket.id, message.id, true), true);
		before = await snapshot();
		responses = await concurrent('RF11_x_RF10', [
			() => patch(ticket.id, message.id, false),
			() =>
				send('POST', `/api/support/tickets/${ticket.id}/messages`, 'admin-1', 'admin', {
					message: 'Concurrent',
					type: 'admin',
					authorId: 'admin-1',
					mediaIds: ['x', 'x'],
					isVisibleToRequester: true,
				}),
		]);
		assert.equal(responses[0].status, 200);
		assert.equal(responses[1].status, 201);
		const added = await responses[1].json();
		after = await snapshot();
		assert.equal(after.message.is_visible_to_requester, false);
		assert.deepEqual(
			(
				await db.query(
					'SELECT media_id FROM ticket_message_media WHERE ticket_message_id=$1 ORDER BY position',
					[added.id],
				)
			).rows.map((row) => row.media_id),
			['x', 'x'],
		);
		// The admin message also writes a status audit when it finds the ticket pendente.
		assert.equal(
			after.audits.length,
			before.audits.length + (before.ticket.status === 'pendente' ? 2 : 1),
		);
		assert.ok(after.ticket.updated_at > before.ticket.updated_at);
		before = await snapshot();
		responses = await concurrent('RF11_x_cancel', [
			() => patch(ticket.id, message.id, true),
			() => send('POST', `/api/support/tickets/${ticket.id}/cancel`, 'owner-1', 'cd'),
		]);
		assert.deepEqual(
			responses.map((r) => r.status),
			[200, 200],
		);
		after = await snapshot();
		assert.equal(after.message.is_visible_to_requester, true);
		assert.equal(after.ticket.status, 'cancelado');
		assert.equal(after.audits.length, before.audits.length + 1);
		assert.ok(after.ticket.updated_at > before.ticket.updated_at);
		before = await snapshot();
		responses = await concurrent(
			'RF11_x_RF06_transfer',
			[
				() =>
					send('PATCH', `/api/support/tickets/${ticket.id}`, 'owner-1', 'backoffice', {
						departmentId: otherDepartment.id,
					}),
				() => patch(ticket.id, message.id, false),
			],
			100,
		);
		assert.deepEqual(
			responses.map((r) => r.status),
			[200, 403],
		);
		after = await snapshot();
		assert.equal(after.ticket.department_id, otherDepartment.id);
		assert.equal(after.message.is_visible_to_requester, before.message.is_visible_to_requester);
		assert.equal(after.audits.length, before.audits.length);
		assert.ok(after.ticket.updated_at > before.ticket.updated_at);
		assert.equal((await patch(ticket.id, message.id, false, 'admin-2')).status, 200);
		const spec = await (await fetch(`${url}/api-docs-json`)).json();
		assert.ok(
			spec.paths['/api/support/tickets/{ticketId}/messages/{messageId}/visibility']?.patch,
		);
		console.log(
			'RF11 PostgreSQL compiled process, no-op, rollback, ACL and concurrency proof OK',
		);
		const exitCode = child.exitCode;
		await stop(child);
		child = undefined;
		if (exitCode !== null && exitCode !== 0)
			throw new Error(`Compiled process exited unexpectedly: ${logs}`);
	} finally {
		await stop(child);
		if (gate) await gate.end().catch(() => undefined);
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
