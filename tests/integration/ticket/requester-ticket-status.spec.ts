import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAuditLog from '../../../src/features/ticket/entities/ticket-audit-log.entity';
import TicketMessage from '../../../src/features/ticket/entities/ticket-message.entity';
import TicketMessageMedia from '../../../src/features/ticket/entities/ticket-message-media.entity';
import TestDataSource from '../../../src/shared/infrastructure/database/data-source-test';
import {
	buildTestApp,
	clearDatabase,
	destroyTestDataSource,
	initializeTestDataSource,
} from '../../helpers/test-helpers';

const correlationId = 'ad832142-1a9d-42b2-988a-b964be0ad5f0';
const departmentId = 'a19cf070-ea36-41df-9382-e44d541f8003';
const absentId = '919cf070-ea36-41df-9382-e44d541f8005';
const requesterId = 'requester-123';
let ticketId: string;

type Action = 'approve' | 'reject' | 'cancel';

function act(
	action: Action,
	body?: unknown,
	actorId = requesterId,
	role = 'backoffice',
	id = ticketId,
) {
	const call = request(buildTestApp())
		.post(`/api/support/tickets/${id}/${action}`)
		.set('X-Correlation-ID', correlationId)
		.set('X-Performed-By', actorId)
		.set('X-Performed-By-Type', role);
	return body === undefined ? call : call.send(body as object);
}

async function stored() {
	return TestDataSource.getRepository(Ticket).findOneByOrFail({ id: ticketId });
}

async function setStatus(status: string) {
	await TestDataSource.getRepository(Ticket).update(ticketId, {
		status: status as Ticket['status'],
	});
}

async function audits() {
	return TestDataSource.getRepository(TicketAuditLog).find({
		where: { ticketId },
		order: { datetime: 'ASC' },
	});
}

async function messages() {
	return TestDataSource.getRepository(TicketMessage).find({ where: { ticketId } });
}

describe('Integration: RF08 requester status actions', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await TestDataSource.getRepository(Department).insert({
			id: departmentId,
			name: 'Department',
			type: DepartmentType.Todos,
			active: true,
			createdAt: new Date('2026-09-24T18:00:00.000Z'),
			updatedAt: new Date('2026-09-24T18:00:00.000Z'),
		});
		const response = await request(buildTestApp())
			.post('/api/support/tickets')
			.set('X-Correlation-ID', correlationId)
			.send({
				subject: 'Issue',
				requesterId,
				departmentId,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				message: { message: 'Initial.' },
			});
		expect(response.status).toBe(201);
		ticketId = response.body.id;
	});
	afterAll(destroyTestDataSource);

	it.each(['backoffice', 'cd'])(
		'approves resolvido -> finalizado for owner %s, whatever the origin',
		async (role) => {
			await setStatus('resolvido');
			const before = await stored();
			const response = await act('approve', undefined, requesterId, role);
			expect(response.status).toBe(200);
			expect(response.headers['x-correlation-id']).toBe(correlationId);
			expect(response.body).toMatchObject({ id: ticketId, status: 'finalizado' });
			expect(response.body.adminStatus).toBeUndefined();
			expect((await stored()).updatedAt.getTime()).toBeGreaterThan(
				before.updatedAt.getTime(),
			);
			const all = await audits();
			expect(all).toHaveLength(2);
			expect(all[1]).toMatchObject({
				action: 'alteracao_status',
				newStatus: 'finalizado',
				authorId: requesterId,
				origin: role,
			});
		},
	);

	it('rejects resolvido -> pendente without message writing one audit only', async () => {
		await setStatus('resolvido');
		const response = await act('reject');
		expect(response.status).toBe(200);
		expect(response.body.status).toBe('pendente');
		expect(await messages()).toHaveLength(1);
		const all = await audits();
		expect(all).toHaveLength(2);
		expect(all[1]).toMatchObject({ action: 'alteracao_status', newStatus: 'pendente' });
	});

	it.each(['reject', 'cancel'] as const)(
		'%s with message and media creates a visible message and two audits',
		async (action) => {
			await setStatus(action === 'reject' ? 'resolvido' : 'em_andamento');
			const response = await act(
				action,
				{ message: 'Because.', mediaIds: ['m1', 'm2'] },
				requesterId,
				'cd',
			);
			expect(response.status).toBe(200);
			expect(response.body.status).toBe(action === 'reject' ? 'pendente' : 'cancelado');
			const all = await messages();
			expect(all).toHaveLength(2);
			expect(all.find((m) => m.message === 'Because.')).toMatchObject({
				authorId: requesterId,
				type: 'cd',
				isVisibleToRequester: true,
			});
			expect(await TestDataSource.getRepository(TicketMessageMedia).count()).toBe(2);
			const entries = await audits();
			expect(entries.map((a) => a.action).sort()).toEqual([
				'alteracao_status',
				'criacao_ticket',
				'nova_mensagem',
			]);
		},
	);

	it.each(['pendente', 'em_andamento'])('cancels from %s', async (status) => {
		await setStatus(status);
		const response = await act('cancel');
		expect(response.status).toBe(200);
		expect(response.body.status).toBe('cancelado');
		expect((await audits())[1]).toMatchObject({
			action: 'alteracao_status',
			newStatus: 'cancelado',
		});
	});

	it.each([
		['approve', 'pendente'],
		['approve', 'em_andamento'],
		['approve', 'finalizado'],
		['approve', 'cancelado'],
		['reject', 'pendente'],
		['reject', 'em_andamento'],
		['reject', 'finalizado'],
		['reject', 'cancelado'],
		['cancel', 'resolvido'],
		['cancel', 'finalizado'],
		['cancel', 'cancelado'],
	] as const)(
		'%s on %s returns 422 invalid_status_transition with no write',
		async (action, status) => {
			await setStatus(status);
			const before = await stored();
			const response = await act(action);
			expect(response.status).toBe(422);
			expect(response.body.message).toBe('invalid_status_transition');
			expect(await stored()).toEqual(before);
			expect(await audits()).toHaveLength(1);
			expect(await messages()).toHaveLength(1);
		},
	);

	it.each(['approve', 'reject', 'cancel'] as const)(
		'%s: admin and non-owner are 403',
		async (action) => {
			await setStatus('resolvido');
			expect((await act(action, undefined, 'admin-1', 'admin')).status).toBe(403);
			expect((await act(action, undefined, 'uid-other', 'cd')).status).toBe(403);
			expect((await stored()).status).toBe('resolvido');
		},
	);

	it('validates ids, headers and bodies', async () => {
		expect((await act('approve', undefined, requesterId, 'cd', 'invalid')).status).toBe(422);
		expect((await act('approve', undefined, requesterId, 'cd', absentId)).status).toBe(404);
		expect((await act('approve', undefined, requesterId, 'requester')).status).toBe(400);
		expect((await act('approve', {})).status).toBe(422);
		await setStatus('resolvido');
		const mediaOnly = await act('reject', { mediaIds: ['m1'] });
		expect(mediaOnly.status).toBe(422);
		expect((await act('reject', { message: '   ' })).status).toBe(422);
		expect((await act('reject', { message: 'x', extra: true })).status).toBe(422);
		expect((await stored()).status).toBe('resolvido');
		expect(await audits()).toHaveLength(1);
	});

	it('no longer exposes POST /resolve', async () => {
		const response = await request(buildTestApp())
			.post(`/api/support/tickets/${ticketId}/resolve`)
			.set('X-Correlation-ID', correlationId)
			.set('X-Performed-By', requesterId)
			.set('X-Performed-By-Type', 'cd');
		expect(response.status).toBe(404);
	});
});
