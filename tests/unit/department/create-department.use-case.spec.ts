import Department from '../../../src/features/department/entities/department.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import CreateDepartmentUseCase from '../../../src/features/department/use-cases/create-department.use-case';
import IDepartmentRepository from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import { FindActiveDepartmentsPageInput } from '../../../src/features/department/use-cases/repositories/idepartment.repository';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class FakeDepartmentRepository implements IDepartmentRepository {
	saved?: Department;

	async save(department: Department): Promise<Department> {
		this.saved = department;
		department.createdAt = new Date('2026-09-10T18:00:00.000Z');
		department.updatedAt = new Date('2026-09-10T18:00:00.000Z');
		return department;
	}

	async update(department: Department): Promise<Department> {
		return department;
	}

	async findById(_id: string): Promise<Department | undefined> {
		return undefined;
	}

	async findByIdForUpdate(_id: string): Promise<Department | undefined> {
		return undefined;
	}

	async replaceAllowedUsers(_departmentId: string, _userIds: string[]): Promise<void> {
		return undefined;
	}

	async findActivePage(_input: FindActiveDepartmentsPageInput) {
		return { departments: [], total: 0 };
	}
}

describe('CreateDepartmentUseCase', () => {
	it('creates an active department with UUID v4 and preserves membership order', async () => {
		const repository = new FakeDepartmentRepository();
		const response = await new CreateDepartmentUseCase(repository).execute({
			name: 'Financeiro',
			type: DepartmentType.Todos,
			allowedUserIds: ['uid-user-2', 'uid-user-1', 'uid-user-2'],
		});

		expect(response.id).toMatch(uuidV4);
		expect(response).toEqual({
			id: response.id,
			name: 'Financeiro',
			allowedUserIds: ['uid-user-2', 'uid-user-1', 'uid-user-2'],
			type: 'todos',
			active: true,
			createdAt: '2026-09-10T18:00:00.000Z',
			updatedAt: '2026-09-10T18:00:00.000Z',
		});
		expect(repository.saved?.allowedUsers.map((membership) => membership.position)).toEqual([
			0, 1, 2,
		]);
	});

	it('defaults allowedUserIds to an empty list without remote or audit dependencies', async () => {
		const repository = new FakeDepartmentRepository();
		const response = await new CreateDepartmentUseCase(repository).execute({
			name: 'Operações',
			type: DepartmentType.Cd,
		});

		expect(response.allowedUserIds).toEqual([]);
		expect(repository.saved?.allowedUsers).toEqual([]);
	});
});
