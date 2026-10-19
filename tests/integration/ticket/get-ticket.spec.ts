import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
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

function get(actorId = requesterId, role = 'backoffice', id = ticketId) {
	return request(buildTestApp())
		.get(`/api/support/tickets/${id}`)
		.set('X-Correlation-ID', correlationId)
		.set('X-Performed-By', actorId)
		.set('X-Performed-By-Type', role);
}

async function snapshot() {
	return {
		tickets: await TestDataSource.getRepository(Ticket).find(),
		departments: await TestDataSource.getRepository(Department).find(),
		memberships: await TestDataSource.getRepository(DepartmentAllowedUser).find(),
		messages: await TestDataSource.getRepository(TicketMessage).find(),
		media: await TestDataSource.getRepository(TicketMessageMedia).find(),
		audits: await TestDataSource.getRepository(TicketAuditLog).find(),
	};
}

describe('Integration: RF09 get ticket by ID', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await TestDataSource.getRepository(Department).insert({
			id: departmentId,
			name: 'Department',
			type: DepartmentType.Cd,
			active: true,
			createdAt: new Date('2026-09-24T18:00:00.000Z'),
			updatedAt: new Date('2026-09-24T18:00:00.000Z'),
		});
		await TestDataSource.getRepository(DepartmentAllowedUser).insert({
			departmentId,
			position: 0,
			userId: 'admin-1',
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

	it.each([
		['requester-123', 'backoffice'],
		['requester-123', 'cd'],
		['admin-1', 'admin'],
	])('returns exact Ticket for %s/%s without writes', async (actor, role) => {
		const before = await snapshot();
		const response = await get(actor, role);
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
				'status',
				'createdAt',
				'updatedAt',
			].sort(),
		);
		expect(response.body).toMatchObject({
			id: ticketId,
			requesterId,
			departmentId,
			status: 'pendente',
		});
		expect(await snapshot()).toEqual(before);
	});

	it('reads historical Ticket for admin even after Department becomes inactive', async () => {
		await TestDataSource.getRepository(Department).update(departmentId, { active: false });
		const before = await snapshot();
		expect((await get('admin-1', 'admin')).status).toBe(200);
		expect(await snapshot()).toEqual(before);
	});

	it('uses current membership and does not grant access through Department type', async () => {
		expect((await get('admin-2', 'admin')).status).toBe(403);
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId,
			userId: 'admin-1',
		});
		const before = await snapshot();
		expect((await get('admin-1', 'admin')).status).toBe(403);
		expect(await snapshot()).toEqual(before);
	});

	it.each([
		['other', 'backoffice', 403],
		['other', 'cd', 403],
		['admin-2', 'admin', 403],
		['requester-123', 'cd', 200],
	])('enforces ownership for %s/%s', async (actor, role, status) => {
		expect((await get(actor, role)).status).toBe(status);
	});

	it('distinguishes absent Ticket from denied Ticket', async () => {
		expect((await get('other', 'cd', absentId)).status).toBe(404);
		expect((await get('other', 'cd')).status).toBe(403);
	});

	it('rejects invalid UUID, query and every present body', async () => {
		for (const id of ['bad', '919cf070-ea36-11df-9382-e44d541f8005']) {
			expect((await get(requesterId, 'cd', id)).status).toBe(422);
		}
		expect((await get().query('anything=1')).status).toBe(422);
		expect((await get().query('anything=1&anything=2')).status).toBe(422);
		for (const body of ['{}', 'null', 'text']) {
			expect((await get().set('Content-Type', 'text/plain').send(body)).status).toBe(422);
		}
		for (const body of ['{}', 'null']) {
			expect((await get().set('Content-Type', 'application/json').send(body)).status).toBe(
				422,
			);
		}
	});

	it('maps unexpected repository failure to 500 without modifying data', async () => {
		const before = await snapshot();
		const read = jest.spyOn(TestDataSource.getRepository(Ticket), 'findOneBy');
		read.mockRejectedValueOnce(new Error('read failed'));
		try {
			const response = await get();
			expect(response.status).toBe(500);
			expect(response.body).toEqual({ status_code: 500, message: 'internal_error' });
		} finally {
			read.mockRestore();
		}
		expect(await snapshot()).toEqual(before);
	});

	it('validates all required headers', async () => {
		expect((await get('', 'cd')).status).toBe(400);
		expect((await get(requesterId, 'unknown')).status).toBe(400);
		expect((await request(buildTestApp()).get(`/api/support/tickets/${ticketId}`)).status).toBe(
			400,
		);
		expect((await get().set('X-Correlation-ID', 'bad')).status).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.get(`/api/support/tickets/${ticketId}`)
					.set('X-Correlation-ID', correlationId)
			).status,
		).toBe(400);
	});
});
