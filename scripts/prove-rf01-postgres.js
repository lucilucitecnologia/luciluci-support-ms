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
	if (result.status !== 0)
		throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
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
				ownership: 'created by proof:rf01:postgres',
			}),
		);
		const initial = new Client(connection);
		await initial.connect();
		const identity = await initial.query(
			'SELECT current_database(), current_schema(), (SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()) AS table_count',
		);
		assert.equal(identity.rows[0].table_count, '0');
		await initial.end();

		run(['run', 'migration:run:dist'], env);
		run(['run', 'migration:run:dist'], env);
		const catalog = new Client(connection);
		await catalog.connect();
		const tables = (
			await catalog.query(
				'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name',
			)
		).rows.map((row) => row.table_name);
		assert.deepEqual(tables, [
			'department_allowed_users',
			'departments',
			'idempotency_keys',
			'migrations',
			'ticket_audit_logs',
			'ticket_message_media',
			'ticket_messages',
			'tickets',
		]);
		const membershipColumns = (
			await catalog.query(
				"SELECT column_name FROM information_schema.columns WHERE table_name = 'department_allowed_users' ORDER BY ordinal_position",
			)
		).rows.map((row) => row.column_name);
		assert.deepEqual(membershipColumns, ['department_id', 'position', 'user_id']);
		assert.equal(
			(
				await catalog.query(
					"SELECT count(*) FROM pg_constraint WHERE conrelid = 'department_allowed_users'::regclass AND contype = 'f'",
				)
			).rows[0].count,
			'1',
		);
		assert.equal(
			(
				await catalog.query(
					"SELECT count(*) FROM pg_indexes WHERE tablename = 'department_allowed_users' AND indexname = 'IDX_department_allowed_users_user_id_department_id'",
				)
			).rows[0].count,
			'1',
		);
		assert.equal((await catalog.query('SELECT count(*) FROM migrations')).rows[0].count, '5');
		await catalog.end();

		const child = spawn(npmCommand, ['run', 'start'], {
			cwd: root,
			env,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let logs = '';
		child.stdout.on('data', (chunk) => (logs += chunk));
		child.stderr.on('data', (chunk) => (logs += chunk));
		try {
			const health = await waitFor(`http://127.0.0.1:${proof.serverPort}/health`);
			assert.equal((await health.json()).database, true);
			const body = {
				name: 'Financeiro',
				allowedUserIds: ['uid-user-1', 'uid-cd-external', 'uid-user-1'],
				type: 'todos',
			};
			const headers = {
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
			};
			const first = await fetch(
				`http://127.0.0.1:${proof.serverPort}/api/support/departments`,
				{ method: 'POST', headers, body: JSON.stringify(body) },
			);
			const firstBody = await first.json();
			assert.equal(first.status, 201);
			assert.equal(firstBody.active, true);
			assert.deepEqual(firstBody.allowedUserIds, body.allowedUserIds);
			const second = await fetch(
				`http://127.0.0.1:${proof.serverPort}/api/support/departments`,
				{ method: 'POST', headers, body: JSON.stringify(body) },
			);
			const secondBody = await second.json();
			assert.equal(second.status, 201);
			assert.notEqual(secondBody.id, firstBody.id);
			const inspection = new Client(connection);
			await inspection.connect();
			const memberships = await inspection.query(
				'SELECT user_id FROM department_allowed_users WHERE department_id = $1 ORDER BY position',
				[firstBody.id],
			);
			assert.deepEqual(
				memberships.rows.map((row) => row.user_id),
				body.allowedUserIds,
			);
			await inspection.query(
				"CREATE FUNCTION rf01_membership_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '__rf01_proof_membership_failure__' THEN RAISE EXCEPTION 'injected membership failure'; END IF; RETURN NEW; END; $$",
			);
			await inspection.query(
				'CREATE TRIGGER rf01_membership_failure_trigger BEFORE INSERT ON department_allowed_users FOR EACH ROW EXECUTE FUNCTION rf01_membership_failure()',
			);
			const failed = await fetch(
				`http://127.0.0.1:${proof.serverPort}/api/support/departments`,
				{
					method: 'POST',
					headers,
					body: JSON.stringify({
						name: 'Rollback',
						type: 'todos',
						allowedUserIds: ['__rf01_proof_membership_failure__'],
					}),
				},
			);
			assert.equal(failed.status, 500);
			assert.equal(
				(
					await inspection.query(
						"SELECT count(*) FROM departments WHERE name = 'Rollback' ",
					)
				).rows[0].count,
				'0',
			);
			await inspection.query(
				'DROP TRIGGER rf01_membership_failure_trigger ON department_allowed_users',
			);
			await inspection.query('DROP FUNCTION rf01_membership_failure()');
			await inspection.end();
			const spec = await fetch(`http://127.0.0.1:${proof.serverPort}/api-docs-json`);
			assert.deepEqual(Object.keys((await spec.json()).paths).sort(), [
				'/api-docs',
				'/api-docs-json',
				'/api/support/departments',
				'/api/support/departments/{departmentId}',
				'/api/support/tickets',
				'/api/support/tickets/admin/{adminId}',
				'/api/support/tickets/history',
				'/api/support/tickets/requester/{requesterId}',
				'/api/support/tickets/{ticketId}',
				'/api/support/tickets/{ticketId}/approve',
				'/api/support/tickets/{ticketId}/cancel',
				'/api/support/tickets/{ticketId}/messages',
				'/api/support/tickets/{ticketId}/messages/{messageId}/visibility',
				'/api/support/tickets/{ticketId}/reject',
				'/health',
				'/metrics',
			]);
			assert.equal(
				(await fetch(`http://127.0.0.1:${proof.serverPort}/api-docs`)).status,
				200,
			);
			const pendingRoutes = [['DELETE', `/api/support/departments/${randomUUID()}`]];
			for (const [method, path] of pendingRoutes) {
				assert.equal(
					(
						await fetch(`http://127.0.0.1:${proof.serverPort}${path}`, {
							method,
							headers: { 'X-Correlation-ID': randomUUID() },
						})
					).status,
					404,
					`${method} ${path} must remain unavailable until its RF is implemented`,
				);
			}
		} finally {
			await stop(child);
		}
		if (child.exitCode && child.exitCode !== 0)
			throw new Error(`Compiled process exited unexpectedly: ${logs}`);
		// As migrations mais recentes (status único e origin_ref_id) são revertidas antes das tabelas de Ticket.
		run(['run', 'migration:revert:dist'], env);
		run(['run', 'migration:revert:dist'], env);
		run(['run', 'migration:revert:dist'], env);
		const reverted = new Client(connection);
		await reverted.connect();
		assert.equal(
			(
				await reverted.query(
					"SELECT count(*) FROM information_schema.tables WHERE table_name IN ('tickets', 'ticket_messages', 'ticket_message_media', 'ticket_audit_logs')",
				)
			).rows[0].count,
			'0',
		);
		assert.equal(
			(
				await reverted.query(
					"SELECT count(*) FROM information_schema.tables WHERE table_name IN ('departments', 'department_allowed_users')",
				)
			).rows[0].count,
			'2',
		);
		await reverted.end();
		run(['run', 'migration:revert:dist'], env);
		const departmentReverted = new Client(connection);
		await departmentReverted.connect();
		assert.equal(
			(
				await departmentReverted.query(
					"SELECT count(*) FROM information_schema.tables WHERE table_name IN ('departments', 'department_allowed_users')",
				)
			).rows[0].count,
			'0',
		);
		assert.equal(
			(
				await departmentReverted.query(
					"SELECT count(*) FROM information_schema.tables WHERE table_name = 'idempotency_keys'",
				)
			).rows[0].count,
			'1',
		);
		await departmentReverted.end();
		run(['run', 'migration:run:dist'], env);
		run(['run', 'migration:run'], env);
		console.log('RF01 PostgreSQL migration, rollback, and compiled process proof OK');
	} finally {
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
