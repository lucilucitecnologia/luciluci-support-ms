import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAdminStatus from '../../../src/features/ticket/entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../../../src/features/ticket/entities/enums/ticket-requester-status.enum';
import TicketAuditLog from '../../../src/features/ticket/entities/ticket-audit-log.entity';
import TestDataSource from '../../../src/shared/infrastructure/database/data-source-test';
import {
	buildTestApp,
	clearDatabase,
	destroyTestDataSource,
	initializeTestDataSource,
} from '../../helpers/test-helpers';

const correlationId = 'f9c36032-81a1-49f9-940a-a507427a21ce';
const departmentA = 'f9c36032-81a1-49f9-940a-a507427a2101';
const departmentB = 'f9c36032-81a1-49f9-940a-a507427a2102';
const departmentC = 'f9c36032-81a1-49f9-940a-a507427a2103';
const requesterA = 'external-requester-a';
const requesterB = 'external-requester-b';
const adminA = 'external-admin-a';
const adminB = 'external-admin-b';

type TicketSeed = {
	number: number;
	requesterId: string;
	departmentId: string;
	createdAt: string;
	status?: TicketAdminStatus;
	origin?: TicketOrigin;
	priority?: TicketPriority;
};

async function seedDepartment(id: string, active: boolean, members: string[]) {
	const department = Object.assign(new Department(), {
		id,
		name: id,
		type: DepartmentType.Todos,
		active,
		createdAt: new Date('2026-08-01T00:00:00.000Z'),
		updatedAt: new Date('2026-08-01T00:00:00.000Z'),
	});
	await TestDataSource.getRepository(Department).save(department);
	await TestDataSource.getRepository(DepartmentAllowedUser).insert(
		members.map((userId, position) => ({ departmentId: id, position, userId })),
	);
}

async function seedTicket(input: TicketSeed): Promise<Ticket> {
	const timestamp = new Date(input.createdAt);
	const ticket = Object.assign(new Ticket(), {
		id: `f9c36032-81a1-49f9-940a-a507427a${String(input.number).padStart(4, '0')}`,
		number: input.number,
		subject: `Ticket ${input.number}`,
		requesterId: input.requesterId,
		departmentId: input.departmentId,
		priority: input.priority ?? TicketPriority.Alta,
		origin: input.origin ?? TicketOrigin.Backoffice,
		adminStatus: input.status ?? TicketAdminStatus.Pendente,
		requesterStatus: TicketRequesterStatus.NaoResolvido,
		createdAt: timestamp,
		updatedAt: timestamp,
	});
	await TestDataSource.getRepository(Ticket).save(ticket);
	return ticket;
}

function list(path: string, actorId: string, role: string, query = '') {
	return request(buildTestApp())
		.get(`/api/support/tickets/${path}${query}`)
		.set('X-Correlation-ID', correlationId)
		.set('X-Performed-By', actorId)
		.set('X-Performed-By-Type', role);
}

