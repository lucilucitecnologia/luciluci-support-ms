import assert from 'node:assert/strict';

import { W1_ACTORS, W1Fixture, W1_SCENARIOS, W1_TABLES, W1Row } from './support-w1.fixture';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoUtc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const counts = [6, 7, 16, 44, 8, 80];
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
	const adminStatuses = new Set<string>();
	const requesterStatuses = new Set<string>();
	let followUps = 0;
	let adminMessages = 0;
	let visibleAdmin = 0;
	let rf06Changes = 0;
	let requesterResolutions = 0;
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
		same(field(ticket, 'admin_status'), scenario.adminStatus, 'Ticket adminStatus');
		same(
			field(ticket, 'requester_status'),
			scenario.requesterResolved ? 'resolvido' : 'nao_resolvido',
			'Ticket requesterStatus',
		);
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
			2 +
				(scenario.followUp ? 2 : 0) +
				scenario.adminTransitions.length +
				(scenario.requesterResolved ? 1 : 0),
			'audit count per Ticket',
		);
		const creation = audits[0];
		same(
			[
				creation.action,
				creation.author_id,
				creation.origin,
				creation.status_type,
				creation.new_status,
				creation.datetime,
			],
			['criacao_ticket', scenario.requester, origin, null, null, ticket.created_at],
			'creation audit',
		);
		let logicalAdminStatus = 'pendente';
		let logicalRequesterStatus = 'nao_resolvido';
		const auditedMessageIds = new Set<string>();
		let rf10Audits = 0;
		let rf06ForTicket = 0;
		let resolutionSeen = false;
		let requesterMessageAudited = false;
		let adminMessageAudited = false;
		let lastTime = field(ticket, 'created_at');
		for (const audit of audits.slice(1)) {
			assert.ok(field(audit, 'datetime') >= lastTime, 'Audit timeline is not monotonic');
			lastTime = field(audit, 'datetime');
			if (audit.action === 'nova_mensagem') {
				assert.ok(!resolutionSeen, 'Message audit after requester resolution');
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
					[audit.author_id, audit.origin, audit.status_type, audit.new_status],
					[matchingMessage.author_id, matchingMessage.type, null, null],
					'message audit status fields',
				);
			} else if (
				audit.action === 'alteracao_status' &&
				audit.origin !== 'admin' &&
				audit.status_type === 'admin'
			) {
				assert.ok(
					scenario.followUp &&
						requesterMessageAudited &&
						!adminMessageAudited &&
						rf10Audits === 0,
					'Unexpected RF10 audit',
				);
				assert.ok(!resolutionSeen, 'RF10 audit after requester resolution');
				same(
					[audit.author_id, audit.origin, audit.new_status],
					[scenario.requester, origin, 'pendente'],
					'RF10 requester status audit',
				);
				same(audit.datetime, messages[1].created_at, 'RF10 requester audit time');
				logicalAdminStatus = 'pendente';
				rf10Audits++;
			} else if (
				audit.action === 'alteracao_status' &&
				audit.origin === 'admin' &&
				audit.status_type === 'admin'
			) {
				assert.ok(!resolutionSeen, 'RF06 audit after requester resolution');
				assert.ok(adminMessageAudited, 'RF06 audit before admin Message');
				assert.notEqual(
					audit.new_status,
					logicalAdminStatus,
					'RF06 audit must be effective',
				);
				same(
					[audit.author_id, audit.new_status],
					[admin.author_id, scenario.adminTransitions[rf06ForTicket]],
					'RF06 transition matrix',
				);
				logicalAdminStatus = field(audit, 'new_status');
				rf06ForTicket++;
				rf06Changes++;
			} else if (audit.action === 'alteracao_status' && audit.status_type === 'requester') {
				assert.ok(adminMessageAudited, 'RF08 audit before admin Message');
				same(
					rf06ForTicket,
					scenario.adminTransitions.length,
					'RF08 before RF06 completion',
				);
				same(
					[audit.author_id, audit.origin, audit.new_status],
					[scenario.requester, origin, 'resolvido'],
					'RF08 requester audit',
				);
				assert.notEqual(
					logicalRequesterStatus,
					'resolvido',
					'duplicate requester resolution',
				);
				logicalRequesterStatus = 'resolvido';
				resolutionSeen = true;
				requesterResolutions++;
			} else throw new Error('Invalid W1 audit action/role');
		}
		same(auditedMessageIds.size, messages.length - 1, 'nova_mensagem per post-initial Message');
		same(rf10Audits, scenario.followUp ? 1 : 0, 'RF10 count per Ticket');
		same(rf06ForTicket, scenario.adminTransitions.length, 'RF06 count per Ticket');
		same(logicalAdminStatus, scenario.adminStatus, 'logical final adminStatus');
		same(logicalRequesterStatus, ticket.requester_status, 'logical final requesterStatus');
		same(field(ticket, 'updated_at'), lastTime, 'Ticket.updatedAt final timeline');
		priorities.add(field(ticket, 'priority'));
		origins.add(field(ticket, 'origin'));
		adminStatuses.add(field(ticket, 'admin_status'));
		requesterStatuses.add(field(ticket, 'requester_status'));
	}
	same(priorities, new Set(['baixa', 'media', 'alta', 'urgente']), 'Ticket priorities');
	same(origins, new Set(['backoffice', 'cd']), 'Ticket origins');
	same(
		adminStatuses,
		new Set(['pendente', 'cancelado', 'em_andamento', 'finalizado', 'resolvido']),
		'Ticket adminStatuses',
	);
	same(requesterStatuses, new Set(['nao_resolvido', 'resolvido']), 'Ticket requesterStatuses');
	same(
		[followUps, adminMessages, visibleAdmin, rf06Changes, requesterResolutions],
		[12, 16, 8, 16, 8],
		'W1 event distribution',
	);
	const actionCounts = fixture.ticket_audit_logs.reduce<Record<string, number>>((total, row) => {
		const action = field(row, 'action');
		total[action] = (total[action] ?? 0) + 1;
		return total;
	}, {});
	same(
		actionCounts,
		{ criacao_ticket: 16, nova_mensagem: 28, alteracao_status: 36 },
		'Audit action breakdown',
	);
}
