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

const body = (
	type: 'admin' | 'backoffice' | 'cd',
	authorId: string,
	visible = true,
	mediaIds?: string[],
) => ({
	message: '  New details  ',
	type,
	authorId,
	isVisibleToRequester: visible,
	...(mediaIds === undefined ? {} : { mediaIds }),
});

function post(
	actor = owner,
	role: 'admin' | 'backoffice' | 'cd' = 'backoffice',
	payload: unknown = body(role, actor),
	id = ticketId,
) {
	const call = request(buildTestApp())
		.post(`/api/support/tickets/${id}/messages`)
		.set('X-Correlation-ID', correlation)
		.set('X-Performed-By', actor)
		.set('X-Performed-By-Type', role);
	return payload === null
		? call.set('Content-Type', 'application/json').send('null')
		: call.send(payload as string | object);
}

async function state() {
	return {
		ticket: await TestDataSource.getRepository(Ticket).findOneByOrFail({ id: ticketId }),
		messages: await TestDataSource.getRepository(TicketMessage).find({ where: { ticketId } }),
		media: await TestDataSource.getRepository(TicketMessageMedia).find(),
		audits: await TestDataSource.getRepository(TicketAuditLog).find({ where: { ticketId } }),
	};
}

describe('Integration: RF10 create TicketMessage', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await TestDataSource.getRepository(Department).insert({
			id: departmentId,
			name: 'Support',
			type: DepartmentType.Todos,
			active: true,
			createdAt: new Date('2026-09-24T10:00:00Z'),
			updatedAt: new Date('2026-09-24T10:00:00Z'),
		});
		await TestDataSource.getRepository(DepartmentAllowedUser).insert({
			departmentId,
			userId: 'admin-1',
			position: 0,
		});
		const created = await request(buildTestApp())
			.post('/api/support/tickets')
			.set('X-Correlation-ID', correlation)
			.send({
				subject: 'Issue',
				requesterId: owner,
				departmentId,
				priority: 'alta',
				origin: 'backoffice',
				message: { message: 'Initial' },
			});
		expect(created.status).toBe(201);
		ticketId = created.body.id;
	});
	afterAll(destroyTestDataSource);

	it.each([true, false])(
		'creates admin visibility %s with one audit and only updatedAt changed',
		async (visible) => {
			const before = await state();
			const response = await post('admin-1', 'admin', body('admin', 'admin-1', visible));
			expect(response.status).toBe(201);
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
				ticketId,
				message: '  New details  ',
				type: 'admin',
				authorId: 'admin-1',
				mediaIds: [],
				isVisibleToRequester: visible,
			});
			const after = await state();
			expect(after.ticket.adminStatus).toBe(before.ticket.adminStatus);
			expect(after.ticket.requesterStatus).toBe(before.ticket.requesterStatus);
			expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(
				before.ticket.updatedAt.getTime(),
			);
			expect(after.messages).toHaveLength(2);
			expect(after.audits).toHaveLength(2);
			expect(after.audits.find((audit) => audit.action === 'nova_mensagem')).toMatchObject({
				authorId: 'admin-1',
				origin: 'admin',
				statusType: null,
				newStatus: null,
			});
			expect(after.media).toHaveLength(0);
		},
	);

	it.each(['backoffice', 'cd'] as const)(
		'creates owner %s message with ordered duplicate media and two audits',
		async (role) => {
			await TestDataSource.getRepository(Ticket).update(ticketId, {
				adminStatus: 'em_andamento' as Ticket['adminStatus'],
				requesterStatus: 'resolvido' as Ticket['requesterStatus'],
			});
			const before = await state();
			const response = await post(owner, role, body(role, owner, true, ['a', 'b', 'a']));
			expect(response.status).toBe(201);
			expect(response.body.mediaIds).toEqual(['a', 'b', 'a']);
			const after = await state();
			expect(after.ticket.adminStatus).toBe('pendente');
			expect(after.ticket.requesterStatus).toBe('resolvido');
			expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(
				before.ticket.updatedAt.getTime(),
			);
			expect(
				after.media
					.sort((a, b) => a.position - b.position)
					.map((media) => [media.position, media.mediaId]),
			).toEqual([
				[0, 'a'],
				[1, 'b'],
				[2, 'a'],
			]);
			expect(after.audits).toHaveLength(3);
			expect(after.audits.filter((audit) => audit.action === 'nova_mensagem')).toHaveLength(
				1,
			);
			expect(after.audits.find((audit) => audit.action === 'alteracao_status')).toMatchObject(
				{ authorId: owner, origin: role, statusType: 'admin', newStatus: 'pendente' },
			);
		},
	);

	it('creates another message and two audits even if already pending or request is repeated', async () => {
		const payload = body('cd', owner, true, ['x', 'x']);
		expect((await post(owner, 'cd', payload)).status).toBe(201);
		const first = await state();
		expect((await post(owner, 'cd', payload)).status).toBe(201);
		const second = await state();
		expect(first.ticket.adminStatus).toBe('pendente');
		expect(second.ticket.updatedAt.getTime()).toBeGreaterThan(first.ticket.updatedAt.getTime());
		expect(second.messages).toHaveLength(first.messages.length + 1);
		expect(second.media).toHaveLength(first.media.length + 2);
		expect(second.audits).toHaveLength(first.audits.length + 2);
		expect(second.audits.filter((audit) => audit.action === 'alteracao_status')).toHaveLength(
			2,
		);
	});

	it('allows historical inactive Department for admin member and owner', async () => {
		await TestDataSource.getRepository(Department).update(departmentId, { active: false });
		expect((await post('admin-1', 'admin', body('admin', 'admin-1', false))).status).toBe(201);
		expect((await post(owner, 'cd', body('cd', owner))).status).toBe(201);
	});

	it('denies missing membership and non-owner without any writes', async () => {
		const before = await state();
		expect((await post('other-admin', 'admin', body('admin', 'other-admin'))).status).toBe(403);
		expect((await post('other', 'cd', body('cd', 'other'))).status).toBe(403);
		expect(await state()).toEqual(before);
	});

	it.each([
		[null, 422],
		[{}, 422],
		[body('cd', owner, false), 422],
		[{ ...body('cd', owner), message: '   ' }, 422],
		[{ ...body('cd', owner), authorId: 'other' }, 422],
		[{ ...body('cd', owner), type: 'admin' }, 422],
		[{ ...body('cd', owner), mediaIds: null }, 422],
		[{ ...body('cd', owner), mediaIds: ['x', '   '] }, 422],
		[{ ...body('cd', owner), extra: true }, 422],
		[{ ...body('cd', owner), isVisibleToRequester: 'true' }, 422],
	] as const)('rejects invalid payload %# without writes', async (payload, status) => {
		const before = await state();
		expect((await post(owner, 'cd', payload)).status).toBe(status);
		expect(await state()).toEqual(before);
	});

	it('validates headers, ID, query and missing Ticket', async () => {
		const before = await state();
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/messages`)
					.set('X-Correlation-ID', correlation)
					.set('X-Performed-By', owner)
					.set('X-Performed-By-Type', 'cd')
			).status,
		).toBe(422);
		expect((await post(owner, 'cd', body('cd', owner), 'bad')).status).toBe(422);
		expect((await post(owner, 'cd', body('cd', owner), absentId)).status).toBe(404);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/messages?foo=bar`)
					.set('X-Correlation-ID', correlation)
					.set('X-Performed-By', owner)
					.set('X-Performed-By-Type', 'cd')
					.send(body('cd', owner))
			).status,
		).toBe(422);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/messages`)
					.set('X-Correlation-ID', correlation)
					.send(body('cd', owner))
			).status,
		).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.post(`/api/support/tickets/${ticketId}/messages`)
					.set('X-Correlation-ID', 'bad')
					.set('X-Performed-By', owner)
					.set('X-Performed-By-Type', 'cd')
					.send(body('cd', owner))
			).status,
		).toBe(400);
		expect(await state()).toEqual(before);
	});
});
