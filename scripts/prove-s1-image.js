#!/usr/bin/env node

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const proofId = randomUUID().replaceAll('-', '').slice(0, 12);
const network = `support-s1-proof-net-${proofId}`;
const databaseContainer = `support-s1-proof-db-${proofId}`;
const appContainer = `support-s1-proof-app-${proofId}`;
const image = `support-s1-proof-image:${proofId}`;
const database = `support_s1_proof_${proofId}`;
const user = 'support_s1_proof';
const password = `proof_${proofId}`;

function docker(args, allowFailure = false) {
	const result = spawnSync('docker', args, { encoding: 'utf8' });
	if (!allowFailure && result.status !== 0)
		throw new Error(`docker ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
	return result;
}

async function ready(url) {
	const deadline = Date.now() + 45_000;
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
	throw new Error(`Image smoke readiness failed: ${lastError?.message}`);
}

async function main() {
	try {
		docker(['version', '--format', '{{.Server.Version}}']);
		docker(['network', 'create', network]);
		docker([
			'run',
			'-d',
			'--name',
			databaseContainer,
			'--network',
			network,
			'-e',
			`POSTGRES_USER=${user}`,
			'-e',
			`POSTGRES_PASSWORD=${password}`,
			'-e',
			`POSTGRES_DB=${database}`,
			'postgres:16',
		]);
		const dbStartedAt = Date.now();
		const dbDeadline = dbStartedAt + 45_000;
		let dbReady = false;
		let dbAttempts = 0;
		while (Date.now() < dbDeadline) {
			dbAttempts += 1;
			// The entrypoint's temporary server accepts Unix socket connections before
			// initialization completes. TCP plus SQL verifies the final server and DB.
			const probe = docker(
				[
					'exec',
					databaseContainer,
					'sh',
					'-c',
					'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT 1"',
				],
				true,
			);
			if (probe.status === 0 && probe.stdout.trim() === '1') {
				dbReady = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		if (!dbReady) {
			const state = docker(
				['inspect', '--format', '{{json .State}}', databaseContainer],
				true,
			).stdout.trim();
			const logs = docker(['logs', databaseContainer], true);
			throw new Error(
				`isolated PostgreSQL SQL readiness timed out after ${dbAttempts} attempts in ${Date.now() - dbStartedAt}ms; state=${state}; stdout=${logs.stdout}; stderr=${logs.stderr}`,
			);
		}
		console.log(
			JSON.stringify({
				databaseContainer,
				readiness: 'tcp_sql',
				dbAttempts,
				elapsedMs: Date.now() - dbStartedAt,
			}),
		);
		console.log(
			JSON.stringify({
				proofId,
				network,
				databaseContainer,
				database,
				ownership: 'created by proof:s1:image',
			}),
		);
		docker(['build', '--tag', image, '.']);
		docker([
			'run',
			'-d',
			'--name',
			appContainer,
			'--network',
			network,
			'-p',
			'127.0.0.1::3000',
			'-e',
			'NODE_ENV=production',
			'-e',
			'SERVER_PORT=3000',
			'-e',
			'DB_HOST=' + databaseContainer,
			'-e',
			'DB_PORT=5432',
			'-e',
			`DB_USER=${user}`,
			'-e',
			`DB_PASSWORD=${password}`,
			'-e',
			`DB_NAME=${database}`,
			image,
		]);
		const binding = docker(['port', appContainer, '3000/tcp']).stdout.trim();
		const port = binding.match(/:(\d+)$/)?.[1];
		assert.ok(port, `Unable to determine loopback port from ${binding}`);
		const health = await ready(`http://127.0.0.1:${port}/health`);
		const body = await health.json();
		assert.equal(body.database, true);
		assert.equal(body.messaging?.status, 'not_applicable');
		const baseUrl = `http://127.0.0.1:${port}`;
		const correlationId = randomUUID();
		const created = await fetch(`${baseUrl}/api/support/departments`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Correlation-ID': correlationId,
			},
			body: JSON.stringify({
				name: 'Image RF05',
				type: 'todos',
				allowedUserIds: ['uid-image-admin'],
			}),
		});
		assert.equal(created.status, 201);
		const createdBody = await created.json();
		const ticket = await fetch(`${baseUrl}/api/support/tickets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
			},
			body: JSON.stringify({
				subject: 'Image RF05 ticket',
				requesterId: 'uid-image-requester',
				departmentId: createdBody.id,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				message: { message: 'Image RF05 initial message.' },
			}),
		});
		assert.equal(ticket.status, 201);
		const ticketBody = await ticket.json();
		assert.equal(ticketBody.number, 1);
		assert.equal(ticketBody.status, 'pendente');
		assert.equal(ticketBody.adminStatus, undefined);
		assert.equal(ticketBody.requesterStatus, undefined);
		let adminMessageId;
		for (const [actor, role, visible] of [
			['uid-image-requester', 'cd', true],
			['uid-image-admin', 'admin', false],
		]) {
			const message = await fetch(
				`${baseUrl}/api/support/tickets/${ticketBody.id}/messages`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Correlation-ID': randomUUID(),
						'X-Performed-By': actor,
						'X-Performed-By-Type': role,
					},
					body: JSON.stringify({
						message: 'Image RF10 message',
						type: role,
						authorId: actor,
						isVisibleToRequester: visible,
					}),
				},
			);
			assert.equal(message.status, 201);
			const createdMessage = await message.json();
			assert.equal(createdMessage.ticketId, ticketBody.id);
			assert.equal(createdMessage.isVisibleToRequester, visible);
			assert.deepEqual(createdMessage.mediaIds, []);
			if (role === 'admin') adminMessageId = createdMessage.id;
		}
		assert.ok(adminMessageId);
		const imageList = async (actor, role) => {
			const response = await fetch(
				`${baseUrl}/api/support/tickets/${ticketBody.id}/messages`,
				{
					headers: {
						'X-Correlation-ID': randomUUID(),
						'X-Performed-By': actor,
						'X-Performed-By-Type': role,
					},
				},
			);
			assert.equal(response.status, 200);
			return response.json();
		};
		const adminList = await imageList('uid-image-admin', 'admin');
		const requesterList = await imageList('uid-image-requester', 'cd');
		assert.equal(adminList.pagination.total, 3);
		assert.equal(requesterList.pagination.total, 2);
		assert.ok(adminList.data.some((message) => message.id === adminMessageId));
		assert.ok(!requesterList.data.some((message) => message.id === adminMessageId));
		const imageHistory = async (actor, role) => {
			const response = await fetch(
				`${baseUrl}/api/support/tickets/history?ticketId=${ticketBody.id}`,
				{
					headers: {
						'X-Correlation-ID': randomUUID(),
						'X-Performed-By': actor,
						'X-Performed-By-Type': role,
					},
				},
			);
			assert.equal(response.status, 200);
			return response.json();
		};
		const adminHistory = await imageHistory('uid-image-admin', 'admin');
		const requesterHistory = await imageHistory('uid-image-requester', 'cd');
		assert.equal(adminHistory.pagination.total, 5);
		assert.equal(requesterHistory.pagination.total, 4);
		assert.ok(
			adminHistory.data.some(
				(audit) => audit.action === 'nova_mensagem' && audit.origin === 'admin',
			),
		);
		assert.ok(
			requesterHistory.data.every(
				(audit) => audit.action !== 'nova_mensagem' || audit.origin !== 'admin',
			),
		);
		const visibility = await fetch(
			`${baseUrl}/api/support/tickets/${ticketBody.id}/messages/${adminMessageId}/visibility`,
			{
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'X-Correlation-ID': randomUUID(),
					'X-Performed-By': 'uid-image-admin',
					'X-Performed-By-Type': 'admin',
				},
				body: JSON.stringify({ isVisibleToRequester: true }),
			},
		);
		assert.equal(visibility.status, 200);
		assert.equal((await visibility.json()).isVisibleToRequester, true);
		assert.deepEqual(await imageHistory('uid-image-requester', 'cd'), requesterHistory);
		const storedVisibility = docker([
			'exec',
			databaseContainer,
			'sh',
			'-c',
			`PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT is_visible_to_requester FROM ticket_messages WHERE id='${adminMessageId}' AND ticket_id='${ticketBody.id}'"`,
		]).stdout.trim();
		assert.equal(storedVisibility, 't');
		assert.equal((await ready(`${baseUrl}/health`)).status, 200);
		const proposed = await fetch(`${baseUrl}/api/support/tickets/${ticketBody.id}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				'X-Correlation-ID': randomUUID(),
				'X-Performed-By': 'uid-image-admin',
				'X-Performed-By-Type': 'admin',
			},
			body: JSON.stringify({ status: 'resolvido' }),
		});
		assert.equal(proposed.status, 200);
		assert.equal((await proposed.json()).status, 'resolvido');
		const approved = await fetch(`${baseUrl}/api/support/tickets/${ticketBody.id}/approve`, {
			method: 'POST',
			headers: {
				'X-Correlation-ID': randomUUID(),
				'X-Performed-By': 'uid-image-requester',
				'X-Performed-By-Type': 'cd',
			},
		});
		assert.equal(approved.status, 200);
		assert.equal((await approved.json()).status, 'finalizado');
		for (const [actor, role] of [
			['uid-image-requester', 'backoffice'],
			['uid-image-admin', 'admin'],
		]) {
			const detail = await fetch(`${baseUrl}/api/support/tickets/${ticketBody.id}`, {
				headers: {
					'X-Correlation-ID': randomUUID(),
					'X-Performed-By': actor,
					'X-Performed-By-Type': role,
				},
			});
			assert.equal(detail.status, 200);
			const body = await detail.json();
			assert.equal(body.id, ticketBody.id);
			assert.equal(body.status, 'finalizado');
			assert.deepEqual(
				Object.keys(body).sort(),
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
		}
		const listed = await fetch(`${baseUrl}/api/support/departments`, {
			headers: { 'X-Correlation-ID': randomUUID() },
		});
		assert.equal(listed.status, 200);
		const listBody = await listed.json();
		assert.equal(listBody.pagination.total, 1);
		assert.equal(listBody.data[0].name, 'Image RF05');
		const deleted = await fetch(`${baseUrl}/api/support/departments/${createdBody.id}`, {
			method: 'DELETE',
			headers: { 'X-Correlation-ID': randomUUID() },
		});
		assert.equal(deleted.status, 204);
		assert.equal(await deleted.text(), '');
		const listedAfterDelete = await fetch(`${baseUrl}/api/support/departments`, {
			headers: { 'X-Correlation-ID': randomUUID() },
		});
		assert.equal(listedAfterDelete.status, 200);
		const listAfterDeleteBody = await listedAfterDelete.json();
		assert.equal(listAfterDeleteBody.pagination.total, 0);
		assert.deepEqual(listAfterDeleteBody.data, []);
		console.log('S1 production image CMD smoke with RF05/RF08/RF09/RF10/RF11/RF12/RF13 OK');
	} finally {
		docker(['rm', '-f', appContainer], true);
		docker(['rm', '-f', databaseContainer], true);
		docker(['network', 'rm', network], true);
		docker(['image', 'rm', image], true);
		console.log(
			JSON.stringify({
				proofId,
				cleanup: 'removed owned containers, network, and image tag',
			}),
		);
	}
}

main().catch((error) => {
	console.error(error.stack ?? error);
	process.exitCode = 1;
});
