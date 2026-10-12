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

const correlation = 'ad832142-1a9d-42b2-988a-b964be0ad5f0';
const departmentId = 'a19cf070-ea36-41df-9382-e44d541f8003';
const absentId = '919cf070-ea36-41df-9382-e44d541f8005';
const owner = 'owner-1';
let ticketId: string;
let adminMessageId: string;

function patch(
	actor = 'admin-b',
	role = 'admin',
	payload: unknown = { isVisibleToRequester: false },
	id = adminMessageId,
	targetTicket = ticketId,
) {
	const call = request(buildTestApp())
		.patch(`/api/support/tickets/${targetTicket}/messages/${id}/visibility`)
		.set('X-Correlation-ID', correlation)
		.set('X-Performed-By', actor)
		.set('X-Performed-By-Type', role);
	if (payload === '__absent__') return call;
	return payload === null
		? call.set('Content-Type', 'application/json').send('null')
		: call.set('Content-Type', 'application/json').send(payload as string | object);
}

async function snapshot() {
	return {
		tickets: await TestDataSource.getRepository(Ticket).find(),
		messages: await TestDataSource.getRepository(TicketMessage).find(),
		media: await TestDataSource.getRepository(TicketMessageMedia).find(),
		audits: await TestDataSource.getRepository(TicketAuditLog).find(),
	};
}

