import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
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
const currentId = 'a19cf070-ea36-41df-9382-e44d541f8003';
const targetId = '319cf070-ea36-41df-9382-e44d541f8004';
const absentId = '919cf070-ea36-41df-9382-e44d541f8005';
const requesterId = 'requester-123';
const adminId = 'admin-123';
let ticketId: string;

async function seedDepartment(id: string, active = true, allowedUserIds: string[] = []) {
	const department = new Department();
	department.id = id;
	department.name = id === currentId ? 'Current' : 'Target';
	department.type = DepartmentType.Todos;
	department.active = active;
	department.createdAt = new Date('2026-09-17T18:00:00.000Z');
	department.updatedAt = department.createdAt;
	await TestDataSource.getRepository(Department).save(department);
	await TestDataSource.getRepository(DepartmentAllowedUser).insert(
		allowedUserIds.map((userId, position) => ({ departmentId: id, position, userId })),
	);
}

function patch(body: object | null, actorId = adminId, role = 'admin', id = ticketId) {
	return request(buildTestApp())
		.patch(`/api/support/tickets/${id}`)
		.set('X-Correlation-ID', correlationId)
		.set('X-Performed-By', actorId)
		.set('X-Performed-By-Type', role)
		.set('Content-Type', 'application/json')
		.send(body === null ? 'null' : body);
}

async function ticket() {
	return TestDataSource.getRepository(Ticket).findOneByOrFail({ id: ticketId });
}

async function audits() {
	return TestDataSource.getRepository(TicketAuditLog).find({
		where: { ticketId },
		order: { datetime: 'ASC' },
	});
}

