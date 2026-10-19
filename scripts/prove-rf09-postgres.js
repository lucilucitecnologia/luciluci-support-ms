#!/usr/bin/env node

const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
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
async function getWithBody(url, headers, body) {
	return new Promise((resolve, reject) => {
		const request = http.request(
			url,
			{
				method: 'GET',
				headers: {
					...headers,
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
	assert.match(proof.database, /^support_s1_(?:proof|ci)_rf09_[a-zA-Z0-9_]+$/);
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
				ownership: 'created by proof:rf09:postgres',
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
			const createDepartment = await fetch(`${url}/api/support/departments`, {
				method: 'POST',
				headers: { ...headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'RF09 Department',
					type: 'cd',
					allowedUserIds: ['admin-1'],
				}),
			});
			assert.equal(createDepartment.status, 201);
			const department = await createDepartment.json();
			const createTicket = await fetch(`${url}/api/support/tickets`, {
				method: 'POST',
				headers: { ...headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'RF09 detail',
					requesterId: 'requester-1',
					departmentId: department.id,
					priority: 'alta',
					origin: 'backoffice',
					originRefId: 'ref-1',
					message: { message: 'Initial.', mediaIds: [randomUUID()] },
				}),
			});
			assert.equal(createTicket.status, 201);
			const ticket = await createTicket.json();
			const get = (id, actor = 'requester-1', role = 'cd', suffix = '', options = {}) =>
				fetch(`${url}/api/support/tickets/${id}${suffix}`, {
					method: 'GET',
					headers: headers(actor, role),
					...options,
				});
			const expectedFields = [
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
			].sort();
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
						await inspection.query(`SELECT * FROM ${table} ORDER BY 1,2`)
					).rows;
				return result;
			};
			await inspection.query('UPDATE departments SET active=false WHERE id=$1', [
				department.id,
			]);
			const before = await snapshot();
			for (const [actor, role] of [
				['requester-1', 'backoffice'],
				['requester-1', 'cd'],
				['admin-1', 'admin'],
			]) {
				const response = await get(ticket.id, actor, role);
				assert.equal(response.status, 200);
				const body = await response.json();
				assert.deepEqual(Object.keys(body).sort(), expectedFields);
				assert.deepEqual(body, ticket);
			}
			assert.equal((await get(ticket.id, 'admin-2', 'admin')).status, 403);
			assert.equal((await get(ticket.id, 'other', 'backoffice')).status, 403);
			assert.equal((await get(ticket.id, 'other', 'cd')).status, 403);
			assert.equal((await get(randomUUID(), 'other', 'cd')).status, 404);
			assert.equal((await get('bad')).status, 422);
			assert.equal((await get(ticket.id, 'requester-1', 'cd', '?x=1&x=2')).status, 422);
			for (const body of ['{}', 'null', 'text']) {
				assert.equal(
					await getWithBody(
						`${url}/api/support/tickets/${ticket.id}`,
						headers('requester-1', 'cd'),
						body,
					),
					422,
				);
			}
			assert.equal((await get(ticket.id, '', '')).status, 400);
			assert.equal((await get(ticket.id, 'requester-1', 'invalid')).status, 400);
			assert.equal(
				(
					await get(ticket.id, 'requester-1', 'cd', '', {
						headers: { ...headers('requester-1', 'cd'), 'X-Correlation-ID': 'bad' },
					})
				).status,
				400,
			);
			assert.deepEqual(await snapshot(), before);
			await inspection.query('DELETE FROM department_allowed_users WHERE department_id=$1', [
				department.id,
			]);
			const revoked = await snapshot();
			assert.equal((await get(ticket.id, 'admin-1', 'admin')).status, 403);
			assert.deepEqual(await snapshot(), revoked);
			const spec = await (await fetch(`${url}/api-docs-json`)).json();
			assert.ok(spec.paths['/api/support/tickets/{ticketId}'].get);
			assert.equal(spec.paths['/api/support/tickets/{ticketId}'].get.requestBody, undefined);
			assert.deepEqual(
				Object.keys(spec.paths['/api/support/tickets/{ticketId}'].get.responses).sort(),
				['200', '400', '403', '404', '422', '500'],
			);
			assert.deepEqual(await snapshot(), revoked);
		} finally {
			const exitCode = child.exitCode;
			await stop(child);
			child = undefined;
			if (exitCode !== null && exitCode !== 0)
				throw new Error(`Compiled process exited unexpectedly: ${logs}`);
		}
		console.log(
			'RF09 PostgreSQL compiled process, ACL, exact projection, read-only snapshots, and OpenAPI proof OK',
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
