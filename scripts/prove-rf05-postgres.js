#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { Client } = require('pg');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = require('node:path').resolve(__dirname, '..');

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required proof environment variable: ${name}`);
	return value;
}

function quoted(value) {
	return `"${value.replaceAll('"', '""')}"`;
}

function run(args, env) {
	const result = spawnSync(npmCommand, args, { cwd: root, env, encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
	}
}

function ensurePortFree(port) {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => server.close(resolve));
	});
}

async function stop(child) {
	if (child.exitCode !== null) return;
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
	let lastError;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.status === 200) return response;
			lastError = new Error(`status ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Timed out waiting for ${url}: ${lastError?.message}`);
}

async function withTimeout(promise, label, timeoutMs = 15_000) {
	let timeout;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

async function json(response) {
	return response.json();
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_[a-zA-Z0-9_]+$/);
	await ensurePortFree(proof.serverPort);

	const admin = new Client({
		host: proof.host,
		port: proof.port,
		user: proof.user,
		password: proof.password,
		database: proof.adminDatabase,
	});
	let created = false;
	let child;
	let inspection;
	let lockClient;
	try {
		await admin.connect();
		assert.equal(
			(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [proof.database]))
				.rowCount,
			0,
		);
		await admin.query(`CREATE DATABASE ${quoted(proof.database)}`);
		created = true;

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
		const connection = {
			host: proof.host,
			port: proof.port,
			user: proof.user,
			password: proof.password,
			database: proof.database,
		};
		console.log(
			JSON.stringify({
				proofDatabase: proof.database,
				host: proof.host,
				port: proof.port,
				ownership: 'created by proof:rf05:postgres',
			}),
		);

		run(['run', 'migration:run:dist'], env);
		run(['run', 'migration:run:dist'], env);
		inspection = new Client(connection);
		await inspection.connect();
		const expectedTables = [
			'department_allowed_users',
			'departments',
			'idempotency_keys',
			'migrations',
			'ticket_audit_logs',
			'ticket_message_media',
			'ticket_messages',
			'tickets',
		];
		assert.deepEqual(
			(
				await inspection.query(
					'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name',
				)
			).rows.map((row) => row.table_name),
			expectedTables,
		);
		assert.deepEqual(
			(
				await inspection.query(
					`SELECT conrelid::regclass::text AS table_name, confrelid::regclass::text AS referenced_table
					 FROM pg_constraint
					 WHERE contype = 'f' AND conrelid::regclass::text LIKE 'ticket%'
					 ORDER BY table_name`,
				)
			).rows,
			[
				{ table_name: 'ticket_audit_logs', referenced_table: 'tickets' },
				{ table_name: 'ticket_message_media', referenced_table: 'ticket_messages' },
				{ table_name: 'ticket_messages', referenced_table: 'tickets' },
				{ table_name: 'tickets', referenced_table: 'departments' },
			],
		);
		assert.equal(
			(
				await inspection.query(
					`SELECT count(*) FROM pg_constraint WHERE conrelid = 'tickets'::regclass AND contype = 'u'`,
				)
			).rows[0].count,
			'1',
		);
		const sequence = (
			await inspection.query(
				`SELECT start_value, increment_by FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'tickets_number_seq'`,
			)
		).rows[0];
		assert.deepEqual([sequence.start_value, sequence.increment_by], ['1', '1']);

		// A migration mais recente (origin_ref_id) é revertida antes das tabelas de Ticket.
		run(['run', 'migration:revert:dist'], env);
		run(['run', 'migration:revert:dist'], env);
		assert.deepEqual(
			(
				await inspection.query(
					'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name',
				)
			).rows.map((row) => row.table_name),
			['department_allowed_users', 'departments', 'idempotency_keys', 'migrations'],
		);
		assert.equal(
			(
				await inspection.query(
					`SELECT count(*) FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'tickets_number_seq'`,
				)
			).rows[0].count,
			'0',
		);
		run(['run', 'migration:run:dist'], env);

		child = spawn(npmCommand, ['run', 'start'], {
			cwd: root,
			env,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let logs = '';
		child.stdout.on('data', (chunk) => (logs += chunk));
		child.stderr.on('data', (chunk) => (logs += chunk));
		const baseUrl = `http://127.0.0.1:${proof.serverPort}`;
		const headers = () => ({
			'Content-Type': 'application/json',
			'X-Correlation-ID': randomUUID(),
		});
		const createDepartment = async (name) => {
			const response = await fetch(`${baseUrl}/api/support/departments`, {
				method: 'POST',
				headers: headers(),
				body: JSON.stringify({ name, type: 'todos' }),
			});
			assert.equal(response.status, 201);
			return json(response);
		};
		const createTicket = (departmentId, overrides = {}) =>
			fetch(`${baseUrl}/api/support/tickets`, {
				method: 'POST',
				headers: headers(),
				body: JSON.stringify({
					subject: 'Ticket RF05',
					requesterId: 'uid-requester-rf05',
					departmentId,
					priority: 'alta',
					origin: 'cd',
					originRefId: 'ref-1',
					message: {
						message: 'Mensagem inicial RF05',
						mediaIds: ['media-A', 'media-A', 'media-B'],
					},
					...overrides,
				}),
			});

		try {
			assert.equal((await json(await waitFor(`${baseUrl}/health`))).database, true);
			const department = await createDepartment('Atendimento RF05');
			const response = await createTicket(department.id);
			assert.equal(response.status, 201);
			assert.equal(response.headers.get('location'), null);
			const ticket = await json(response);
			assert.match(ticket.id, /^[0-9a-f-]{36}$/i);
			assert.deepEqual(Object.keys(ticket).sort(), [
				'adminStatus',
				'createdAt',
				'departmentId',
				'id',
				'number',
				'origin',
				'originRefId',
				'priority',
				'requesterId',
				'requesterStatus',
				'subject',
				'updatedAt',
			]);
			assert.equal(ticket.number, 1);
			assert.equal(ticket.adminStatus, 'pendente');
			assert.equal(ticket.requesterStatus, 'nao_resolvido');
			assert.equal(ticket.createdAt, ticket.updatedAt);
			const persistedTicket = (
				await inspection.query('SELECT * FROM tickets WHERE id = $1', [ticket.id])
			).rows[0];
			assert.deepEqual(
				[
					persistedTicket.number,
					persistedTicket.department_id,
					persistedTicket.priority,
					persistedTicket.origin,
					persistedTicket.admin_status,
					persistedTicket.requester_status,
				],
				[1, department.id, 'alta', 'cd', 'pendente', 'nao_resolvido'],
			);
			const message = (
				await inspection.query('SELECT * FROM ticket_messages WHERE ticket_id = $1', [
					ticket.id,
				])
			).rows[0];
			assert.deepEqual(
				[message.message, message.type, message.author_id, message.is_visible_to_requester],
				['Mensagem inicial RF05', 'cd', 'uid-requester-rf05', true],
			);
			assert.deepEqual(
				(
					await inspection.query(
						'SELECT position, media_id FROM ticket_message_media WHERE ticket_message_id = $1 ORDER BY position',
						[message.id],
					)
				).rows.map((row) => [row.position, row.media_id]),
				[
					[0, 'media-A'],
					[1, 'media-A'],
					[2, 'media-B'],
				],
			);
			assert.deepEqual(
				(
					await inspection.query(
						'SELECT author_id, origin, action, status_type, new_status FROM ticket_audit_logs WHERE ticket_id = $1',
						[ticket.id],
					)
				).rows,
				[
					{
						author_id: 'uid-requester-rf05',
						origin: 'cd',
						action: 'criacao_ticket',
						status_type: null,
						new_status: null,
					},
				],
			);

			const noMediaResponse = await createTicket(department.id, {
				subject: 'Sem mídia',
				message: { message: 'Mensagem sem mídia.' },
			});
			assert.equal(noMediaResponse.status, 201);
			const noMediaTicket = await json(noMediaResponse);
			assert.equal(
				(
					await inspection.query(
						`SELECT count(*) FROM ticket_message_media media
						 JOIN ticket_messages message ON message.id = media.ticket_message_id
						 WHERE message.ticket_id = $1`,
						[noMediaTicket.id],
					)
				).rows[0].count,
				'0',
			);

			const missingDepartment = await createTicket(randomUUID());
			assert.equal(missingDepartment.status, 404);
			const inactive = await createDepartment('Inativo RF05');
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/${inactive.id}`, {
						method: 'DELETE',
						headers: { 'X-Correlation-ID': randomUUID() },
					})
				).status,
				204,
			);
			const inactiveResponse = await createTicket(inactive.id);
			assert.equal(inactiveResponse.status, 422);
			assert.equal((await json(inactiveResponse)).message, 'department_inactive');
			assert.equal(
				(
					await inspection.query(
						'SELECT count(*) FROM tickets WHERE department_id = $1',
						[inactive.id],
					)
				).rows[0].count,
				'0',
			);

			const counts = async () =>
				(
					await inspection.query(`
						SELECT
							(SELECT count(*) FROM tickets) AS tickets,
							(SELECT count(*) FROM ticket_messages) AS messages,
							(SELECT count(*) FROM ticket_message_media) AS media,
							(SELECT count(*) FROM ticket_audit_logs) AS audits`)
				).rows[0];
			const beforeMessageFailure = await counts();
			await inspection.query(`
				CREATE FUNCTION rf05_reject_message() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'RF05 controlled message failure'; END $$;
				CREATE TRIGGER rf05_reject_message BEFORE INSERT ON ticket_messages
				FOR EACH ROW EXECUTE FUNCTION rf05_reject_message();`);
			assert.equal(
				(await createTicket(department.id, { subject: 'Falha Message' })).status,
				500,
			);
			assert.deepEqual(await counts(), beforeMessageFailure);
			await inspection.query(`
				DROP TRIGGER rf05_reject_message ON ticket_messages;
				DROP FUNCTION rf05_reject_message();`);

			const beforeAuditFailure = await counts();
			await inspection.query(`
				CREATE FUNCTION rf05_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'RF05 controlled audit failure'; END $$;
				CREATE TRIGGER rf05_reject_audit BEFORE INSERT ON ticket_audit_logs
				FOR EACH ROW EXECUTE FUNCTION rf05_reject_audit();`);
			assert.equal(
				(await createTicket(department.id, { subject: 'Falha Audit' })).status,
				500,
			);
			assert.deepEqual(await counts(), beforeAuditFailure);
			const consumedNumber = Number(
				(await inspection.query('SELECT last_value FROM tickets_number_seq')).rows[0]
					.last_value,
			);
			await inspection.query(`
				DROP TRIGGER rf05_reject_audit ON ticket_audit_logs;
				DROP FUNCTION rf05_reject_audit();`);
			const afterRollback = await createTicket(department.id, { subject: 'Após rollback' });
			assert.equal(afterRollback.status, 201);
			const afterRollbackTicket = await json(afterRollback);
			assert.equal(afterRollbackTicket.number, consumedNumber + 1);
			assert.ok(afterRollbackTicket.number > noMediaTicket.number + 1);

			const parallelResponses = await withTimeout(
				Promise.all(
					Array.from({ length: 8 }, (_, index) =>
						createTicket(department.id, { subject: `Paralelo ${index}` }),
					),
				),
				'parallel RF05 creates',
			);
			assert.deepEqual(
				parallelResponses.map((item) => item.status),
				Array(8).fill(201),
			);
			const parallelTickets = await Promise.all(parallelResponses.map(json));
			const parallelNumbers = parallelTickets.map((item) => item.number);
			assert.equal(new Set(parallelNumbers).size, 8);
			const sortedParallelNumbers = [...parallelNumbers].sort((a, b) => a - b);
			assert.ok(
				sortedParallelNumbers.every(
					(value, index) =>
						value > 0 && (!index || value === sortedParallelNumbers[index - 1] + 1),
				),
			);

			const raceA = await createDepartment('Race A');
			await inspection.query(`
				CREATE FUNCTION rf05_delay_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN
					IF NEW.subject = 'Race A ticket' THEN PERFORM pg_sleep(0.75); END IF;
					RETURN NEW;
				END $$;
				CREATE TRIGGER rf05_delay_ticket BEFORE INSERT ON tickets
				FOR EACH ROW EXECUTE FUNCTION rf05_delay_ticket();`);
			const raceATicketPromise = createTicket(raceA.id, { subject: 'Race A ticket' });
			await new Promise((resolve) => setTimeout(resolve, 250));
			let raceADeleteFinished = false;
			const raceADeletePromise = fetch(`${baseUrl}/api/support/departments/${raceA.id}`, {
				method: 'DELETE',
				headers: { 'X-Correlation-ID': randomUUID() },
			}).then((value) => {
				raceADeleteFinished = true;
				return value;
			});
			await new Promise((resolve) => setTimeout(resolve, 200));
			assert.equal(raceADeleteFinished, false);
			const [raceATicketResponse, raceADeleteResponse] = await withTimeout(
				Promise.all([raceATicketPromise, raceADeletePromise]),
				'RF05 then RF04 serialization',
			);
			assert.equal(raceATicketResponse.status, 201);
			assert.equal(raceADeleteResponse.status, 204);
			const raceATicket = await json(raceATicketResponse);
			assert.deepEqual(
				(
					await inspection.query(
						`SELECT department.active, ticket.id AS ticket_id
						 FROM departments department JOIN tickets ticket ON ticket.department_id = department.id
						 WHERE department.id = $1 AND ticket.id = $2`,
						[raceA.id, raceATicket.id],
					)
				).rows.map((row) => [row.active, row.ticket_id]),
				[[false, raceATicket.id]],
			);
			await inspection.query(`
				DROP TRIGGER rf05_delay_ticket ON tickets;
				DROP FUNCTION rf05_delay_ticket();`);

			const raceB = await createDepartment('Race B');
			lockClient = new Client(connection);
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('UPDATE departments SET active = false WHERE id = $1', [
				raceB.id,
			]);
			let raceBTicketFinished = false;
			const raceBTicketPromise = createTicket(raceB.id, { subject: 'Race B ticket' }).then(
				(value) => {
					raceBTicketFinished = true;
					return value;
				},
			);
			await new Promise((resolve) => setTimeout(resolve, 200));
			assert.equal(raceBTicketFinished, false);
			await lockClient.query('COMMIT');
			await lockClient.end();
			lockClient = undefined;
			const raceBResponse = await withTimeout(
				raceBTicketPromise,
				'RF04 then RF05 serialization',
			);
			assert.equal(raceBResponse.status, 422);
			assert.equal((await json(raceBResponse)).message, 'department_inactive');
			assert.equal(
				(
					await inspection.query(
						'SELECT count(*) FROM tickets WHERE department_id = $1',
						[raceB.id],
					)
				).rows[0].count,
				'0',
			);

			const regression = await createDepartment('Regressão RF01-RF04');
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/${regression.id}`, {
						method: 'PATCH',
						headers: headers(),
						body: JSON.stringify({ name: 'Regressão atualizada' }),
					})
				).status,
				200,
			);
			const listed = await fetch(`${baseUrl}/api/support/departments?type=todos`, {
				headers: { 'X-Correlation-ID': randomUUID() },
			});
			assert.equal(listed.status, 200);
			assert.ok((await json(listed)).data.some((item) => item.id === regression.id));
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/${regression.id}`, {
						method: 'DELETE',
						headers: { 'X-Correlation-ID': randomUUID() },
					})
				).status,
				204,
			);

			const spec = await json(await fetch(`${baseUrl}/api-docs-json`));
			assert.ok(spec.paths['/api/support/tickets']?.post);
			assert.ok(spec.paths['/api/support/tickets'].post.responses['201']);
			assert.equal((await fetch(`${baseUrl}/api-docs`)).status, 200);
			assert.equal(
				(await inspection.query('SELECT count(*) FROM idempotency_keys')).rows[0].count,
				'0',
			);
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0) {
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
			}
		}

		console.log(
			'RF05 PostgreSQL schema, aggregate, rollback, sequence, concurrency, regressions, and compiled process proof OK',
		);
	} finally {
		if (child) await stop(child);
		if (lockClient) {
			await lockClient.query('ROLLBACK').catch(() => undefined);
			await lockClient.end().catch(() => undefined);
		}
		if (inspection) await inspection.end().catch(() => undefined);
		if (created) {
			await admin.query(
				'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
				[proof.database],
			);
			await admin.query(`DROP DATABASE ${quoted(proof.database)} WITH (FORCE)`);
			console.log(
				JSON.stringify({ proofDatabase: proof.database, cleanup: 'dropped by owner' }),
			);
		}
		await admin.end();
	}
}

main().catch((error) => {
	console.error(error.stack ?? error);
	process.exitCode = 1;
});