describe('Integration: RF06 update ticket', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await seedDepartment(currentId, true, [adminId]);
		await seedDepartment(targetId, true, [adminId]);
		const created = await request(buildTestApp())
			.post('/api/support/tickets')
			.set('X-Correlation-ID', correlationId)
			.send({
				subject: 'Falha no acesso',
				requesterId,
				departmentId: currentId,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				message: { message: 'Falha inicial.' },
			});
		expect(created.status).toBe(201);
		ticketId = created.body.id;
	});
	afterAll(destroyTestDataSource);

	it('updates priority without an audit and preserves the full response', async () => {
		const before = await ticket();
		const response = await patch({ priority: 'urgente' });
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
		expect(response.body.priority).toBe('urgente');
		expect((await ticket()).priority).toBe('urgente');
		expect((await ticket()).updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
		expect(await audits()).toHaveLength(1);
	});

	it('audits an admin status change exactly once', async () => {
		const response = await patch({ status: 'resolvido' }, adminId, 'admin');
		expect(response.status).toBe(200);
		expect(response.body.status).toBe('resolvido');
		expect((await audits())[1]).toMatchObject({
			action: 'alteracao_status',
			newStatus: 'resolvido',
			authorId: adminId,
			origin: 'admin',
		});
		expect(await audits()).toHaveLength(2);
	});

	it.each(['backoffice', 'cd'])(
		'forbids %s requester status changes via PATCH without any write',
		async (role) => {
			const before = await ticket();
			const response = await patch({ status: 'cancelado' }, requesterId, role);
			expect(response.status).toBe(403);
			expect(await ticket()).toEqual(before);
			expect(await audits()).toHaveLength(1);
		},
	);

	it.each(['backoffice', 'cd'])(
		'lets %s requester edit priority alongside unchanged status rules',
		async (role) => {
			const response = await patch({ priority: 'urgente' }, requesterId, role);
			expect(response.status).toBe(200);
			expect(response.body.priority).toBe('urgente');
		},
	);

	it('accepts every status and regression while auditing each effective transition', async () => {
		for (const status of ['cancelado', 'em_andamento', 'finalizado', 'resolvido', 'pendente']) {
			const response = await patch({ status });
			expect(response.status).toBe(200);
			expect(response.body.status).toBe(status);
		}
		expect(await audits()).toHaveLength(6);
	});

	it('transfers to an active department and checks target membership for admin', async () => {
		const response = await patch({ departmentId: targetId, priority: 'baixa' });
		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ departmentId: targetId, priority: 'baixa' });
		expect(await audits()).toHaveLength(1);
		const formerAdmin = await patch({ priority: 'media' });
		expect(formerAdmin.status).toBe(200);
	});

	it('lets a requester owner transfer to any active department', async () => {
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId: targetId,
		});
		const response = await patch({ departmentId: targetId }, requesterId, 'cd');
		expect(response.status).toBe(200);
		expect((await ticket()).departmentId).toBe(targetId);
	});

	it('returns a true no-op without changing updatedAt or audits, even on inactive current department', async () => {
		await TestDataSource.getRepository(Department).update(currentId, { active: false });
		const before = await ticket();
		const response = await patch({
			priority: 'alta',
			status: 'pendente',
			departmentId: currentId,
		});
		expect(response.status).toBe(200);
		expect(response.body.updatedAt).toBe(before.updatedAt.toISOString());
		expect((await ticket()).updatedAt).toEqual(before.updatedAt);
		expect(await audits()).toHaveLength(1);
	});

	it.each([
		['admin outside current ACL', adminId, 'admin', { priority: 'media' }, 'current'],
		['nonowner backoffice', 'other-requester', 'backoffice', { priority: 'media' }, 'none'],
		['nonowner cd', 'other-requester', 'cd', { status: 'finalizado' }, 'none'],
	])('rejects %s with 403 and no write', async (_case, actor, role, body, mutation) => {
		if (mutation === 'current')
			await TestDataSource.getRepository(DepartmentAllowedUser).delete({
				departmentId: currentId,
			});
		const before = await ticket();
		const response = await patch(body, actor, role);
		expect(response.status).toBe(403);
		expect(await ticket()).toEqual(before);
		expect(await audits()).toHaveLength(1);
	});

	it('denies admin transfer without target membership and writes nothing', async () => {
		await TestDataSource.getRepository(DepartmentAllowedUser).delete({
			departmentId: targetId,
		});
		const before = await ticket();
		const response = await patch({ departmentId: targetId, status: 'finalizado' });
		expect(response.status).toBe(403);
		expect(await ticket()).toEqual(before);
		expect(await audits()).toHaveLength(1);
	});

	it('rejects inactive or missing different targets, preserving the aggregate', async () => {
		await TestDataSource.getRepository(Department).update(targetId, { active: false });
		const inactive = await patch({ departmentId: targetId });
		expect(inactive.status).toBe(422);
		expect(inactive.body.message).toBe('department_inactive');
		const absent = await patch({ departmentId: absentId });
		expect(absent.status).toBe(404);
		expect((await ticket()).departmentId).toBe(currentId);
		expect(await audits()).toHaveLength(1);
	});

	it('rejects an unknown ticket', async () => {
		const response = await patch({ priority: 'media' }, adminId, 'admin', absentId);
		expect(response.status).toBe(404);
	});

	it.each([
		{},
		[],
		null,
		{ priority: 'ALTA' },
		{ departmentId: 'invalid' },
		{ status: 'unknown' },
		{ requesterStatus: 'resolvido' },
		{ subject: 'changed' },
		{ priority: 'alta', unexpected: true },
	])('rejects an invalid body with 422', async (body) => {
		const response = await patch(body);
		expect(response.status).toBe(422);
		expect(response.body.message).toBe('validation_error');
		expect(await audits()).toHaveLength(1);
	});

	it('rejects invalid ticket UUID with 422', async () => {
		const response = await patch({ priority: 'baixa' }, adminId, 'admin', 'invalid');
		expect(response.status).toBe(422);
	});

	it.each([
		['', 'admin'],
		[' ', 'admin'],
		[adminId, 'requester'],
		[adminId, 'ADMIN'],
	])('rejects invalid actor headers with 400', async (actorId, role) => {
		const response = await patch({ priority: 'baixa' }, actorId, role);
		expect(response.status).toBe(400);
	});

	it('requires actor headers and correlation with 400', async () => {
		const noActor = await request(buildTestApp())
			.patch(`/api/support/tickets/${ticketId}`)
			.set('X-Correlation-ID', correlationId)
			.send({ priority: 'baixa' });
		expect(noActor.status).toBe(400);
		const noCorrelation = await request(buildTestApp())
			.patch(`/api/support/tickets/${ticketId}`)
			.set('X-Performed-By', adminId)
			.set('X-Performed-By-Type', 'admin')
			.send({ priority: 'baixa' });
		expect(noCorrelation.status).toBe(400);
	});
});