describe('Integration: RF11 admin Message visibility', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await TestDataSource.getRepository(Department).insert({
			id: departmentId,
			name: 'Support',
			type: DepartmentType.Cd,
			active: true,
			createdAt: new Date('2026-09-24T10:00:00Z'),
			updatedAt: new Date('2026-09-24T10:00:00Z'),
		});
		await TestDataSource.getRepository(DepartmentAllowedUser).insert([
			{ departmentId, userId: 'admin-a', position: 0 },
			{ departmentId, userId: 'admin-b', position: 1 },
		]);
		const ticket = await request(buildTestApp())
			.post('/api/support/tickets')
			.set('X-Correlation-ID', correlation)
			.send({
				subject: 'Issue',
				requesterId: owner,
				departmentId,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				message: { message: 'Initial' },
			});
		expect(ticket.status).toBe(201);
		ticketId = ticket.body.id;
		const message = await request(buildTestApp())
			.post(`/api/support/tickets/${ticketId}/messages`)
			.set('X-Correlation-ID', correlation)
			.set('X-Performed-By', 'admin-a')
			.set('X-Performed-By-Type', 'admin')
			.send({
				message: 'Admin message',
				type: 'admin',
				authorId: 'admin-a',
				mediaIds: ['x', 'y', 'x'],
				isVisibleToRequester: true,
			});
		expect(message.status).toBe(201);
		adminMessageId = message.body.id;
	});
	afterAll(destroyTestDataSource);

	it('allows another admin to hide and reveal while preserving Ticket, media and audits', async () => {
		await TestDataSource.getRepository(Department).update(departmentId, { active: false });
		const before = await snapshot();
		for (const visible of [false, true]) {
			const response = await patch('admin-b', 'admin', { isVisibleToRequester: visible });
			expect(response.status).toBe(200);
			expect(Object.keys(response.body).sort()).toEqual(
				[
					'id',
					'ticketId',
					'message',
					'type',
					'authorId',
					'mediaIds',
					'isVisibleToRequester',
					'createdAt',
				].sort(),
			);
			expect(response.body).toMatchObject({
				id: adminMessageId,
				authorId: 'admin-a',
				mediaIds: ['x', 'y', 'x'],
				isVisibleToRequester: visible,
			});
			const after = await snapshot();
			expect(after.tickets).toEqual(before.tickets);
			expect(after.media).toEqual(before.media);
			expect(after.audits).toEqual(before.audits);
			expect(after.messages.find((message) => message.id === adminMessageId)).toMatchObject({
				message: 'Admin message',
				type: 'admin',
				authorId: 'admin-a',
				isVisibleToRequester: visible,
			});
		}
	});

	it('returns same response for no-op without changing logical rows', async () => {
		const before = await snapshot();
		const response = await patch('admin-b', 'admin', { isVisibleToRequester: true });
		expect(response.status).toBe(200);
		expect(response.body.mediaIds).toEqual(['x', 'y', 'x']);
		expect(await snapshot()).toEqual(before);
	});

	it('denies requesters and admins without membership before Message access', async () => {
		const before = await snapshot();
		for (const role of ['backoffice', 'cd']) {
			expect((await patch(owner, role)).status).toBe(403);
		}
		expect((await patch('admin-other', 'admin')).status).toBe(403);
		expect(await snapshot()).toEqual(before);
	});

	it('enforces Message scope and admin type without writes', async () => {
		const initial = await TestDataSource.getRepository(TicketMessage).findOneByOrFail({
			ticketId,
			type: 'backoffice',
		});
		const requesterMessage = await request(buildTestApp())
			.post(`/api/support/tickets/${ticketId}/messages`)
			.set('X-Correlation-ID', correlation)
			.set('X-Performed-By', owner)
			.set('X-Performed-By-Type', 'cd')
			.send({
				message: 'Requester reply',
				type: 'cd',
				authorId: owner,
				isVisibleToRequester: true,
			});
		expect(requesterMessage.status).toBe(201);
		const otherTicketId = 'f57d57a6-3b94-4d4b-bf09-73c127e02c49';
		await TestDataSource.getRepository(Ticket).insert({
			...(await TestDataSource.getRepository(Ticket).findOneByOrFail({ id: ticketId })),
			id: otherTicketId,
			number: 999,
		});
		const crossMessageId = 'f57d57a6-3b94-4d4b-bf09-73c127e02c50';
		await TestDataSource.getRepository(TicketMessage).insert({
			...(await TestDataSource.getRepository(TicketMessage).findOneByOrFail({
				id: adminMessageId,
			})),
			id: crossMessageId,
			ticketId: otherTicketId,
		});
		const before = await snapshot();
		for (const id of [initial.id, requesterMessage.body.id]) {
			expect(
				(await patch('admin-b', 'admin', { isVisibleToRequester: false }, id)).status,
			).toBe(422);
		}
		for (const id of [absentId, crossMessageId]) {
			expect(
				(await patch('admin-b', 'admin', { isVisibleToRequester: false }, id)).status,
			).toBe(404);
		}
		expect(await snapshot()).toEqual(before);
	});

	it.each([
		['__absent__', 422],
		[null, 422],
		[{}, 422],
		[[], 422],
		[123, 422],
		['true', 422],
		[{ isVisibleToRequester: 'false' }, 422],
		[{ isVisibleToRequester: 0 }, 422],
		[{ isVisibleToRequester: false, extra: true }, 422],
		[{ visible: false }, 422],
		[{ visibility: false }, 422],
	] as const)('rejects invalid body %#', async (payload, status) => {
		const before = await snapshot();
		expect((await patch('admin-b', 'admin', payload)).status).toBe(status);
		expect(await snapshot()).toEqual(before);
	});

	it('validates IDs, query and headers and leaves RF13 unavailable', async () => {
		const before = await snapshot();
		expect(
			(await patch('admin-b', 'admin', { isVisibleToRequester: false }, 'bad')).status,
		).toBe(422);
		expect(
			(
				await patch(
					'admin-b',
					'admin',
					{ isVisibleToRequester: false },
					adminMessageId,
					'bad',
				)
			).status,
		).toBe(422);
		expect(
			(
				await patch(
					'admin-b',
					'admin',
					{ isVisibleToRequester: false },
					adminMessageId,
					absentId,
				)
			).status,
		).toBe(404);
		expect((await patch('admin-b', 'admin').query('foo=bar')).status).toBe(422);
		expect((await patch('admin-b', 'wrong')).status).toBe(400);
		expect((await patch('', 'admin')).status).toBe(400);
		expect((await patch().set('X-Correlation-ID', 'bad')).status).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.patch(`/api/support/tickets/${ticketId}/messages/${adminMessageId}/visibility`)
					.send({ isVisibleToRequester: false })
			).status,
		).toBe(400);
		expect(await snapshot()).toEqual(before);
	});
});
