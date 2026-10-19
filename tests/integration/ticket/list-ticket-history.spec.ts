import { randomUUID } from 'node:crypto';
import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
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

const departmentId = randomUUID();
const otherDepartmentId = randomUUID();
const ticketId = randomUUID();
const otherTicketId = randomUUID();
const foreignTicketId = randomUUID();
const endpoint = '/api/support/tickets/history';
const date = new Date('2026-09-28T12:00:00.000Z');

function list(actor = 'admin-1', role = 'admin', path = endpoint) {
	return request(buildTestApp())
		.get(path)
		.set('X-Correlation-ID', randomUUID())
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

describe('Integration: RF13 scoped Ticket history', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await TestDataSource.getRepository(Department).insert([
			{
				id: departmentId,
				name: 'Inactive',
				type: 'cd' as Department['type'],
				active: false,
				createdAt: date,
				updatedAt: date,
			},
			{
				id: otherDepartmentId,
				name: 'Other',
				type: 'todos' as Department['type'],
				active: true,
				createdAt: date,
				updatedAt: date,
			},
		]);
		await TestDataSource.getRepository(DepartmentAllowedUser).insert({
			departmentId,
			userId: 'admin-1',
			position: 0,
		});
		await TestDataSource.getRepository(Ticket).insert([
			{
				id: ticketId,
				number: 11,
				subject: 'A',
				requesterId: 'owner',
				departmentId,
				priority: 'alta' as Ticket['priority'],
				origin: 'cd' as Ticket['origin'],
				originRefId: 'ref-1',
				status: 'pendente' as Ticket['status'],
				createdAt: date,
				updatedAt: date,
			},
			{
				id: otherTicketId,
				number: 12,
				subject: 'B',
				requesterId: 'owner',
				departmentId,
				priority: 'alta' as Ticket['priority'],
				origin: 'backoffice' as Ticket['origin'],
				originRefId: 'ref-1',
				status: 'pendente' as Ticket['status'],
				createdAt: date,
				updatedAt: date,
			},
			{
				id: foreignTicketId,
				number: 13,
				subject: 'C',
				requesterId: 'other-owner',
				departmentId: otherDepartmentId,
				priority: 'alta' as Ticket['priority'],
				origin: 'cd' as Ticket['origin'],
				originRefId: 'ref-1',
				status: 'pendente' as Ticket['status'],
				createdAt: date,
				updatedAt: date,
			},
		]);
		const audits: Partial<TicketAuditLog>[] = [
			{
				id: '00000000-0000-4000-8000-000000000001',
				ticketId,
				authorId: 'owner',
				origin: 'cd',
				action: 'criacao_ticket' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000002',
				ticketId,
				authorId: 'admin-1',
				origin: 'admin',
				action: 'nova_mensagem' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000003',
				ticketId,
				authorId: 'owner',
				origin: 'cd',
				action: 'nova_mensagem' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000004',
				ticketId,
				authorId: 'admin-1',
				origin: 'admin',
				action: 'nova_mensagem' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000005',
				ticketId,
				authorId: 'admin-1',
				origin: 'admin',
				action: 'alteracao_status' as TicketAuditLog['action'],
				newStatus: 'em_andamento',
			},
			{
				id: '00000000-0000-4000-8000-000000000006',
				ticketId,
				authorId: 'other',
				origin: 'backoffice',
				action: 'nova_mensagem' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000007',
				ticketId: otherTicketId,
				authorId: 'owner',
				origin: 'backoffice',
				action: 'nova_mensagem' as TicketAuditLog['action'],
			},
			{
				id: '00000000-0000-4000-8000-000000000008',
				ticketId: foreignTicketId,
				authorId: 'other-owner',
				origin: 'cd',
				action: 'criacao_ticket' as TicketAuditLog['action'],
			},
		];
		await TestDataSource.getRepository(TicketAuditLog).insert(
			audits.map((audit) => ({
				...audit,
				datetime: date,
				newStatus: audit.newStatus ?? null,
			})) as TicketAuditLog[],
		);
	});
	afterAll(destroyTestDataSource);

	it('returns all authorized admin audits, including admin messages and inactive Department', async () => {
		const before = await snapshot();
		const response = await list();
		expect(response.status).toBe(200);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 7, totalPages: 1 });
		expect(response.body.data.map((item: { authorId: string }) => item.authorId)).not.toContain(
			'other-owner',
		);
		expect(
			response.body.data.filter(
				(item: { origin: string; action: string }) =>
					item.origin === 'admin' && item.action === 'nova_mensagem',
			),
		).toHaveLength(2);
		expect(response.body.data.map((item: { ticketId: string }) => item.ticketId)).toContain(
			otherTicketId,
		);
		expect(response.body.data[0].number).toBe(12);
		expect(Object.keys(response.body.data[0]).sort()).toEqual(
			['ticketId', 'number', 'datetime', 'authorId', 'origin', 'action', 'newStatus'].sort(),
		);
		expect(await snapshot()).toEqual(before);
	});

	it.each(['cd', 'backoffice'])(
		'compacts hidden rows before %s count and pagination',
		async (role) => {
			const first = await list('owner', role, `${endpoint}?ticketId=${ticketId}&size=1`);
			expect(first.status).toBe(200);
			expect(first.body.pagination).toEqual({ page: 1, size: 1, total: 3, totalPages: 3 });
			expect(first.body.data[0]).toMatchObject({
				action: 'alteracao_status',
				newStatus: 'em_andamento',
			});
			const second = await list(
				'owner',
				role,
				`${endpoint}?ticketId=${ticketId}&size=1&page=2`,
			);
			expect(second.body.data[0]).toMatchObject({
				action: 'nova_mensagem',
				authorId: 'owner',
				newStatus: null,
			});
			const third = await list(
				'owner',
				role,
				`${endpoint}?ticketId=${ticketId}&size=1&page=3`,
			);
			expect(third.body.data[0]).toMatchObject({
				action: 'criacao_ticket',
				newStatus: null,
			});
			expect(
				(await list('owner', role, `${endpoint}?ticketId=${ticketId}&size=1&page=4`)).body,
			).toEqual({ data: [], pagination: { page: 4, size: 1, total: 3, totalPages: 3 } });
			const all = await list('owner', role);
			expect(all.body.pagination.total).toBe(4);
			expect(
				all.body.data.every(
					(item: { ticketId: string }) => item.ticketId !== foreignTicketId,
				),
			).toBe(true);
		},
	);

	it('enforces ticket existence and current ACL, while unfiltered no-scope is empty', async () => {
		expect((await list('owner', 'cd', `${endpoint}?ticketId=${foreignTicketId}`)).status).toBe(
			403,
		);
		expect(
			(await list('admin-1', 'admin', `${endpoint}?ticketId=${foreignTicketId}`)).status,
		).toBe(403);
		expect((await list('owner', 'cd', `${endpoint}?ticketId=${randomUUID()}`)).status).toBe(
			404,
		);
		expect((await list('nobody', 'admin')).body).toEqual({
			data: [],
			pagination: { page: 1, size: 20, total: 0, totalPages: 0 },
		});
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId,
			userId: 'admin-1',
		});
		expect((await list()).body.pagination.total).toBe(0);
		expect((await list('admin-1', 'admin', `${endpoint}?ticketId=${ticketId}`)).status).toBe(
			403,
		);
	});

	it('rejects invalid headers, strict query and every present body', async () => {
		for (const query of [
			'ticketId=x',
			'ticketId=',
			'ticketId=00000000-0000-1000-8000-000000000001',
			'ticketId=x&ticketId=y',
			'page=0',
			'page=%201',
			'page=-1',
			'page=1.2',
			'page=+1',
			'page=9007199254740992',
			'size=0',
			'size=101',
			'page=1&page=2',
			'foo=bar',
			'action=nova_mensagem',
		]) {
			expect((await list('admin-1', 'admin', `${endpoint}?${query}`)).status).toBe(422);
		}
		for (const body of ['{}', 'null', '[]', 'text']) {
			expect((await list().set('Content-Type', 'text/plain').send(body)).status).toBe(422);
		}
		for (const body of ['{}', 'null', '[]', '"string"']) {
			expect((await list().set('Content-Type', 'application/json').send(body)).status).toBe(
				422,
			);
		}
		expect((await list('', 'admin')).status).toBe(400);
		expect((await list('admin-1', 'wrong')).status).toBe(400);
		expect((await list().set('X-Correlation-ID', 'bad')).status).toBe(400);
		expect((await request(buildTestApp()).get(endpoint)).status).toBe(400);
	});
});