describe('Integration: RF07a/RF07b ticket listings', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await seedDepartment(departmentA, true, [adminA, adminA]);
		await seedDepartment(departmentB, false, [adminA, adminB]);
		await seedDepartment(departmentC, true, [adminB]);
		await seedTicket({
			number: 1,
			requesterId: requesterA,
			departmentId: departmentA,
			createdAt: '2026-09-01T00:00:00.000Z',
			origin: TicketOrigin.Cd,
		});
		await seedTicket({
			number: 2,
			requesterId: requesterA,
			departmentId: departmentB,
			createdAt: '2026-09-04T23:59:59.999Z',
			status: TicketAdminStatus.Resolvido,
			priority: TicketPriority.Urgente,
		});
		await seedTicket({
			number: 3,
			requesterId: requesterB,
			departmentId: departmentA,
			createdAt: '2026-09-05T00:00:00.000Z',
			status: TicketAdminStatus.EmAndamento,
		});
		await seedTicket({
			number: 4,
			requesterId: requesterB,
			departmentId: departmentC,
			createdAt: '2026-09-04T23:59:59.999Z',
		});
	});
	afterAll(destroyTestDataSource);

	it('RF07a applies ownership in the database, independently of ticket origin', async () => {
		const response = await list(`requester/${requesterA}`, requesterA, 'backoffice');
		expect(response.status).toBe(200);
		expect(response.headers['x-correlation-id']).toBe(correlationId);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 2, totalPages: 1 });
		expect(response.body.data.map((item: { number: number }) => item.number)).toEqual([2, 1]);
		expect(Object.keys(response.body.data[0]).sort()).toEqual(
			[
				'id',
				'number',
				'subject',
				'createdAt',
				'departmentId',
				'requesterId',
				'origin',
				'priority',
				'status',
			].sort(),
		);
		expect(response.body.data[0].status).toBe('resolvido');
		expect(await TestDataSource.getRepository(TicketAuditLog).count()).toBe(0);
	});

	it('RF07b applies current membership without duplicate tickets or an active/type gate', async () => {
		const response = await list(`admin/${adminA}`, adminA, 'admin');
		expect(response.status).toBe(200);
		expect(response.body.pagination.total).toBe(3);
		expect(response.body.data.map((item: { number: number }) => item.number)).toEqual([
			3, 2, 1,
		]);
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId: departmentB,
		});
		const afterMembershipChange = await list(`admin/${adminA}`, adminA, 'admin');
		expect(afterMembershipChange.body.pagination.total).toBe(2);
		expect(
			afterMembershipChange.body.data.map((item: { number: number }) => item.number),
		).toEqual([3, 1]);
	});

	it('combines filters by AND after ACL and treats a valid unmatched UUID as empty', async () => {
		const response = await list(
			`admin/${adminA}`,
			adminA,
			'admin',
			`?requesterId=${requesterA}&number=2&status=resolvido&origin=backoffice&departmentId=${departmentB}&priority=urgente&startDate=04/09/2026&endDate=04/09/2026`,
		);
		expect(response.status).toBe(200);
		expect(response.body.pagination.total).toBe(1);
		expect(response.body.data[0].number).toBe(2);
		const unmatched = await list(
			`admin/${adminA}`,
			adminA,
			'admin',
			'?departmentId=f9c36032-81a1-49f9-940a-a507427a2199',
		);
		expect(unmatched.status).toBe(200);
		expect(unmatched.body.pagination).toMatchObject({ total: 0, totalPages: 0 });
		expect(unmatched.body.data).toEqual([]);
	});

	it('uses UTC civil-day boundaries and accepts either bound alone', async () => {
		const end = await list(`admin/${adminA}`, adminA, 'admin', '?endDate=04/09/2026');
		expect(end.body.data.map((item: { number: number }) => item.number)).toEqual([2, 1]);
		const start = await list(`admin/${adminA}`, adminA, 'admin', '?startDate=05/09/2026');
		expect(start.body.data.map((item: { number: number }) => item.number)).toEqual([3]);
	});

	it('orders tied timestamps by id DESC and preserves metadata past the last page', async () => {
		const tied = await seedTicket({
			number: 5,
			requesterId: requesterA,
			departmentId: departmentA,
			createdAt: '2026-09-04T23:59:59.999Z',
		});
		const first = await list(`requester/${requesterA}`, requesterA, 'cd', '?page=1&size=1');
		expect(first.body.pagination).toEqual({ page: 1, size: 1, total: 3, totalPages: 3 });
		expect(first.body.data[0].id).toBe(tied.id);
		const beyond = await list(`requester/${requesterA}`, requesterA, 'cd', '?page=4&size=1');
		expect(beyond.status).toBe(200);
		expect(beyond.body).toEqual({
			data: [],
			pagination: { page: 4, size: 1, total: 3, totalPages: 3 },
		});
	});

	it.each([
		['?page=0', 'page'],
		['?size=101', 'size'],
		['?number=0', 'number'],
		['?status=wrong', 'status'],
		['?origin=admin', 'origin'],
		['?departmentId=wrong', 'departmentId'],
		['?priority=critical', 'priority'],
		['?startDate=31/02/2026', 'startDate'],
		['?startDate=2026-09-01', 'startDate'],
		['?startDate=05/09/2026&endDate=04/09/2026', 'startDate'],
		['?status=pendente&status=resolvido', 'status'],
		['?page=1&page=2', 'page'],
		['?limit=5', 'limit'],
		['?sort=createdAt', 'sort'],
		['?requesterId=', 'requesterId'],
	])('rejects invalid admin query %s with 422 (%s)', async (query) => {
		const response = await list(`admin/${adminA}`, adminA, 'admin', query);
		expect(response.status).toBe(422);
		expect(response.body.message).toBe('validation_error');
	});

	it('rejects requesterId query on RF07a and actor role or path mismatch', async () => {
		expect(
			(await list(`requester/${requesterA}`, requesterA, 'cd', '?requesterId=x')).status,
		).toBe(422);
		expect((await list(`requester/${requesterA}`, requesterA, 'admin')).status).toBe(403);
		expect((await list(`requester/${requesterA}`, requesterB, 'cd')).status).toBe(403);
		expect((await list(`admin/${adminA}`, adminA, 'cd')).status).toBe(403);
		expect((await list(`admin/${adminA}`, adminB, 'admin')).status).toBe(403);
	});

	it('returns 400 for missing or invalid actor and correlation headers', async () => {
		const path = `/api/support/tickets/requester/${requesterA}`;
		expect(
			(await request(buildTestApp()).get(path).set('X-Correlation-ID', correlationId)).status,
		).toBe(400);
		expect((await list(`requester/${requesterA}`, ' ', 'cd')).status).toBe(400);
		expect((await list(`requester/${requesterA}`, requesterA, 'requester')).status).toBe(400);
		expect(
			(
				await request(buildTestApp())
					.get(path)
					.set('X-Performed-By', requesterA)
					.set('X-Performed-By-Type', 'cd')
			).status,
		).toBe(400);
	});
});
