import { randomUUID } from 'node:crypto';
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

const correlation = randomUUID();
const departmentId = randomUUID();
const ticketId = randomUUID();
const absentId = randomUUID();
const owner = 'owner-1';
const base = `/api/support/tickets/${ticketId}/messages`;

function list(actor = 'admin-1', role = 'admin', path = base) {
	return request(buildTestApp())
		.get(path)
		.set('X-Correlation-ID', correlation)
		.set('X-Performed-By', actor)
		.set('X-Performed-By-Type', role);
}

async function snapshot() {
	return {
		departments: await TestDataSource.getRepository(Department).find(),
		memberships: await TestDataSource.getRepository(DepartmentAllowedUser).find(),
		tickets: await TestDataSource.getRepository(Ticket).find(),
		messages: await TestDataSource.getRepository(TicketMessage).find(),
		media: await TestDataSource.getRepository(TicketMessageMedia).find(),
		audits: await TestDataSource.getRepository(TicketAuditLog).find(),
	};
}

describe('Integration: RF12 list Ticket messages', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		const date = new Date('2026-09-25T18:00:00.000Z');
		await TestDataSource.getRepository(Department).insert({
			id: departmentId,
			name: 'Support',
			type: DepartmentType.Cd,
			active: false,
			createdAt: date,
			updatedAt: date,
		});
		await TestDataSource.getRepository(DepartmentAllowedUser).insert({
			departmentId,
			userId: 'admin-1',
			position: 0,
		});
		await TestDataSource.getRepository(Ticket).insert({
			id: ticketId,
			number: 1,
			subject: 'Issue',
			requesterId: owner,
			departmentId,
			priority: 'alta' as Ticket['priority'],
			origin: 'backoffice' as Ticket['origin'],
			originRefId: 'ref-1',
			adminStatus: 'pendente' as Ticket['adminStatus'],
			requesterStatus: 'nao_resolvido' as Ticket['requesterStatus'],
			createdAt: date,
			updatedAt: date,
		});
		const messages = [
			{
				id: '00000000-0000-4000-8000-000000000003',
				message: 'visible later',
				type: 'admin',
				isVisibleToRequester: true,
				createdAt: new Date('2026-09-25T18:01:00.000Z'),
			},
			{
				id: '00000000-0000-4000-8000-000000000002',
				message: 'hidden',
				type: 'admin',
				isVisibleToRequester: false,
				createdAt: date,
			},
			{
				id: '00000000-0000-4000-8000-000000000001',
				message: 'initial',
				type: 'backoffice',
				isVisibleToRequester: true,
				createdAt: date,
			},
		];
		await TestDataSource.getRepository(TicketMessage).insert(
			messages.map((message) => ({
				...message,
				ticketId,
				type: message.type as TicketMessage['type'],
				authorId: message.type === 'admin' ? 'admin-1' : owner,
			})),
		);
		await TestDataSource.getRepository(TicketMessageMedia).insert([
			{ ticketMessageId: messages[0].id, position: 0, mediaId: 'm1' },
			{ ticketMessageId: messages[0].id, position: 1, mediaId: 'm2' },
			{ ticketMessageId: messages[0].id, position: 2, mediaId: 'm1' },
		]);
	});
	afterAll(destroyTestDataSource);

	it('returns all for member admin in ascending order, with positional duplicate media and no writes', async () => {
		const before = await snapshot();
		const response = await list();
		expect(response.status).toBe(200);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 3, totalPages: 1 });
		expect(response.body.data.map((item: TicketMessage) => item.message)).toEqual([
			'initial',
			'hidden',
			'visible later',
		]);
		expect(response.body.data[0].mediaIds).toEqual([]);
		expect(response.body.data[2].mediaIds).toEqual(['m1', 'm2', 'm1']);
		expect(Object.keys(response.body.data[0]).sort()).toEqual(
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
		expect(await snapshot()).toEqual(before);
	});

	it('filters admin visible/hidden and paginates with scoped totals', async () => {
		const visible = await list(
			'admin-1',
			'admin',
			`${base}?isVisibleToRequester=true&page=2&size=1`,
		);
		expect(visible.status).toBe(200);
		expect(visible.body.pagination).toEqual({ page: 2, size: 1, total: 2, totalPages: 2 });
		expect(visible.body.data.map((item: TicketMessage) => item.message)).toEqual([
			'visible later',
		]);
		const hidden = await list('admin-1', 'admin', `${base}?isVisibleToRequester=false`);
		expect(hidden.body.pagination.total).toBe(1);
		expect(hidden.body.data.map((item: TicketMessage) => item.message)).toEqual(['hidden']);
		const beyond = await list('admin-1', 'admin', `${base}?page=4&size=1`);
		expect(beyond.body).toEqual({
			data: [],
			pagination: { page: 4, size: 1, total: 3, totalPages: 3 },
		});
	});

	it.each(['backoffice', 'cd'])(
		'limits %s owner to visible messages and no hidden count or page position',
		async (role) => {
			const before = await snapshot();
			const response = await list(owner, role, `${base}?page=2&size=1`);
			expect(response.body.pagination).toEqual({ page: 2, size: 1, total: 2, totalPages: 2 });
			expect(response.body.data[0].message).toBe('visible later');
			expect(
				(await list(owner, role, `${base}?isVisibleToRequester=true`)).body.data,
			).toHaveLength(2);
			expect(
				(await list(owner, role, `${base}?isVisibleToRequester=false&page=3&size=2`)).body,
			).toEqual({ data: [], pagination: { page: 3, size: 2, total: 0, totalPages: 0 } });
			expect(await snapshot()).toEqual(before);
		},
	);

	it('enforces ACL before any requester false shortcut and current membership', async () => {
		expect((await list('other', 'cd', `${base}?isVisibleToRequester=false`)).status).toBe(403);
		expect((await list('other', 'admin')).status).toBe(403);
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId,
			userId: 'admin-1',
		});
		expect((await list()).status).toBe(403);
		expect((await list(owner, 'cd')).status).toBe(200);
	});

	it('rejects path, query, body, and actor errors with the RF12 matrix', async () => {
		expect(
			(await list('admin-1', 'admin', `/api/support/tickets/${absentId}/messages`)).status,
		).toBe(404);
		expect((await list('admin-1', 'admin', '/api/support/tickets/bad/messages')).status).toBe(
			422,
		);
		for (const query of [
			'page=0',
			'page=1.2',
			'page=+1',
			'page=9007199254740992',
			'size=0',
			'size=101',
			'size=-1',
			'isVisibleToRequester=TRUE',
			'isVisibleToRequester=',
			'page=1&page=2',
			'visible=true',
			'include=media',
		]) {
			expect((await list('admin-1', 'admin', `${base}?${query}`)).status).toBe(422);
		}
		for (const body of ['{}', 'null', '[]', 'text']) {
			expect((await list().set('Content-Type', 'text/plain').send(body)).status).toBe(422);
		}
		expect((await list('', 'admin')).status).toBe(400);
		expect((await list('admin-1', 'wrong')).status).toBe(400);
		expect((await list().set('X-Correlation-ID', 'bad')).status).toBe(400);
		expect((await request(buildTestApp()).get(base)).status).toBe(400);
	});
});
