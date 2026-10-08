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
				ownership: 'created by proof:rf07:postgres',
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
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
				...(actor ? { 'X-Performed-By': actor, 'X-Performed-By-Type': role } : {}),
			});
			const createDepartment = async (name, members) => {
				const response = await fetch(`${url}/api/support/departments`, {
					method: 'POST',
					headers: headers(),
					body: JSON.stringify({ name, type: 'todos', allowedUserIds: members }),
				});
				assert.equal(response.status, 201);
				return response.json();
			};
			const createTicket = async (
				requesterId,
				departmentId,
				priority = 'alta',
				origin = 'backoffice',
			) => {
				const response = await fetch(`${url}/api/support/tickets`, {
					method: 'POST',
					headers: headers(),
					body: JSON.stringify({
						subject: 'RF07 ticket',
						requesterId,
						departmentId,
						priority,
						origin,
						message: { message: 'Initial.' },
					}),
				});
				assert.equal(response.status, 201);
				return response.json();
			};
			const departmentA = await createDepartment('RF07 A', ['admin-1', 'admin-1']);
			const departmentB = await createDepartment('RF07 B', ['admin-1']);
			const departmentC = await createDepartment('RF07 C', ['admin-2']);
			const first = await createTicket('requester-1', departmentA.id, 'alta', 'cd');
			const second = await createTicket('requester-1', departmentB.id, 'urgente');
			const third = await createTicket('requester-2', departmentA.id);
			const hidden = await createTicket('requester-2', departmentC.id);
			await inspection.query('UPDATE departments SET active=false WHERE id=$1', [
				departmentB.id,
			]);
			await inspection.query('UPDATE tickets SET created_at=$2,updated_at=$2 WHERE id=$1', [
				first.id,
				'2026-09-01T00:00:00.000Z',
			]);
			await inspection.query(
				'UPDATE tickets SET created_at=$2,updated_at=$2,admin_status=$3 WHERE id=$1',
				[second.id, '2026-09-04T23:59:59.999Z', 'resolvido'],
			);
			await inspection.query('UPDATE tickets SET created_at=$2,updated_at=$2 WHERE id=$1', [
				third.id,
				'2026-09-05T00:00:00.000Z',
			]);
			await inspection.query('UPDATE tickets SET created_at=$2,updated_at=$2 WHERE id=$1', [
				hidden.id,
				'2026-09-04T23:59:59.999Z',
			]);
			const snapshot = async () => ({
				tickets: (await inspection.query('SELECT id,updated_at FROM tickets ORDER BY id'))
					.rows,
				audits: (
					await inspection.query('SELECT count(*)::int AS count FROM ticket_audit_logs')
				).rows[0].count,
				messages: (
					await inspection.query('SELECT count(*)::int AS count FROM ticket_messages')
				).rows[0].count,
			});
			const before = await snapshot();
			const list = async (path, actor, role, query = '') => {
				const response = await fetch(`${url}/api/support/tickets/${path}${query}`, {
					headers: headers(actor, role),
				});
				return {
					status: response.status,
					body: await response.json(),
					correlation: response.headers.get('x-correlation-id'),
				};
			};
			let result = await list('requester/requester-1', 'requester-1', 'cd');
			assert.equal(result.status, 200);
			assert.deepEqual(
				result.body.data.map((ticket) => ticket.id),
				[second.id, first.id],
			);
			assert.equal(result.body.data[0].createdAt, '2026-09-04T23:59:59.999Z');
			assert.deepEqual(result.body.pagination, {
				page: 1,
				size: 20,
				total: 2,
				totalPages: 1,
			});
			assert.deepEqual(
				Object.keys(result.body.data[0]).sort(),
				[
					'id',
					'number',
					'subject',
					'createdAt',
					'departmentId',
					'requesterId',
					'origin',
					'priority',
					'status',
				].sort(),
			);
			assert.equal(result.body.data[0].status, 'resolvido');
			result = await list('admin/admin-1', 'admin-1', 'admin');
			assert.equal(result.status, 200);
			assert.deepEqual(
				result.body.data.map((ticket) => ticket.id),
				[third.id, second.id, first.id],
			);
			assert.equal(result.body.pagination.total, 3);
			result = await list(
				'admin/admin-1',
				'admin-1',
				'admin',
				`?requesterId=requester-1&number=${second.number}&status=resolvido&origin=backoffice&departmentId=${departmentB.id}&priority=urgente&startDate=04/09/2026&endDate=04/09/2026`,
			);
			assert.equal(result.status, 200);
			assert.deepEqual(
				result.body.data.map((ticket) => ticket.id),
				[second.id],
			);
			result = await list('admin/admin-1', 'admin-1', 'admin', '?endDate=04/09/2026');
			assert.deepEqual(
				result.body.data.map((ticket) => ticket.id),
				[second.id, first.id],
			);
			result = await list('admin/admin-1', 'admin-1', 'admin', '?page=4&size=1');
			assert.deepEqual(result.body, {
				data: [],
				pagination: { page: 4, size: 1, total: 3, totalPages: 3 },
			});
			assert.equal((await list('admin/admin-1', 'requester-1', 'admin')).status, 403);
			assert.equal((await list('requester/requester-1', 'requester-1', 'admin')).status, 403);
			assert.equal((await list('requester/requester-1', undefined, undefined)).status, 400);
			assert.equal((await list('admin/admin-1', 'admin-1', 'admin', '?limit=2')).status, 422);
			assert.equal(
				(await list('admin/admin-1', 'admin-1', 'admin', '?startDate=31/02/2026')).status,
				422,
			);
			await inspection.query(
				'DELETE FROM department_allowed_users WHERE department_id=$1 AND user_id=$2',
				[departmentB.id, 'admin-1'],
			);
			result = await list('admin/admin-1', 'admin-1', 'admin');
			assert.deepEqual(
				result.body.data.map((ticket) => ticket.id),
				[third.id, first.id],
			);
			assert.deepEqual(await snapshot(), before);
			const spec = await (await fetch(`${url}/api-docs-json`)).json();
			assert.ok(spec.paths['/api/support/tickets/requester/{requesterId}']?.get);
			assert.ok(spec.paths['/api/support/tickets/admin/{adminId}']?.get);
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0)
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
		}
		console.log(
			'RF07 PostgreSQL compiled process, ACL, filters, UTC dates, pagination, read-only, and OpenAPI proof OK',
		);
	} finally {
		await stop(child);
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
