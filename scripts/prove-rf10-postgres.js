#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const pg = require('pg');

pg.defaults.parseInputDatesAsUTC = true;
pg.types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}Z`));
const { Client } = pg;
const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing proof variable: ${name}`);
	return value;
}
function quoted(value) {
	return `"${value.replaceAll('"', '""')}"`;
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
	await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
	if (child.exitCode === null && child.signalCode === null) {
		try {
			if (process.platform === 'win32') child.kill('SIGKILL');
			else process.kill(-child.pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
		await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
	}
}
async function ready(url) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).status === 200) return;
		} catch {
			/* retry */
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}
async function bounded(promise, label) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf10_[a-zA-Z0-9_]+$/);
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
	let lock;
	let child;
	try {
		await admin.connect();
		assert.equal(
			(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [proof.database]))
				.rowCount,
			0,
			'proof DB must not exist',
		);
		await admin.query(`CREATE DATABASE ${quoted(proof.database)}`);
		created = true;
		console.log(
			JSON.stringify({
				proofDatabase: proof.database,
				ownership: 'created by proof:rf10:postgres',
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
		try {
			await ready(`${url}/health`);
			const headers = (actor, role) => ({
				'X-Correlation-ID': randomUUID(),
				...(actor ? { 'X-Performed-By': actor, 'X-Performed-By-Type': role } : {}),
			});
			const post = (id, actor, role, payload, suffix = '') =>
				fetch(`${url}/api/support/tickets/${id}/messages${suffix}`, {
					method: 'POST',
					headers: { ...headers(actor, role), 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				});
			const body = (actor, role, visible = true, mediaIds = []) => ({
				message: 'RF10 message',
				type: role,
				authorId: actor,
				mediaIds,
				isVisibleToRequester: visible,
			});
			const createdDepartment = await fetch(`${url}/api/support/departments`, {
				method: 'POST',
				headers: { ...headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'RF10 isolated',
					type: 'todos',
					allowedUserIds: ['admin-1'],
				}),
			});
			assert.equal(createdDepartment.status, 201);
			const department = await createdDepartment.json();
			const createdTicket = await fetch(`${url}/api/support/tickets`, {
				method: 'POST',
				headers: { ...headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'RF10 proof',
					requesterId: 'owner-1',
					departmentId: department.id,
					priority: 'alta',
					origin: 'backoffice',
					message: { message: 'Initial' },
				}),
			});
			assert.equal(createdTicket.status, 201);
			const ticket = await createdTicket.json();
			const snapshot = async () => ({
				ticket: (await db.query('SELECT * FROM tickets WHERE id=$1', [ticket.id])).rows,
				messages: (
					await db.query('SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY id', [
						ticket.id,
					])
				).rows,
				media: (
					await db.query(
						'SELECT * FROM ticket_message_media WHERE ticket_message_id IN (SELECT id FROM ticket_messages WHERE ticket_id=$1) ORDER BY ticket_message_id,position',
						[ticket.id],
					)
				).rows,
				audits: (
					await db.query(
						'SELECT * FROM ticket_audit_logs WHERE ticket_id=$1 ORDER BY id',
						[ticket.id],
					)
				).rows,
			});
			const assertDelta = (before, after, messages, media, audits) => {
				assert.equal(after.messages.length - before.messages.length, messages);
				assert.equal(after.media.length - before.media.length, media);
				assert.equal(after.audits.length - before.audits.length, audits);
				assert.ok(after.ticket[0].updated_at > before.ticket[0].updated_at);
			};
			let previous = await snapshot();
			for (const visible of [true, false]) {
				const response = await post(
					ticket.id,
					'admin-1',
					'admin',
					body('admin-1', 'admin', visible),
				);
				assert.equal(response.status, 201);
				const createdMessage = await response.json();
				assert.deepEqual(
					Object.keys(createdMessage).sort(),
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
				assert.equal(createdMessage.isVisibleToRequester, visible);
				const next = await snapshot();
				assertDelta(previous, next, 1, 0, 1);
				assert.equal(next.ticket[0].admin_status, previous.ticket[0].admin_status);
				assert.equal(next.ticket[0].requester_status, previous.ticket[0].requester_status);
				previous = next;
			}
			const requester = await post(
				ticket.id,
				'owner-1',
				'cd',
				body('owner-1', 'cd', true, ['a', 'b', 'a']),
			);
			assert.equal(requester.status, 201);
			const requesterMessage = await requester.json();
			assert.deepEqual(requesterMessage.mediaIds, ['a', 'b', 'a']);
			let next = await snapshot();
			assertDelta(previous, next, 1, 3, 2);
			assert.equal(next.ticket[0].admin_status, 'pendente');
			assert.deepEqual(
				next.media
					.filter((m) => m.ticket_message_id === requesterMessage.id)
					.map((m) => [m.position, m.media_id]),
				[
					[0, 'a'],
					[1, 'b'],
					[2, 'a'],
				],
			);
			assert.equal(next.audits.filter((a) => a.action === 'alteracao_status').length, 1);
			previous = next;
			assert.equal(
				(
					await post(
						ticket.id,
						'owner-1',
						'cd',
						body('owner-1', 'cd', true, ['a', 'b', 'a']),
					)
				).status,
				201,
			);
			next = await snapshot();
			assertDelta(previous, next, 1, 3, 2);
			assert.equal(
				next.audits.filter((a) => a.action === 'alteracao_status').length,
				2,
				'already pending must still audit',
			);
			previous = next;
			await db.query('UPDATE departments SET active=false WHERE id=$1', [department.id]);
			assert.equal(
				(await post(ticket.id, 'admin-1', 'admin', body('admin-1', 'admin', false))).status,
				201,
			);
			assert.equal(
				(await post(ticket.id, 'owner-1', 'backoffice', body('owner-1', 'backoffice')))
					.status,
				201,
			);
			previous = await snapshot();
			for (const [actor, role, payload, expected] of [
				['admin-2', 'admin', body('admin-2', 'admin'), 403],
				['other', 'cd', body('other', 'cd'), 403],
				['owner-1', 'cd', body('wrong', 'cd'), 422],
				['owner-1', 'cd', body('owner-1', 'admin'), 422],
				['owner-1', 'cd', body('owner-1', 'cd', false), 422],
				['owner-1', 'cd', { ...body('owner-1', 'cd'), message: '  ' }, 422],
				['owner-1', 'cd', { ...body('owner-1', 'cd'), mediaIds: ['ok', ' '] }, 422],
				['owner-1', 'cd', { ...body('owner-1', 'cd'), extra: 1 }, 422],
			])
				assert.equal((await post(ticket.id, actor, role, payload)).status, expected);
			assert.equal((await post('bad', 'owner-1', 'cd', body('owner-1', 'cd'))).status, 422);
			assert.equal(
				(await post(randomUUID(), 'owner-1', 'cd', body('owner-1', 'cd'))).status,
				404,
			);
			assert.equal(
				(await post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd'), '?foo=bar')).status,
				422,
			);
			assert.deepEqual(await snapshot(), previous);
			const spec = await (await fetch(`${url}/api-docs-json`)).json();
			const op = spec.paths['/api/support/tickets/{ticketId}/messages'].post;
			assert.deepEqual(Object.keys(op.responses).sort(), [
				'201',
				'400',
				'403',
				'404',
				'422',
				'500',
			]);
			assert.equal(op.requestBody.required, true);
			assert.deepEqual(spec.components.schemas.CreateTicketMessageRequest.required, [
				'message',
				'type',
				'authorId',
				'isVisibleToRequester',
			]);
			assert.equal(
				spec.components.schemas.CreateTicketMessageRequest.additionalProperties,
				false,
			);
			assert.deepEqual(
				Object.keys(spec.components.schemas.CreateTicketMessageRequest.properties).sort(),
				['message', 'type', 'authorId', 'mediaIds', 'isVisibleToRequester'].sort(),
			);
			assert.deepEqual(spec.components.schemas.TicketMessageType.enum, [
				'admin',
				'backoffice',
				'cd',
			]);
			assert.equal(
				op.responses['201'].content['application/json'].schema.$ref,
				'#/components/schemas/TicketMessage',
			);
			assert.deepEqual(
				Object.keys(spec.components.schemas.TicketMessage.properties).sort(),
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

			// Fault triggers live only in this newly created proof database.
			await db.query(
				`CREATE FUNCTION rf10_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RF10 injected failure'; END; $$`,
			);
			const fault = async (name, table, when, payload) => {
				const trigger = `rf10_${name}`;
				await db.query(
					`CREATE TRIGGER ${trigger} BEFORE ${when} ON ${table} FOR EACH ROW EXECUTE FUNCTION rf10_reject()`,
				);
				try {
					const before = await snapshot();
					assert.equal((await post(ticket.id, 'owner-1', 'cd', payload)).status, 500);
					assert.deepEqual(await snapshot(), before, `${name} must roll back all tables`);
					console.log(
						JSON.stringify({
							rollback: name,
							http: 500,
							message: 0,
							media: 0,
							ticket: 'unchanged',
							audits: 0,
						}),
					);
				} finally {
					await db.query(`DROP TRIGGER ${trigger} ON ${table}`);
				}
			};
			await fault(
				'media',
				'ticket_message_media',
				'INSERT',
				body('owner-1', 'cd', true, ['media']),
			);
			await fault('ticket', 'tickets', 'UPDATE', body('owner-1', 'cd', true, ['media']));
			await db.query(
				`CREATE TRIGGER rf10_first_audit BEFORE INSERT ON ticket_audit_logs FOR EACH ROW WHEN (NEW.action = 'nova_mensagem') EXECUTE FUNCTION rf10_reject()`,
			);
			try {
				const before = await snapshot();
				assert.equal(
					(await post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd', true, ['media'])))
						.status,
					500,
				);
				assert.deepEqual(await snapshot(), before);
				console.log(
					JSON.stringify({
						rollback: 'first_audit',
						http: 500,
						message: 0,
						media: 0,
						ticket: 'unchanged',
						audits: 0,
					}),
				);
			} finally {
				await db.query('DROP TRIGGER rf10_first_audit ON ticket_audit_logs');
			}
			await db.query(
				`CREATE TRIGGER rf10_second_audit BEFORE INSERT ON ticket_audit_logs FOR EACH ROW WHEN (NEW.action = 'alteracao_status') EXECUTE FUNCTION rf10_reject()`,
			);
			try {
				const before = await snapshot();
				assert.equal(
					(await post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd', true, ['media'])))
						.status,
					500,
				);
				assert.deepEqual(await snapshot(), before);
				console.log(
					JSON.stringify({
						rollback: 'second_audit',
						http: 500,
						message: 0,
						media: 0,
						ticket: 'unchanged',
						audits: 0,
					}),
				);
			} finally {
				await db.query('DROP TRIGGER rf10_second_audit ON ticket_audit_logs');
			}
			await db.query('DROP FUNCTION rf10_reject()');

			const concurrent = async (
				name,
				requests,
				expectedMessages,
				expectedAudits,
				expectedStatuses = [201, 201],
				expectedMedia = 0,
			) => {
				const before = await snapshot();
				lock = new Client({ ...config, database: proof.database });
				await lock.connect();
				await lock.query('BEGIN');
				await lock.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [ticket.id]);
				try {
					const pending = requests.map((send) => send());
					await new Promise((resolve) => setTimeout(resolve, 150));
					await lock.query('COMMIT');
					const responses = await bounded(Promise.all(pending), name);
					assert.deepEqual(
						responses.map((response) => response.status),
						expectedStatuses,
					);
					const after = await snapshot();
					assertDelta(before, after, expectedMessages, expectedMedia, expectedAudits);
					const previousMessageIds = new Set(
						before.messages.map((message) => message.id),
					);
					const newMessages = after.messages.filter(
						(message) => !previousMessageIds.has(message.id),
					);
					assert.equal(
						new Set(newMessages.map((message) => message.id)).size,
						expectedMessages,
					);
					if (name === 'RF10_requester_x_requester') {
						const previousMediaKeys = new Set(
							before.media.map(
								(media) => `${media.ticket_message_id}:${media.position}`,
							),
						);
						const newMedia = after.media.filter(
							(media) =>
								!previousMediaKeys.has(
									`${media.ticket_message_id}:${media.position}`,
								),
						);
						assert.deepEqual(newMedia.map((media) => media.media_id).sort(), [
							'left',
							'right',
						]);
						assert.deepEqual(
							new Set(newMedia.map((media) => media.ticket_message_id)),
							new Set(newMessages.map((message) => message.id)),
						);
						for (const [role, mediaId] of [
							['cd', 'left'],
							['backoffice', 'right'],
						]) {
							const message = newMessages.find(
								(candidate) => candidate.type === role,
							);
							assert.ok(message);
							assert.deepEqual(
								newMedia
									.filter((media) => media.ticket_message_id === message.id)
									.map((media) => [media.position, media.media_id]),
								[[0, mediaId]],
							);
						}
					}
					if (name === 'RF10_requester_x_requester' || name === 'RF10_admin_x_admin') {
						assert.equal(
							after.ticket[0].updated_at.getTime(),
							Math.max(...newMessages.map((message) => message.created_at.getTime())),
						);
						const previousAuditIds = new Set(before.audits.map((audit) => audit.id));
						const newAudits = after.audits.filter(
							(audit) => !previousAuditIds.has(audit.id),
						);
						const actions = newAudits.map((audit) => audit.action).sort();
						assert.deepEqual(
							actions,
							name === 'RF10_requester_x_requester'
								? [
										'alteracao_status',
										'alteracao_status',
										'nova_mensagem',
										'nova_mensagem',
									]
								: ['nova_mensagem', 'nova_mensagem'],
						);
						if (name === 'RF10_requester_x_requester') {
							for (const audit of newAudits.filter(
								(entry) => entry.action === 'alteracao_status',
							)) {
								assert.equal(audit.status_type, 'admin');
								assert.equal(audit.new_status, 'pendente');
							}
							assert.equal(after.ticket[0].admin_status, 'pendente');
						} else {
							assert.equal(
								after.ticket[0].admin_status,
								before.ticket[0].admin_status,
							);
						}
					}
					console.log(
						JSON.stringify({
							concurrency: name,
							statuses: responses.map((r) => r.status),
							messages: expectedMessages,
							media: expectedMedia,
							audits: expectedAudits,
							adminStatus: after.ticket[0].admin_status,
							requesterStatus: after.ticket[0].requester_status,
							deadlock: false,
						}),
					);
					return after;
				} finally {
					await lock.query('ROLLBACK').catch(() => undefined);
					await lock.end().catch(() => undefined);
					lock = undefined;
				}
			};
			await concurrent(
				'RF10_requester_x_requester',
				[
					() => post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd', true, ['left'])),
					() =>
						post(
							ticket.id,
							'owner-1',
							'backoffice',
							body('owner-1', 'backoffice', true, ['right']),
						),
				],
				2,
				4,
				[201, 201],
				2,
			);
			await concurrent(
				'RF10_admin_x_admin',
				[
					() => post(ticket.id, 'admin-1', 'admin', body('admin-1', 'admin', true)),
					() => post(ticket.id, 'admin-1', 'admin', body('admin-1', 'admin', false)),
				],
				2,
				2,
			);
			const beforeMixed = await snapshot();
			const rf06 = () =>
				fetch(`${url}/api/support/tickets/${ticket.id}`, {
					method: 'PATCH',
					headers: { ...headers('admin-1', 'admin'), 'Content-Type': 'application/json' },
					body: JSON.stringify({ adminStatus: 'finalizado' }),
				});
			const mixed = await concurrent(
				'RF10_x_RF06',
				[() => post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd')), rf06],
				1,
				3,
				[201, 200],
			);
			assert.ok(['pendente', 'finalizado'].includes(mixed.ticket[0].admin_status));
			assert.equal(mixed.ticket[0].requester_status, beforeMixed.ticket[0].requester_status);
			const rf08 = () =>
				fetch(`${url}/api/support/tickets/${ticket.id}/resolve`, {
					method: 'POST',
					headers: headers('owner-1', 'cd'),
				});
			const beforeResolve = await snapshot();
			const combined = await concurrent(
				'RF10_x_RF08',
				[() => post(ticket.id, 'owner-1', 'cd', body('owner-1', 'cd')), rf08],
				1,
				beforeResolve.ticket[0].requester_status === 'resolvido' ? 2 : 3,
				[201, 200],
			);
			assert.equal(combined.ticket[0].admin_status, 'pendente');
			assert.equal(combined.ticket[0].requester_status, 'resolvido');
			console.log(
				'RF10 PostgreSQL compiled process, atomicity, ACL, audit cardinality, rollback and concurrency proof OK',
			);
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0)
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
		}
	} finally {
		await stop(child);
		if (lock) await lock.end().catch(() => undefined);
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
