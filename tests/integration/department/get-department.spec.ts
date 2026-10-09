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
const departmentId = '00000000-0000-4000-8000-000000000001';
const missingId = '00000000-0000-4000-8000-000000000002';
const createdAt = new Date('2026-09-10T18:00:00.000Z');
const updatedAt = new Date('2026-09-10T18:05:00.000Z');

async function insertDepartment(active: boolean) {
	await TestDataSource.getRepository(Department).insert({
		id: departmentId,
		name: 'Financeiro',
		type: DepartmentType.Todos,
		active,
		createdAt,
		updatedAt,
	});
	await TestDataSource.getRepository(DepartmentAllowedUser).insert(
		['uid-2', 'uid-2', 'uid-1'].map((userId, position) => ({
			departmentId,
			position,
			userId,
		})),
	);
}

function get(id = departmentId, withCorrelation = true) {
	const builder = request(buildTestApp()).get(`/api/support/departments/${id}`);
	if (withCorrelation) builder.set('X-Correlation-ID', correlationId);
	return builder;
}

describe('Integration: get department by id', () => {
	beforeAll(initializeTestDataSource);
	beforeEach(clearDatabase);
	afterAll(destroyTestDataSource);

	it.each([true, false])('returns the department with active=%s', async (active) => {
		await insertDepartment(active);

		const response = await get();

		expect(response.status).toBe(200);
		expect(response.headers['x-correlation-id']).toBe(correlationId);
		expect(response.body).toEqual({
			id: departmentId,
			name: 'Financeiro',
			allowedUserIds: ['uid-2', 'uid-2', 'uid-1'],
			type: 'todos',
			active,
			createdAt: createdAt.toISOString(),
			updatedAt: updatedAt.toISOString(),
		});
	});

	it('returns 404 for an unknown department', async () => {
		const response = await get(missingId);

		expect(response.status).toBe(404);
	});

	it('returns 422 for a non-UUID id', async () => {
		const response = await get('not-a-uuid');

		expect(response.status).toBe(422);
	});

	it('returns 400 without X-Correlation-ID', async () => {
		await insertDepartment(true);

		const response = await get(departmentId, false);

		expect(response.status).toBe(400);
	});
});
