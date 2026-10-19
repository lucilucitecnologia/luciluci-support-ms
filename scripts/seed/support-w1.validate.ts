import assert from 'node:assert/strict';

import { W1_ACTORS, W1Fixture, W1_SCENARIOS, W1_TABLES, W1Row } from './support-w1.fixture';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoUtc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const counts = [6, 7, 16, 44, 8, 98];
const field = (row: W1Row, name: string): string => String(row[name]);
const same = (actual: unknown, expected: unknown, label: string): void =>
	assert.deepEqual(actual, expected, 'Invalid W1 fixture: ' + label);

export function validateW1Fixture(fixture: W1Fixture): void {
	W1_TABLES.forEach((table, index) =>
		same(fixture[table].length, counts[index], table + ' count'),
	);
	same(new Set(Object.values(W1_ACTORS)).size, 8, 'actor count/uniqueness');
	same(
		W1_SCENARIOS.map((s) => s.key),
		Array.from({ length: 16 }, (_, i) => 'T' + String(i + 1).padStart(2, '0')),
		'T01–T16 order',
	);
	const internalIds = [
		...fixture.departments,
		...fixture.tickets,
		...fixture.ticket_messages,
		...fixture.ticket_audit_logs,
	].map((row) => field(row, 'id'));
	same(new Set(internalIds).size, internalIds.length, 'unique internal IDs');
	for (const id of internalIds) assert.match(id, uuidV4, 'Invalid W1 UUID v4');
	for (const row of Object.values(fixture).flat()) {
		for (const [name, value] of Object.entries(row)) {
			if (['created_at', 'updated_at', 'datetime'].includes(name)) {
				assert.match(String(value), isoUtc, 'Invalid W1 UTC timestamp');
				assert.ok(Number.isFinite(Date.parse(String(value))), 'Invalid W1 timestamp value');
			}
		}
	}
	const departments = new Map(fixture.departments.map((row) => [field(row, 'id'), row]));
	same(fixture.departments.filter((row) => row.active).length, 4, 'active Departments');
	same(fixture.departments.filter((row) => !row.active).length, 2, 'inactive Departments');
	same(
		new Set(fixture.departments.map((row) => row.type)),
		new Set(['todos', 'backoffice', 'cd']),
		'Department types',
	);
	const memberships = new Map<string, string[]>();
	for (const row of fixture.department_allowed_users) {
		const departmentId = field(row, 'department_id');
		assert.ok(departments.has(departmentId), 'Unknown Department membership');
		const existing = memberships.get(departmentId) ?? [];
		same(row.position, existing.length, 'membership position');
		assert.ok(!existing.includes(field(row, 'user_id')), 'Duplicate Department member');
		existing.push(field(row, 'user_id'));
		memberships.set(departmentId, existing);
	}
	assert.ok(
		[...memberships.values()].some((users) => users.length > 1),
		'Missing membership overlap',
	);
	assert.ok(
		![...memberships.values()].some((users) => users.includes(W1_ACTORS.outsider)),
		'Outsider has membership',
	);
	const ticketIds = new Set(fixture.tickets.map((row) => field(row, 'id')));
	const messageIds = new Set(fixture.ticket_messages.map((row) => field(row, 'id')));
	for (const row of fixture.ticket_message_media) {
		assert.ok(messageIds.has(field(row, 'ticket_message_id')), 'Unknown media Message');
		assert.ok(Number(row.position) >= 0, 'Negative media position');
	}
	same(
		new Set(
			fixture.ticket_message_media.map(
				(row) => field(row, 'ticket_message_id') + '/' + field(row, 'position'),
			),
		).size,
		8,
		'unique media positions',
	);
	assert.ok(
		fixture.ticket_message_media.some((row) =>
			fixture.ticket_message_media.some(
				(other) =>
					other !== row &&
					other.ticket_message_id === row.ticket_message_id &&
					other.media_id === row.media_id &&
					other.position !== row.position,
			),
		),
		'Missing duplicate mediaId in distinct positions',
	);
	for (const row of fixture.ticket_audit_logs)
		assert.ok(ticketIds.has(field(row, 'ticket_id')), 'Unknown Audit Ticket');
	for (const row of fixture.ticket_messages)
		assert.ok(ticketIds.has(field(row, 'ticket_id')), 'Unknown Message Ticket');

	const priorities = new Set<string>();
	const origins = new Set<string>();
	const statuses = new Set<string>();
	let followUps = 0;
	let adminMessages = 0;
	let visibleAdmin = 0;
	let adminStepChanges = 0;
	let requesterStepChanges = 0;
	let adminMessageStatusAudits = 0;
	for (const [index, scenario] of W1_SCENARIOS.entries()) {
		const ticket = fixture.tickets[index];
		const ticketId = field(ticket, 'id');
		const department = fixture.departments.find(
			(row) => field(row, 'id') === field(ticket, 'department_id'),
		);
		assert.ok(department, 'Ticket Department missing');
		same(
			ticket.department_id,
			fixture.departments[Number(scenario.department.slice(1)) - 1].id,
			'Ticket Department matrix',
		);
		same(ticket.number, index + 1, 'Ticket.number');
		same(field(ticket, 'requester_id'), scenario.requester, 'Ticket requester');
		same(field(ticket, 'priority'), scenario.priority, 'Ticket priority');
		same(field(ticket, 'status'), scenario.status, 'Ticket status');
		const origin = scenario.requester.startsWith('seed-cd-') ? 'cd' : 'backoffice';
		same(field(ticket, 'origin'), origin, 'Ticket origin');
		same(
			field(ticket, 'origin_ref_id'),
			'seed-' + origin + '-ref-' + String(index + 1).padStart(2, '0'),
			'Ticket origin ref',
		);
		const messages = fixture.ticket_messages.filter((row) => row.ticket_id === ticketId);
		same(messages.length, scenario.followUp ? 3 : 2, 'messages per Ticket');
		const initial = messages[0];
		same(
			[initial.type, initial.author_id, initial.is_visible_to_requester, initial.created_at],
			[origin, scenario.requester, true, ticket.created_at],
			'initial message',
		);
		const admin = messages[messages.length - 1];
		same(admin.type, 'admin', 'admin Message type');
		same(admin.is_visible_to_requester, (index + 1) % 2 === 1, 'admin visibility matrix');
		assert.ok(
			(memberships.get(field(ticket, 'department_id')) ?? []).includes(
				field(admin, 'author_id'),
			),
			'Admin Message author is not a current member',
		);
		adminMessages++;
		if (admin.is_visible_to_requester) visibleAdmin++;
		if (scenario.followUp) {
			const follow = messages[1];
			same(
				[follow.type, follow.author_id, follow.is_visible_to_requester],
				[origin, scenario.requester, true],
				'requester follow-up',
			);
			followUps++;
		}
		for (let messageIndex = 1; messageIndex < messages.length; messageIndex++) {
			assert.ok(
				field(messages[messageIndex], 'created_at') >
					field(messages[messageIndex - 1], 'created_at'),
				'Message timeline is not monotonic',
			);
		}
		const audits = fixture.ticket_audit_logs.filter((row) => row.ticket_id === ticketId);
		same(
			audits.length,
			1 + (scenario.followUp ? 2 : 0) + 2 + scenario.steps.length,
			'audit count per Ticket',
		);
		const creation = audits[0];
		same(
			[
				creation.action,
				creation.author_id,
				creation.origin,
				creation.new_status,
				creation.datetime,
			],
			['criacao_ticket', scenario.requester, origin, null, ticket.created_at],
			'creation audit',
		);
		let logicalStatus = 'pendente';
		const auditedMessageIds = new Set<string>();
		let rf10Audits = 0;
		let adminMessageStatusAudited = false;
		let stepsApplied = 0;
		let requesterMessageAudited = false;
		let adminMessageAudited = false;
		let lastTime = field(ticket, 'created_at');
		for (const audit of audits.slice(1)) {
			assert.ok(field(audit, 'datetime') >= lastTime, 'Audit timeline is not monotonic');
			lastTime = field(audit, 'datetime');
			if (audit.action === 'nova_mensagem') {
				assert.ok(stepsApplied === 0, 'Message audit after a status step');
				const matchingMessage = messages
					.slice(1)
					.find((message) => message.created_at === audit.datetime);
				assert.ok(matchingMessage, 'Message audit lacks a post-initial Message');
				assert.ok(
					!auditedMessageIds.has(field(matchingMessage, 'id')),
					'Duplicate audit for Message',
				);
				if (matchingMessage.type === 'admin') {
					assert.ok(!adminMessageAudited, 'Duplicate admin Message audit');
					assert.ok(!scenario.followUp || rf10Audits === 1, 'Admin audit before RF10');
					adminMessageAudited = true;
				} else {
					assert.ok(
						!requesterMessageAudited && !adminMessageAudited,
						'Requester audit order',
					);
					requesterMessageAudited = true;
				}
				auditedMessageIds.add(field(matchingMessage, 'id'));
				same(
					[audit.author_id, audit.origin, audit.new_status],
					[matchingMessage.author_id, matchingMessage.type, null],
					'message audit status fields',
				);
			} else if (audit.action !== 'alteracao_status') {
				throw new Error('Invalid W1 audit action/role');
			} else if (!adminMessageAudited) {
				// RF10: a requester message always reopens the Ticket as pendente.
				assert.ok(
					scenario.followUp && requesterMessageAudited && rf10Audits === 0,
					'Unexpected RF10 audit',
				);
				same(
					[audit.author_id, audit.origin, audit.new_status],
					[scenario.requester, origin, 'pendente'],
					'RF10 requester status audit',
				);
				same(audit.datetime, messages[1].created_at, 'RF10 requester audit time');
				logicalStatus = 'pendente';
				rf10Audits++;
			} else if (!adminMessageStatusAudited) {
				// RF10: the first admin message on a pendente Ticket moves it to em_andamento.
				same(logicalStatus, 'pendente', 'admin message requires pendente');
				same(
					[audit.author_id, audit.origin, audit.new_status, audit.datetime],
					[admin.author_id, 'admin', 'em_andamento', admin.created_at],
					'admin message status audit',
				);
				logicalStatus = 'em_andamento';
				adminMessageStatusAudited = true;
				adminMessageStatusAudits++;
			} else {
				const step = scenario.steps[stepsApplied];
				assert.ok(step, 'Unexpected status step');
				const byAdmin = step.by === 'admin';
				same(
					[audit.author_id, audit.origin, audit.new_status],
					[
						byAdmin ? admin.author_id : scenario.requester,
						byAdmin ? 'admin' : origin,
						step.status,
					],
					'status step audit',
				);
				assert.notEqual(audit.new_status, logicalStatus, 'status step must be effective');
				if (byAdmin) adminStepChanges++;
				else {
					// Requester steps only exist as approve, reject or cancel.
					const allowed: Record<string, string[]> = {
						finalizado: ['resolvido'],
						pendente: ['resolvido'],
						cancelado: ['pendente', 'em_andamento'],
					};
					assert.ok(
						allowed[step.status]?.includes(logicalStatus),
						'Requester step from invalid status',
					);
					requesterStepChanges++;
				}
				logicalStatus = field(audit, 'new_status');
				stepsApplied++;
			}
		}
		same(auditedMessageIds.size, messages.length - 1, 'nova_mensagem per post-initial Message');
		same(rf10Audits, scenario.followUp ? 1 : 0, 'RF10 count per Ticket');
		same(adminMessageStatusAudited, true, 'admin message status audit per Ticket');
		same(stepsApplied, scenario.steps.length, 'status steps per Ticket');
		same(logicalStatus, scenario.status, 'logical final status');
		same(field(ticket, 'updated_at'), lastTime, 'Ticket.updatedAt final timeline');
		priorities.add(field(ticket, 'priority'));
		origins.add(field(ticket, 'origin'));
		statuses.add(field(ticket, 'status'));
	}
	same(priorities, new Set(['baixa', 'media', 'alta', 'urgente']), 'Ticket priorities');
	same(origins, new Set(['backoffice', 'cd']), 'Ticket origins');
	same(
		statuses,
		new Set(['pendente', 'em_andamento', 'resolvido', 'finalizado', 'cancelado']),
		'Ticket statuses',
	);
	same(
		[followUps, adminMessages, visibleAdmin, adminStepChanges, requesterStepChanges],
		[12, 16, 8, 19, 7],
		'W1 event distribution',
	);
	same(adminMessageStatusAudits, 16, 'admin message status audits');
	const actionCounts = fixture.ticket_audit_logs.reduce<Record<string, number>>((total, row) => {
		const action = field(row, 'action');
		total[action] = (total[action] ?? 0) + 1;
		return total;
	}, {});
	same(
		actionCounts,
		{ criacao_ticket: 16, nova_mensagem: 28, alteracao_status: 54 },
		'Audit action breakdown',
	);
}
