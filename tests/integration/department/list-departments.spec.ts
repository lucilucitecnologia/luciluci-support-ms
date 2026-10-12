import request from 'supertest';

import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import TestDataSource from '../../../src/shared/infrastructure/database/data-source-test';
import {
	buildTestApp,
	clearDatabase,
	destroyTestDataSource,
	initializeTestDataSource,
} from '../../helpers/test-helpers';

const correlationId = '8021b0b0-5855-4c1c-8086-85bba8f4ec94';
const ids = {
	alpha: '00000000-0000-4000-8000-000000000001',
	betaFirst: '00000000-0000-4000-8000-000000000002',
	betaSecond: '00000000-0000-4000-8000-000000000003',
	inactive: '00000000-0000-4000-8000-000000000004',
};

async function insertDepartment(
	id: string,
	name: string,
	type: DepartmentType,
	active: boolean,
	allowedUserIds: string[] = [],
) {
	await TestDataSource.getRepository(Department).insert({
		id,
		name,
		type,
		active,
		createdAt: new Date('2026-09-10T18:00:00.000Z'),
		updatedAt: new Date('2026-09-10T18:05:00.000Z'),
	});
	if (allowedUserIds.length > 0) {
		await TestDataSource.getRepository(DepartmentAllowedUser).insert(
			allowedUserIds.map((userId, position) => ({ departmentId: id, position, userId })),
		);
	}
}

async function seedDepartments() {
	await insertDepartment(ids.betaSecond, 'Beta', DepartmentType.Cd, true, [
		'uid-2',
		'uid-2',
		'uid-1',
	]);
	await insertDepartment(ids.alpha, 'Alpha', DepartmentType.Todos, true);
	await insertDepartment(ids.betaFirst, 'Beta', DepartmentType.Backoffice, true, ['uid-3']);
	await insertDepartment(ids.inactive, 'Aardvark', DepartmentType.Cd, false, ['uid-hidden']);
}

function get(query = '', withCorrelation = true) {
	const builder = request(buildTestApp()).get(`/api/support/departments${query}`);
	if (withCorrelation) builder.set('X-Correlation-ID', correlationId);
	return builder;
}

describe('Integration: RF03 list departments', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(clearDatabase);
	afterAll(destroyTestDataSource);

	it('uses defaults, returns all active types, and orders by name then id', async () => {
		await seedDepartments();
		const response = await get();

		expect(response.status).toBe(200);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 3, totalPages: 1 });
		expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
			ids.alpha,
			ids.betaFirst,
			ids.betaSecond,
		]);
		expect(response.body.data.map((item: { type: string }) => item.type)).toEqual([
			'todos',
			'backoffice',
			'cd',
		]);
		expect(response.body.data[0].allowedUserIds).toEqual([]);
		expect(response.body.data[2].allowedUserIds).toEqual(['uid-2', 'uid-2', 'uid-1']);
		expect(Object.keys(response.body.data[0]).sort()).toEqual(
			['id', 'name', 'allowedUserIds', 'type', 'active', 'createdAt', 'updatedAt'].sort(),
		);
		expect(response.body.data.every((item: { active: boolean }) => item.active)).toBe(true);
	});

	it.each([
		['todos', ids.alpha],
		['backoffice', ids.betaFirst],
		['cd', ids.betaSecond],
	])('filters type=%s in the database scope', async (type, expectedId) => {
		await seedDepartments();
		const response = await get(`?type=${type}&page=1&size=20`);

		expect(response.status).toBe(200);
		expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([expectedId]);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 1, totalPages: 1 });
	});

	it('filters by repeated type params with OR semantics and dedupes values', async () => {
		await seedDepartments();
		const response = await get('?type=backoffice&type=todos&type=backoffice');

		expect(response.status).toBe(200);
		expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
			ids.alpha,
			ids.betaFirst,
		]);
		expect(response.body.pagination).toEqual({ page: 1, size: 20, total: 2, totalPages: 1 });
	});

	it('paginates deterministically and preserves totals beyond the last page', async () => {
		await seedDepartments();
		const first = await get('?page=1&size=1');
		const second = await get('?page=2&size=1');
		const last = await get('?page=3&size=1');
		const beyond = await get('?page=4&size=1');

		expect(first.body.data[0].id).toBe(ids.alpha);
		expect(second.body.data[0].id).toBe(ids.betaFirst);
		expect(last.body.data[0].id).toBe(ids.betaSecond);
		expect(beyond.status).toBe(200);
		expect(beyond.body).toEqual({
			data: [],
			pagination: { page: 4, size: 1, total: 3, totalPages: 3 },
		});
	});

	it('returns a zero-total envelope for an empty filtered result', async () => {
		await insertDepartment(ids.inactive, 'Inactive', DepartmentType.Cd, false);
		const response = await get('?type=cd&page=2&size=5');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			data: [],
			pagination: { page: 2, size: 5, total: 0, totalPages: 0 },
		});
	});

	it.each([
		['page zero', '?page=0'],
		['page negative', '?page=-1'],
		['page decimal', '?page=1.5'],
		['page text', '?page=abc'],
		['size zero', '?size=0'],
		['size over max', '?size=101'],
		['size decimal', '?size=1.5'],
		['invalid type', '?type=admin'],
		['invalid type among valid', '?type=cd&type=admin'],
		['empty type', '?type='],
		['limit alias', '?limit=20'],
		['pageSize alias', '?pageSize=20'],
		['offset alias', '?offset=0'],
		['sort alias', '?sort=name'],
		['active query', '?active=true'],
		['unknown query', '?unexpected=true'],
	])('returns 422 for %s', async (_label, query) => {
		const response = await get(query);
		expect(response.status).toBe(422);
		expect(response.body.message).toBe('validation_error');
	});

	it('returns 400 without correlation and rejects a request body with 422', async () => {
		expect((await get('', false)).status).toBe(400);
		const withBody = await request(buildTestApp())
			.get('/api/support/departments')
			.set('X-Correlation-ID', correlationId)
			.set('Content-Type', 'application/json')
			.send({ unexpected: true });
		expect(withBody.status).toBe(422);
	});

	it('does not write or change timestamps while listing', async () => {
		await seedDepartments();
		const before = await TestDataSource.getRepository(Department).find({
			order: { id: 'ASC' },
		});
		const response = await get('?page=1&size=2');
		const after = await TestDataSource.getRepository(Department).find({ order: { id: 'ASC' } });

		expect(response.status).toBe(200);
		expect(after).toEqual(before);
		expect(await TestDataSource.getRepository(Department).count()).toBe(4);
	});
});
