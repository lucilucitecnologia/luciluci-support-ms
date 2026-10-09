import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import GetDepartmentUseCase from '../../../src/features/department/use-cases/get-department.use-case';
import IDepartmentRepository from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import NotFoundError from '../../../src/shared/kernel/exceptions/not-found.error';

function buildDepartment(active: boolean): Department {
	const department = new Department();
	department.id = '550e8400-e29b-41d4-a716-446655440000';
	department.name = 'Financeiro';
	department.type = DepartmentType.Todos;
	department.active = active;
	department.createdAt = new Date('2026-09-10T18:00:00.000Z');
	department.updatedAt = new Date('2026-09-10T18:10:00.000Z');
	department.allowedUsers = ['uid-2', 'uid-2', 'uid-1'].map((userId, position) =>
		Object.assign(new DepartmentAllowedUser(), {
			departmentId: department.id,
			position,
			userId,
		}),
	);
	return department;
}

function buildRepository(department?: Department) {
	return {
		findById: jest.fn(async () => department),
	} as unknown as jest.Mocked<IDepartmentRepository>;
}

describe('GetDepartmentUseCase', () => {
	it.each([true, false])('returns the list shape for active=%s', async (active) => {
		const department = buildDepartment(active);
		const repository = buildRepository(department);

		const response = await new GetDepartmentUseCase(repository).execute(department.id);

		expect(repository.findById).toHaveBeenCalledWith(department.id);
		expect(response).toEqual({
			id: department.id,
			name: 'Financeiro',
			allowedUserIds: ['uid-2', 'uid-2', 'uid-1'],
			type: 'todos',
			active,
			createdAt: '2026-09-10T18:00:00.000Z',
			updatedAt: '2026-09-10T18:10:00.000Z',
		});
	});

	it('throws not_found when the department does not exist', async () => {
		await expect(
			new GetDepartmentUseCase(buildRepository()).execute('missing'),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
