#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const pg = require('pg');
const { Client } = pg;
pg.defaults.parseInputDatesAsUTC = true;
pg.types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}Z`));
const root = require('node:path').resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required proof environment variable: ${name}`);
	return value;
}
function quoted(value) {
	return `"${value.replaceAll('"', '""')}"`;
}
async function ensurePortFree(port) {
	await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => server.close(resolve));
	});
}
async function stop(child) {
	if (!child || child.exitCode !== null) return;
	try {
		if (process.platform === 'win32') child.kill('SIGTERM');
		else process.kill(-child.pid, 'SIGTERM');
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
	await Promise.race([
		new Promise((resolve) => child.once('exit', resolve)),
		new Promise((resolve) => setTimeout(resolve, 5_000)),
	]);
	if (child.exitCode === null) {
		try {
			if (process.platform === 'win32') child.kill('SIGKILL');
			else process.kill(-child.pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
	}
}
async function waitFor(url) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).status === 200) return;
		} catch {
			/* retry */
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new Error(`Timed out waiting for ${url}`);
}
async function within(promise, label) {
	let timeout;
	try {
		return await Promise.race([
			promise,
			new Promise((_resolve, reject) => {
				timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
			}),
		]);
	} finally {
		clearTimeout(timeout);
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf08_[a-zA-Z0-9_]+$/);
	await ensurePortFree(proof.serverPort);
	const config = {
		host: proof.host,
		port: proof.port,
		user: proof.user,
		password: proof.password,
	};
	const admin = new Client({ ...config, database: proof.adminDatabase });
	let created = false;
	let inspection;
	let lockClient;
	let child;
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
				ownership: 'created by proof:rf08:postgres',
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
		const migration = spawnSync(npmCommand, ['run', 'migration:run:dist'], {
			cwd: root,
			env,
			encoding: 'utf8',
		});
		if (migration.status !== 0)
			throw new Error(`Migrations failed: ${migration.stdout}\n${migration.stderr}`);
		inspection = new Client({ ...config, database: proof.database });
		await inspection.connect();
		child = spawn(npmCommand, ['run', 'start'], {
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
			await waitFor(`${url}/health`);
			const headers = (actor, role) => ({
				'X-Correlation-ID': randomUUID(),
				...(actor ? { 'X-Performed-By': actor, 'X-Performed-By-Type': role } : {}),
			});
			const json = async (response) => response.json();
			const createDepartment = async (name) => {
				const response = await fetch(`${url}/api/support/departments`, {
					method: 'POST',
					headers: { ...headers(), 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, type: 'todos', allowedUserIds: ['admin-1'] }),
				});
				assert.equal(response.status, 201);
				return json(response);
			};
			let department = await createDepartment('RF08 department');
			const createTicket = async (label) => {
				const response = await fetch(`${url}/api/support/tickets`, {
					method: 'POST',
					headers: { ...headers(), 'Content-Type': 'application/json' },
					body: JSON.stringify({
						subject: label,
						requesterId: 'requester-1',
						departmentId: department.id,
						priority: 'alta',
						origin: 'backoffice',
						originRefId: 'ref-1',
						message: { message: 'Initial.' },
					}),
				});
				assert.equal(response.status, 201);
				return json(response);
			};
			const act = (action, id, body, actor = 'requester-1', role = 'cd') =>
				fetch(`${url}/api/support/tickets/${id}/${action}`, {
					method: 'POST',
					headers: {
						...headers(actor, role),
						...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
					},
					...(body === undefined ? {} : { body }),
				});
			const proposeResolution = async (id) =>
				assert.equal((await patch(id, { status: 'resolvido' })).status, 200);
			const patch = (id, body) =>
				fetch(`${url}/api/support/tickets/${id}`, {
					method: 'PATCH',
					headers: { ...headers('admin-1', 'admin'), 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
			const readTicket = async (id) =>
				(await inspection.query('SELECT * FROM tickets WHERE id=$1', [id])).rows[0];
			const readAudits = async (id) =>
				(
					await inspection.query(
						'SELECT action,origin,author_id,new_status,datetime FROM ticket_audit_logs WHERE ticket_id=$1 ORDER BY datetime,id',
						[id],
					)
				).rows;
			const snapshot = async (id) => ({
				ticket: await readTicket(id),
				audits: await readAudits(id),
				messages: (
					await inspection.query(
						'SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY id',
						[id],
					)
				).rows,
				media: (
					await inspection.query(
						'SELECT * FROM ticket_message_media WHERE ticket_message_id IN (SELECT id FROM ticket_messages WHERE ticket_id=$1) ORDER BY ticket_message_id,position',
						[id],
					)
				).rows,
			});

			const ticket = await createTicket('Effective approval');
			await proposeResolution(ticket.id);
			const before = await readTicket(ticket.id);
			let response = await act('approve', ticket.id);
			assert.equal(response.status, 200);
			const approved = await json(response);
			assert.deepEqual(
				Object.keys(approved).sort(),
				[
					'id',
					'number',
					'subject',
					'requesterId',
					'departmentId',
					'priority',
					'origin',
					'originRefId',
					'status',
					'createdAt',
					'updatedAt',
				].sort(),
			);
			assert.equal(approved.status, 'finalizado');
			assert.equal(approved.priority, 'alta');
			assert.equal(approved.departmentId, department.id);
			assert.ok(
				new Date(approved.updatedAt).getTime() > new Date(before.updated_at).getTime(),
				`updatedAt must advance: ${approved.updatedAt} > ${before.updated_at}`,
			);
			const approveAudit = (await readAudits(ticket.id))[2];
			assert.deepEqual(
				{
					action: approveAudit.action,
					newStatus: approveAudit.new_status,
					authorId: approveAudit.author_id,
					origin: approveAudit.origin,
				},
				{
					action: 'alteracao_status',
					newStatus: 'finalizado',
					authorId: 'requester-1',
					origin: 'cd',
				},
			);
			assert.equal(approveAudit.datetime.getTime(), new Date(approved.updatedAt).getTime());

			// Repeating a requester action is not an idempotent replay: finalizado is terminal.
			const beforeRepeat = await snapshot(ticket.id);
			response = await act('approve', ticket.id);
			assert.equal(response.status, 422);
			assert.equal((await json(response)).message, 'invalid_status_transition');
			assert.deepEqual(await snapshot(ticket.id), beforeRepeat);
			for (const action of ['reject', 'cancel']) {
				assert.equal((await act(action, ticket.id)).status, 422);
			}
			assert.deepEqual(await snapshot(ticket.id), beforeRepeat);

			for (const action of ['approve', 'reject', 'cancel']) {
				for (const [actor, role] of [
					['admin-1', 'admin'],
					['other', 'backoffice'],
				]) {
					assert.equal(
						(await act(action, ticket.id, undefined, actor, role)).status,
						403,
					);
				}
			}
			assert.deepEqual(await snapshot(ticket.id), beforeRepeat);

			for (const body of ['{}', 'null', '{"status":"resolvido"}']) {
				assert.equal((await act('approve', ticket.id, body)).status, 422);
			}
			for (const body of ['null', '[]', '{"mediaIds":["m"]}', '{"message":" "}', '{"x":1}']) {
				assert.equal((await act('reject', ticket.id, body)).status, 422);
			}
			assert.deepEqual(await snapshot(ticket.id), beforeRepeat);
			assert.equal((await act('approve', 'bad')).status, 422);
			assert.equal((await act('approve', randomUUID())).status, 404);

			const rejected = await createTicket('Reject with message');
			await proposeResolution(rejected.id);
			const beforeReject = await snapshot(rejected.id);
			response = await act(
				'reject',
				rejected.id,
				JSON.stringify({ message: 'Not solved', mediaIds: ['m', 'm'] }),
			);
			assert.equal(response.status, 200);
			assert.equal((await json(response)).status, 'pendente');
			const afterReject = await snapshot(rejected.id);
			assert.equal(afterReject.messages.length, beforeReject.messages.length + 1);
			assert.equal(afterReject.media.length, beforeReject.media.length + 2);
			assert.deepEqual(
				afterReject.audits
					.slice(beforeReject.audits.length)
					.map((item) => [item.action, item.new_status])
					.sort(([left], [right]) => left.localeCompare(right)),
				[
					['alteracao_status', 'pendente'],
					['nova_mensagem', null],
				],
			);
			const rejectMessage = afterReject.messages.find(
				(item) => item.message === 'Not solved',
			);
			assert.deepEqual(
				[
					rejectMessage.type,
					rejectMessage.author_id,
					rejectMessage.is_visible_to_requester,
				],
				['cd', 'requester-1', true],
			);
			const rejectedNoMessage = await createTicket('Reject without message');
			await proposeResolution(rejectedNoMessage.id);
			const beforeBare = await snapshot(rejectedNoMessage.id);
			assert.equal((await act('reject', rejectedNoMessage.id)).status, 200);
			const afterBare = await snapshot(rejectedNoMessage.id);
			assert.equal(afterBare.messages.length, beforeBare.messages.length);
			assert.equal(afterBare.audits.length, beforeBare.audits.length + 1);
			assert.equal((await readTicket(rejectedNoMessage.id)).status, 'pendente');

			const cancelled = await createTicket('Cancel');
			response = await act(
				'cancel',
				cancelled.id,
				JSON.stringify({ message: 'No longer needed' }),
			);
			assert.equal(response.status, 200);
			assert.equal((await json(response)).status, 'cancelado');
			assert.equal((await readAudits(cancelled.id)).length, 3);
			assert.equal((await act('cancel', cancelled.id)).status, 422);
			const cancelFromResolved = await createTicket('Cancel from resolvido');
			await proposeResolution(cancelFromResolved.id);
			assert.equal((await act('cancel', cancelFromResolved.id)).status, 422);
			assert.equal((await readTicket(cancelFromResolved.id)).status, 'resolvido');

			const historical = await createTicket('Inactive Department');
			await proposeResolution(historical.id);
			assert.equal(
				(
					await fetch(`${url}/api/support/departments/${department.id}`, {
						method: 'DELETE',
						headers: headers(),
					})
				).status,
				204,
			);
			assert.equal((await act('approve', historical.id)).status, 200);
			assert.equal((await readTicket(historical.id)).status, 'finalizado');
			department = await createDepartment('RF08 active for remaining scenarios');

			const rollback = await createTicket('Rollback');
			await proposeResolution(rollback.id);
			const beforeRollback = await snapshot(rollback.id);
			await inspection.query(`CREATE FUNCTION rf08_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'RF08 controlled audit failure'; END $$;
				CREATE TRIGGER rf08_reject_audit BEFORE INSERT ON ticket_audit_logs
				FOR EACH ROW EXECUTE FUNCTION rf08_reject_audit();`);
			assert.equal(
				(
					await act(
						'reject',
						rollback.id,
						JSON.stringify({ message: 'x', mediaIds: ['a'] }),
					)
				).status,
				500,
			);
			assert.deepEqual(await snapshot(rollback.id), beforeRollback);
			await inspection.query(
				'DROP TRIGGER rf08_reject_audit ON ticket_audit_logs; DROP FUNCTION rf08_reject_audit();',
			);

			const concurrent = await createTicket('cancel x cancel');
			lockClient = new Client({ ...config, database: proof.database });
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [
				concurrent.id,
			]);
			let finished = 0;
			const calls = [act('cancel', concurrent.id), act('cancel', concurrent.id)].map((item) =>
				item.then((response) => {
					finished += 1;
					return response;
				}),
			);
			await new Promise((done) => setTimeout(done, 200));
			assert.equal(finished, 0, 'both calls must wait for PostgreSQL Ticket lock');
			await lockClient.query('COMMIT');
			const results = await within(Promise.all(calls), 'cancel x cancel');
			assert.deepEqual(results.map((item) => item.status).sort(), [200, 422]);
			assert.equal((await readTicket(concurrent.id)).status, 'cancelado');
			const cancelAudits = (await readAudits(concurrent.id)).filter(
				(item) => item.action === 'alteracao_status',
			);
			assert.equal(cancelAudits.length, 1);
			assert.equal(
				(await readTicket(concurrent.id)).updated_at.getTime(),
				cancelAudits[0].datetime.getTime(),
			);
			await lockClient.end();
			lockClient = undefined;

			const mixed = await createTicket('PATCH x cancel');
			lockClient = new Client({ ...config, database: proof.database });
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [mixed.id]);
			finished = 0;
			const mixedCalls = [
				patch(mixed.id, { priority: 'urgente', status: 'resolvido' }),
				act('cancel', mixed.id),
			].map((item) =>
				item.then((response) => {
					finished += 1;
					return response;
				}),
			);
			await new Promise((done) => setTimeout(done, 200));
			assert.equal(finished, 0, 'PATCH and cancel must wait for PostgreSQL Ticket lock');
			await lockClient.query('COMMIT');
			const mixedResults = await within(Promise.all(mixedCalls), 'PATCH x cancel');
			// Admin PATCH always wins eventually; cancel only succeeds if it ran first.
			assert.equal(mixedResults[0].status, 200);
			assert.ok([200, 422].includes(mixedResults[1].status));
			assert.deepEqual(
				{
					priority: (await readTicket(mixed.id)).priority,
					status: (await readTicket(mixed.id)).status,
				},
				{ priority: 'urgente', status: 'resolvido' },
			);
			const mixedAudits = (await readAudits(mixed.id)).filter(
				(item) => item.action === 'alteracao_status',
			);
			assert.equal(mixedAudits.length, mixedResults[1].status === 200 ? 2 : 1);
			assert.equal(
				(await readTicket(mixed.id)).updated_at.getTime(),
				Math.max(...mixedAudits.map((item) => item.datetime.getTime())),
			);
			await lockClient.end();
			lockClient = undefined;

			const spec = await json(await fetch(`${url}/api-docs-json`));
			assert.equal(spec.paths['/api/support/tickets/{ticketId}/resolve'], undefined);
			assert.equal(
				spec.paths['/api/support/tickets/{ticketId}/approve'].post.requestBody,
				undefined,
			);
			for (const action of ['reject', 'cancel']) {
				assert.equal(
					spec.paths[`/api/support/tickets/{ticketId}/${action}`].post.requestBody
						.required,
					false,
				);
			}
			assert.ok(spec.paths['/api/support/tickets/{ticketId}'].get);
			assert.equal(
				(await inspection.query('SELECT count(*) FROM idempotency_keys')).rows[0].count,
				'0',
			);
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0)
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
		}
		console.log(
			'RF08 PostgreSQL compiled process, rollback, transitions, ACL, and Ticket lock concurrency proof OK',
		);
	} finally {
		await stop(child);
		if (lockClient) {
			await lockClient.query('ROLLBACK').catch(() => undefined);
			await lockClient.end().catch(() => undefined);
		}
		if (inspection) await inspection.end().catch(() => undefined);
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
