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
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validBody = {
	subject: 'Falha no acesso',
	requesterId: 'requester-123',
	departmentId,
	priority: 'alta',
	origin: 'backoffice',
	originRefId: 'ref-1',
	message: {
		message: 'Não consigo acessar o painel.',
		mediaIds: ['media-2', 'media-1', 'media-2'],
	},
};

async function seedDepartment(active = true) {
	const department = new Department();
	department.id = departmentId;
	department.name = 'Atendimento';
	department.type = DepartmentType.Todos;
	department.active = active;
	department.allowedUsers = [];
	department.createdAt = new Date('2026-09-17T18:00:00.000Z');
	department.updatedAt = department.createdAt;
	await TestDataSource.getRepository(Department).save(department);
}

function post(body: object, headers: Record<string, string> = {}) {
	return request(buildTestApp())
		.post('/api/support/tickets')
		.set('X-Correlation-ID', correlationId)
		.set(headers)
		.send(body);
}

describe('Integration: RF05 create ticket', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(async () => {
		await clearDatabase();
		await seedDepartment();
	});
	afterAll(destroyTestDataSource);

	it('creates the aggregate and returns only the frozen Ticket response', async () => {
		const response = await post(validBody);

		expect(response.status).toBe(201);
		expect(response.headers.location).toBeUndefined();
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
			id: expect.stringMatching(uuidV4),
			number: 1,
			subject: validBody.subject,
			requesterId: validBody.requesterId,
			departmentId,
			priority: 'alta',
			origin: 'backoffice',
			originRefId: 'ref-1',
			status: 'pendente',
		});
		expect(response.body.createdAt).toBe(response.body.updatedAt);

		const ticket = await TestDataSource.getRepository(Ticket).findOneByOrFail({
			id: response.body.id,
		});
		const message = await TestDataSource.getRepository(TicketMessage).findOneByOrFail({
			ticketId: ticket.id,
		});
		const media = await TestDataSource.getRepository(TicketMessageMedia).find({
			where: { ticketMessageId: message.id },
			order: { position: 'ASC' },
		});
		const audits = await TestDataSource.getRepository(TicketAuditLog).findBy({
			ticketId: ticket.id,
		});

		expect(message).toMatchObject({
			message: validBody.message.message,
			type: 'backoffice',
			authorId: validBody.requesterId,
			isVisibleToRequester: true,
		});
		expect(media.map(({ position, mediaId }) => ({ position, mediaId }))).toEqual([
			{ position: 0, mediaId: 'media-2' },
			{ position: 1, mediaId: 'media-1' },
			{ position: 2, mediaId: 'media-2' },
		]);
		expect(audits).toHaveLength(1);
		expect(audits[0]).toMatchObject({
			action: 'criacao_ticket',
			authorId: validBody.requesterId,
			origin: 'backoffice',
			newStatus: null,
		});
	});

	it('defaults mediaIds to no relational rows and allocates the next number', async () => {
		await post(validBody);
		const body = { ...validBody, message: { message: 'Sem anexos.' } };
		const response = await post(body);
		expect(response.status).toBe(201);
		expect(response.body.number).toBe(2);
		expect(await TestDataSource.getRepository(TicketMessageMedia).count()).toBe(3);
	});

	it('stores and returns the optional originRefId', async () => {
		const response = await post({ ...validBody, originRefId: 'cd-42' });

		expect(response.status).toBe(201);
		expect(response.body.originRefId).toBe('cd-42');
		const stored = await TestDataSource.getRepository(Ticket).findOneByOrFail({
			id: response.body.id,
		});
		expect(stored.originRefId).toBe('cd-42');
	});

	it('does not require performed-by or idempotency headers and ignores neither', async () => {
		const response = await post(validBody, {
			'X-Performed-By': 'not-part-of-rf05',
			'Idempotency-Key': 'not-part-of-rf05',
		});
		expect(response.status).toBe(201);
	});

	it('returns 404 for an unknown department without partial writes', async () => {
		const response = await post({
			...validBody,
			departmentId: '952856a6-60ed-45f6-b1ee-2ac45281cbf1',
		});
		expect(response.status).toBe(404);
		expect(response.body.message).toBe('not_found');
		expect(await TestDataSource.getRepository(Ticket).count()).toBe(0);
	});

	it('returns department_inactive and creates no aggregate', async () => {
		await TestDataSource.getRepository(Department).update(
			{ id: departmentId },
			{ active: false },
		);
		const response = await post(validBody);
		expect(response.status).toBe(422);
		expect(response.body.message).toBe('department_inactive');
		expect(await TestDataSource.getRepository(Ticket).count()).toBe(0);
	});

	it('requires the correlation header before any write', async () => {
		const response = await request(buildTestApp()).post('/api/support/tickets').send(validBody);
		expect(response.status).toBe(400);
		expect(response.body.message).toBe('bad_request');
		expect(await TestDataSource.getRepository(Ticket).count()).toBe(0);
	});

	it('rejects an invalid correlation header before any write', async () => {
		const response = await request(buildTestApp())
			.post('/api/support/tickets')
			.set('X-Correlation-ID', 'invalid')
			.send(validBody);
		expect(response.status).toBe(400);
		expect(response.body.message).toBe('bad_request');
		expect(await TestDataSource.getRepository(Ticket).count()).toBe(0);
	});

	it.each([
		['missing subject', (({ subject: _subject, ...body }) => body)(validBody)],
		['blank subject', { ...validBody, subject: '   ' }],
		['empty subject', { ...validBody, subject: '' }],
		['missing requesterId', (({ requesterId: _requesterId, ...body }) => body)(validBody)],
		['blank requesterId', { ...validBody, requesterId: ' ' }],
		['non-v4 departmentId', { ...validBody, departmentId: 'department-1' }],
		['invalid priority', { ...validBody, priority: 'critica' }],
		['invalid origin', { ...validBody, origin: 'app' }],
		['missing originRefId', (({ originRefId: _originRefId, ...body }) => body)(validBody)],
		['blank originRefId', { ...validBody, originRefId: '  ' }],
		['non-string originRefId', { ...validBody, originRefId: 42 }],
		['missing message', (({ message: _message, ...body }) => body)(validBody)],
		['blank message', { ...validBody, message: { message: ' ' } }],
		['empty message', { ...validBody, message: { message: '' } }],
		[
			'mediaIds is not an array',
			{ ...validBody, message: { message: 'x', mediaIds: 'media-1' } },
		],
		['blank media item', { ...validBody, message: { message: 'x', mediaIds: [''] } }],
		['unknown root field', { ...validBody, status: 'pendente' }],
		[
			'unknown message field',
			{ ...validBody, message: { ...validBody.message, authorId: 'x' } },
		],
		['generated id', { ...validBody, id: 'client-id' }],
		['generated number', { ...validBody, number: 99 }],
		['generated admin status', { ...validBody, status: 'pendente' }],
		['generated requester status', { ...validBody, requesterStatus: 'nao_resolvido' }],
		['generated timestamp', { ...validBody, createdAt: '2026-09-17T18:00:00.000Z' }],
	])('returns 422 for %s', async (_label, body) => {
		const response = await post(body);
		expect(response.status).toBe(422);
		expect(response.body.message).toBe('validation_error');
	});

	it.each([
		['GET', '/api/support/tickets'],
		['PATCH', '/api/support/tickets/113f6164-9f15-493c-8386-ac81670986e1/admin-status'],
		['PATCH', '/api/support/tickets/113f6164-9f15-493c-8386-ac81670986e1/requester-status'],
	])('keeps pending operation %s %s unavailable', async (method, path) => {
		const response = await request(buildTestApp())
			[method.toLowerCase() as 'get'](path)
			.set('X-Correlation-ID', correlationId);
		expect(response.status).toBe(404);
	});
});
