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
				ownership: 'created by proof:rf02:postgres',
			}),
		);

		run(['run', 'migration:run:dist'], env);
		run(['run', 'migration:run:dist'], env);

		inspection = new Client(connection);
		await inspection.connect();
		assert.deepEqual(
			(
				await inspection.query(
					'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name',
				)
			).rows.map((row) => row.table_name),
			[
				'department_allowed_users',
				'departments',
				'idempotency_keys',
				'migrations',
				'ticket_audit_logs',
				'ticket_message_media',
				'ticket_messages',
				'tickets',
			],
		);
		assert.equal(
			(
				await inspection.query(
					"SELECT count(*) FROM pg_constraint WHERE conrelid = 'department_allowed_users'::regclass AND contype = 'f'",
				)
			).rows[0].count,
			'1',
		);

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
		try {
			const health = await waitFor(`${baseUrl}/health`);
			assert.equal((await json(health)).database, true);

			const headers = {
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
			};
			const createdDepartment = await fetch(`${baseUrl}/api/support/departments`, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					name: 'Financeiro',
					type: 'todos',
					allowedUserIds: ['uid-user-1', 'uid-cd-external', 'uid-user-1'],
				}),
			});
			assert.equal(createdDepartment.status, 201);
			const department = await json(createdDepartment);
			assert.equal(department.active, true);

			const updateHeaders = {
				...headers,
				'X-Correlation-ID': randomUUID(),
			};
			const firstPatchBody = {
				name: 'Financeiro Corporativo',
				type: 'backoffice',
				allowedUserIds: ['uid-user-2', 'uid-user-2', 'uid-user-1'],
			};
			const firstPatch = await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify(firstPatchBody),
			});
			assert.equal(firstPatch.status, 200);
			assert.deepEqual(
				(await json(firstPatch)).allowedUserIds,
				firstPatchBody.allowedUserIds,
			);

			const row = (
				await inspection.query(
					'SELECT name, type, active, created_at, updated_at FROM departments WHERE id = $1',
					[department.id],
				)
			).rows[0];
			assert.deepEqual(
				[row.name, row.type, row.active],
				[firstPatchBody.name, firstPatchBody.type, true],
			);
			assert.deepEqual(
				(
					await inspection.query(
						'SELECT position, user_id FROM department_allowed_users WHERE department_id = $1 ORDER BY position',
						[department.id],
					)
				).rows.map((membership) => [membership.position, membership.user_id]),
				[
					[0, 'uid-user-2'],
					[1, 'uid-user-2'],
					[2, 'uid-user-1'],
				],
			);

			lockClient = new Client(connection);
			await lockClient.connect();
			await lockClient.query('BEGIN');
			await lockClient.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [
				department.id,
			]);
			await lockClient.query('UPDATE departments SET name = $1 WHERE id = $2', [
				'Name Written While Locked',
				department.id,
			]);
			let concurrentCompleted = false;
			const concurrent = fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify({ type: 'cd' }),
			}).then((response) => {
				concurrentCompleted = true;
				return response;
			});
			await Promise.race([concurrent, new Promise((resolve) => setTimeout(resolve, 150))]);
			assert.equal(concurrentCompleted, false);
			await lockClient.query('COMMIT');
			await lockClient.end();
			lockClient = undefined;
			const concurrentResponse = await concurrent;
			assert.equal(concurrentResponse.status, 200);
			const concurrentBody = await json(concurrentResponse);
			assert.equal(concurrentBody.name, 'Name Written While Locked');
			assert.equal(concurrentBody.type, 'cd');

			const currentState = {
				name: concurrentBody.name,
				type: concurrentBody.type,
				allowedUserIds: concurrentBody.allowedUserIds,
			};
			const beforeNoOp = (
				await inspection.query('SELECT updated_at FROM departments WHERE id = $1', [
					department.id,
				])
			).rows[0].updated_at;
			const noOp = await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify(currentState),
			});
			assert.equal(noOp.status, 200);
			assert.equal((await json(noOp)).updatedAt, new Date(beforeNoOp).toISOString());
			const afterNoOp = (
				await inspection.query('SELECT updated_at FROM departments WHERE id = $1', [
					department.id,
				])
			).rows[0].updated_at;
			assert.equal(afterNoOp.toISOString(), beforeNoOp.toISOString());

			const clear = await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify({ allowedUserIds: [] }),
			});
			assert.equal(clear.status, 200);
			assert.deepEqual((await json(clear)).allowedUserIds, []);
			assert.equal(
				(
					await inspection.query(
						'SELECT count(*) FROM department_allowed_users WHERE department_id = $1',
						[department.id],
					)
				).rows[0].count,
				'0',
			);

			await inspection.query('UPDATE departments SET active = false WHERE id = $1', [
				department.id,
			]);
			const inactive = await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify({ name: 'Financeiro Inativo' }),
			});
			assert.equal(inactive.status, 200);
			assert.equal((await json(inactive)).active, false);

			const restoreMembership = await fetch(
				`${baseUrl}/api/support/departments/${department.id}`,
				{
					method: 'PATCH',
					headers: updateHeaders,
					body: JSON.stringify({ allowedUserIds: ['uid-old-1', 'uid-old-2'] }),
				},
			);
			assert.equal(restoreMembership.status, 200);

			await inspection.query(
				"CREATE FUNCTION rf02_membership_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '__rf02_proof_membership_failure__' THEN RAISE EXCEPTION 'injected membership failure'; END IF; RETURN NEW; END; $$",
			);
			await inspection.query(
				'CREATE TRIGGER rf02_membership_failure_trigger BEFORE INSERT ON department_allowed_users FOR EACH ROW EXECUTE FUNCTION rf02_membership_failure()',
			);
			const beforeFailure = (
				await inspection.query(
					'SELECT name, type, active, updated_at FROM departments WHERE id = $1',
					[department.id],
				)
			).rows[0];
			const membershipsBeforeFailure = (
				await inspection.query(
					'SELECT position, user_id FROM department_allowed_users WHERE department_id = $1 ORDER BY position',
					[department.id],
				)
			).rows.map((membership) => [membership.position, membership.user_id]);
			const failed = await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
				method: 'PATCH',
				headers: updateHeaders,
				body: JSON.stringify({
					name: 'Should Roll Back',
					type: 'cd',
					allowedUserIds: ['__rf02_proof_membership_failure__'],
				}),
			});
			assert.equal(failed.status, 500);
			const afterFailure = (
				await inspection.query(
					'SELECT name, type, active, updated_at FROM departments WHERE id = $1',
					[department.id],
				)
			).rows[0];
			assert.deepEqual(
				[
					afterFailure.name,
					afterFailure.type,
					afterFailure.active,
					afterFailure.updated_at.toISOString(),
				],
				[
					beforeFailure.name,
					beforeFailure.type,
					beforeFailure.active,
					beforeFailure.updated_at.toISOString(),
				],
			);
			assert.deepEqual(
				(
					await inspection.query(
						'SELECT position, user_id FROM department_allowed_users WHERE department_id = $1 ORDER BY position',
						[department.id],
					)
				).rows.map((membership) => [membership.position, membership.user_id]),
				membershipsBeforeFailure,
			);
			await inspection.query(
				'DROP TRIGGER rf02_membership_failure_trigger ON department_allowed_users',
			);
			await inspection.query('DROP FUNCTION rf02_membership_failure()');

			assert.equal(
				(
					await fetch(
						`${baseUrl}/api/support/departments/550e8400-e29b-41d4-a716-446655440001`,
						{
							method: 'PATCH',
							headers: updateHeaders,
							body: JSON.stringify({ name: 'Missing' }),
						},
					)
				).status,
				404,
			);
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/not-a-uuid`, {
						method: 'PATCH',
						headers: updateHeaders,
						body: JSON.stringify({ name: 'Invalid' }),
					})
				).status,
				422,
			);
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
						method: 'PATCH',
						headers: updateHeaders,
						body: '{}',
					})
				).status,
				422,
			);
			assert.equal(
				(
					await fetch(`${baseUrl}/api/support/departments/${department.id}`, {
						method: 'PATCH',
						headers: { ...updateHeaders, 'Content-Type': 'application/json' },
						body: '{"name":',
					})
				).status,
				400,
			);

			const spec = await json(await fetch(`${baseUrl}/api-docs-json`));
			assert.ok(spec.paths['/api/support/departments/{departmentId}']?.patch);
			assert.equal(
				spec.paths['/api/support/departments/{departmentId}'].patch.responses['200'] !==
					undefined,
				true,
			);
			assert.equal(spec.components.schemas.UpdateDepartmentRequest.minProperties, 1);
			assert.equal(spec.components.schemas.Department.properties.active.enum, undefined);
			assert.equal((await fetch(`${baseUrl}/api-docs`)).status, 200);

			const pendingRoutes = [['DELETE', `/api/support/departments/${randomUUID()}`]];
			for (const [method, path] of pendingRoutes) {
				assert.equal(
					(
						await fetch(`${baseUrl}${path}`, {
							method,
							headers: { 'X-Correlation-ID': randomUUID() },
						})
					).status,
					404,
					`${method} ${path} must remain unavailable until its RF is implemented`,
				);
			}
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0) {
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
			}
		}

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
		await departmentReverted.end();
		run(['run', 'migration:run:dist'], env);
		console.log(
			'RF02 PostgreSQL migration, lock, atomic update, and compiled process proof OK',
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
