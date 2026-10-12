import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAuditLog from '../../../src/features/ticket/entities/ticket-audit-log.entity';
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

function resolve(actorId = requesterId, role = 'backoffice', id = ticketId) {
	return request(buildTestApp())
		.post(`/api/support/tickets/${id}/resolve`)
		.set('X-Correlation-ID', correlationId)
		.set('X-Performed-By', actorId)
		.set('X-Performed-By-Type', role);
}

async function stored() {
	return TestDataSource.getRepository(Ticket).findOneByOrFail({ id: ticketId });
}

async function audits() {
	return TestDataSource.getRepository(TicketAuditLog).find({ where: { ticketId } });
}

describe('Integration: RF08 resolve ticket', () => {
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
		'resolves for owner %s, including role different from origin',
		async (role) => {
			const before = await stored();
			const response = await resolve(requesterId, role);
			expect(response.status).toBe(200);
			expect(response.headers['x-correlation-id']).toBe(correlationId);
			expect(Object.keys(response.body).sort()).toEqual(
				[
					'id',
					'number',
					'subject',
					'requesterId',
					'departmentId',
					'priority',
					'origin',
					'originRefId',
					'adminStatus',
					'requesterStatus',
					'createdAt',
					'updatedAt',
				].sort(),
			);
			expect(response.body).toMatchObject({
				id: ticketId,
				requesterStatus: 'resolvido',
				adminStatus: 'pendente',
				priority: 'alta',
				departmentId,
			});
			expect((await stored()).updatedAt.getTime()).toBeGreaterThan(
				before.updatedAt.getTime(),
			);
			expect(await audits()).toHaveLength(2);
			expect((await audits())[1]).toMatchObject({
				action: 'alteracao_status',
				statusType: 'requester',
				newStatus: 'resolvido',
				authorId: requesterId,
				origin: role,
			});
		},
	);

	it('returns no-op without timestamp or audit changes', async () => {
		expect((await resolve()).status).toBe(200);
		const before = await stored();
		const count = (await audits()).length;
		const response = await resolve();
		expect(response.status).toBe(200);
		expect(response.body.updatedAt).toBe(before.updatedAt.toISOString());
		expect(await stored()).toEqual(before);
		expect(await audits()).toHaveLength(count);
	});

	it('resolves a historical ticket in an inactive Department', async () => {
		await TestDataSource.getRepository(Department).update(departmentId, { active: false });
		expect((await resolve()).status).toBe(200);
		expect((await stored()).requesterStatus).toBe('resolvido');
	});

	it.each([
		['admin', 'admin'],
		['other', 'backoffice'],
	])('forbids %s without writes', async (actor, role) => {
		const before = await stored();
		expect((await resolve(actor, role)).status).toBe(403);
		expect(await stored()).toEqual(before);
		expect(await audits()).toHaveLength(1);
	});

	it.each([{}, null, { status: 'resolvido' }, { reason: 'done' }])(
		'rejects any present body with 422',
		async (body) => {
			const response = resolve()
				.set('Content-Type', 'application/json')
				.send(body === null ? 'null' : body);
			expect((await response).status).toBe(422);
			expect(await audits()).toHaveLength(1);
		},
	);

	it('rejects a non-JSON body and malformed JSON as present bodies', async () => {
		expect((await resolve().set('Content-Type', 'text/plain').send('anything')).status).toBe(
			422,
		);
		expect((await resolve().set('Content-Type', 'application/json').send('{bad')).status).toBe(
			422,
		);
		expect(await audits()).toHaveLength(1);
	});

	it('validates headers, path and existence', async () => {
		expect((await resolve(requesterId, 'cd', 'bad')).status).toBe(422);
		expect((await resolve(requesterId, 'cd', absentId)).status).toBe(404);
		expect((await resolve(requesterId, 'invalid')).status).toBe(400);
		expect((await resolve('', 'cd')).status).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/resolve`)
					.set('X-Correlation-ID', correlationId)
			).status,
		).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/resolve`)
					.set('X-Correlation-ID', correlationId)
					.set('X-Performed-By', requesterId)
			).status,
		).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/resolve`)
					.set('X-Correlation-ID', 'bad')
					.set('X-Performed-By', requesterId)
					.set('X-Performed-By-Type', 'cd')
			).status,
		).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/resolve`)
					.set('X-Performed-By', requesterId)
					.set('X-Performed-By-Type', 'cd')
			).status,
		).toBe(400);
	});
});
