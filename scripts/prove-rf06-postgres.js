#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { Client } = require('pg');
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
function run(args, env) {
	const result = spawnSync(npmCommand, args, { cwd: root, env, encoding: 'utf8' });
	if (result.status !== 0)
		throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
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
				ownership: 'created by proof:rf06:postgres',
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
		run(['run', 'migration:run:dist'], env);
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
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
				...(actor ? { 'X-Performed-By': actor, 'X-Performed-By-Type': role } : {}),
			});
			const createDepartment = async (name, allowedUserIds) => {
				const response = await fetch(`${url}/api/support/departments`, {
					method: 'POST',
					headers: headers(),
					body: JSON.stringify({ name, type: 'todos', allowedUserIds }),
				});
				assert.equal(response.status, 201);
				return response.json();
			};
			const current = await createDepartment('RF06 current', ['admin-1']);
			const target = await createDepartment('RF06 target', ['admin-1']);
			const createdResponse = await fetch(`${url}/api/support/tickets`, {
				method: 'POST',
				headers: headers(),
				body: JSON.stringify({
					subject: 'RF06 ticket',
					requesterId: 'requester-1',
					departmentId: current.id,
					priority: 'alta',
					origin: 'backoffice',
					originRefId: 'ref-1',
					message: { message: 'Initial.' },
				}),
			});
			assert.equal(createdResponse.status, 201);
			const ticket = await createdResponse.json();
			const patch = (body, actor = 'admin-1', role = 'admin') =>
				fetch(`${url}/api/support/tickets/${ticket.id}`, {
					method: 'PATCH',
					headers: headers(actor, role),
					body: JSON.stringify(body),
				});
			const readTicket = async () =>
				(await inspection.query('SELECT * FROM tickets WHERE id=$1', [ticket.id])).rows[0];
			const readAudits = async () =>
				(
					await inspection.query(
						'SELECT action,origin,author_id,new_status FROM ticket_audit_logs WHERE ticket_id=$1 ORDER BY datetime',
						[ticket.id],
					)
				).rows;

			let response = await patch({ priority: 'urgente' });
			assert.equal(response.status, 200);
			assert.equal((await response.json()).priority, 'urgente');
			assert.equal((await readAudits()).length, 1);
			const beforeNoop = await readTicket();
			response = await patch({
				priority: 'urgente',
				status: 'pendente',
				departmentId: current.id,
			});
			assert.equal(response.status, 200);
			assert.equal(
				(await readTicket()).updated_at.getTime(),
				beforeNoop.updated_at.getTime(),
			);
			assert.equal((await readAudits()).length, 1);

			response = await patch({ status: 'resolvido' });
			assert.equal(response.status, 200);
			assert.equal((await response.json()).status, 'resolvido');
			assert.deepEqual((await readAudits())[1], {
				action: 'alteracao_status',
				origin: 'admin',
				author_id: 'admin-1',
				new_status: 'resolvido',
			});
			response = await patch({ departmentId: target.id }, 'requester-1', 'cd');
			assert.equal(response.status, 200);
			assert.equal((await readTicket()).department_id, target.id);
			response = await patch({ priority: 'media' }, 'other-admin', 'admin');
			assert.equal(response.status, 403);
			response = await patch({ priority: 'media' }, 'other-requester', 'backoffice');
			assert.equal(response.status, 403);
			response = await patch({ requesterStatus: 'resolvido' });
			assert.equal(response.status, 422);
			const beforeForbidden = await readTicket();
			response = await patch({ status: 'cancelado' }, 'requester-1', 'cd');
			assert.equal(response.status, 403);
			assert.deepEqual(await readTicket(), beforeForbidden);

			await inspection.query(`CREATE FUNCTION rf06_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'RF06 controlled audit failure'; END $$;
				CREATE TRIGGER rf06_reject_audit BEFORE INSERT ON ticket_audit_logs
				FOR EACH ROW EXECUTE FUNCTION rf06_reject_audit();`);
			const beforeFailure = await readTicket();
			response = await patch({ priority: 'baixa', status: 'finalizado' });
			assert.equal(response.status, 500);
			assert.deepEqual(await readTicket(), beforeFailure);
			assert.equal((await readAudits()).length, 2);
			await inspection.query(
				'DROP TRIGGER rf06_reject_audit ON ticket_audit_logs; DROP FUNCTION rf06_reject_audit();',
			);

			lockClient = new Client({ ...config, database: proof.database });
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [ticket.id]);
			let finished = false;
			const blocked = patch({ priority: 'baixa' }).then((item) => {
				finished = true;
				return item;
			});
			await new Promise((resolve) => setTimeout(resolve, 200));
			assert.equal(finished, false);
			await lockClient.query('COMMIT');
			response = await blocked;
			assert.equal(response.status, 200);
			await lockClient.end();
			lockClient = undefined;

			const third = await createDepartment('RF06 third', ['admin-1']);
			lockClient = new Client({ ...config, database: proof.database });
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('UPDATE departments SET active=false WHERE id=$1', [third.id]);
			finished = false;
			const blockedTarget = patch({ departmentId: third.id, status: 'finalizado' }).then(
				(item) => {
					finished = true;
					return item;
				},
			);
			await new Promise((resolve) => setTimeout(resolve, 200));
			assert.equal(finished, false);
			await lockClient.query('COMMIT');
			response = await blockedTarget;
			assert.equal(response.status, 422);
			assert.equal((await response.json()).message, 'department_inactive');
			assert.equal((await readTicket()).department_id, target.id);
			assert.equal((await readAudits()).length, 2);
			await lockClient.end();
			lockClient = undefined;

			const spec = await (await fetch(`${url}/api-docs-json`)).json();
			assert.ok(spec.paths['/api/support/tickets/{ticketId}']?.patch);
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
			'RF06 PostgreSQL compiled process, ACL, audit, rollback, locks, and revalidation proof OK',
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
