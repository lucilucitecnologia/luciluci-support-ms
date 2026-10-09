import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import DeleteDepartmentUseCase from '../../../src/features/department/use-cases/delete-department.use-case';
import IDepartmentRepository, {
	FindActiveDepartmentsPageInput,
} from '../../../src/features/department/use-cases/repositories/idepartment.repository';

class FakeDepartmentRepository implements IDepartmentRepository {
	readonly department: Department;
	updateCalls = 0;
	replaceCalls = 0;

	constructor(active = true) {
		this.department = new Department();
		this.department.id = '550e8400-e29b-41d4-a716-446655440000';
		this.department.name = 'Financeiro';
		this.department.type = DepartmentType.Todos;
		this.department.active = active;
		this.department.createdAt = new Date('2026-09-10T18:00:00.000Z');
		this.department.updatedAt = new Date('2026-09-10T18:10:00.000Z');
		this.department.allowedUsers = ['uid-2', 'uid-2', 'uid-1'].map((userId, position) => {
			const membership = new DepartmentAllowedUser();
			membership.departmentId = this.department.id;
			membership.position = position;
			membership.userId = userId;
			return membership;
		});
	}

	async save(department: Department): Promise<Department> {
		return department;
	}

	async update(department: Department): Promise<Department> {
		this.updateCalls += 1;
		return department;
	}

	async findById(id: string): Promise<Department | undefined> {
		return this.findByIdForUpdate(id);
	}

	async findByIdForUpdate(id: string): Promise<Department | undefined> {
		return id === this.department.id ? this.department : undefined;
	}

	async replaceAllowedUsers(): Promise<void> {
		this.replaceCalls += 1;
	}

	async findActivePage(_input: FindActiveDepartmentsPageInput) {
		return { departments: [], total: 0 };
	}
}

describe('DeleteDepartmentUseCase', () => {
	it('soft deletes an active department and renews updatedAt exactly once', async () => {
		const repository = new FakeDepartmentRepository();
		const now = new Date('2026-09-17T16:45:00.000Z');
		const membershipsBefore = repository.department.allowedUsers.map((membership) => ({
			position: membership.position,
			userId: membership.userId,
		}));

		await new DeleteDepartmentUseCase(repository, () => now).execute(repository.department.id);

		expect(repository.department.active).toBe(false);
		expect(repository.department.updatedAt).toBe(now);
		expect(repository.department.name).toBe('Financeiro');
		expect(repository.department.type).toBe(DepartmentType.Todos);
		expect(repository.department.createdAt).toEqual(new Date('2026-09-10T18:00:00.000Z'));
		expect(
			repository.department.allowedUsers.map((membership) => ({
				position: membership.position,
				userId: membership.userId,
			})),
		).toEqual(membershipsBefore);
		expect(repository.updateCalls).toBe(1);
		expect(repository.replaceCalls).toBe(0);
	});

	it('returns without writing when the department is already inactive', async () => {
		const repository = new FakeDepartmentRepository(false);
		const updatedAtBefore = repository.department.updatedAt;
		const membershipsBefore = repository.department.allowedUsers.map(
			(membership) => membership.userId,
		);

		await new DeleteDepartmentUseCase(repository, () => new Date()).execute(
			repository.department.id,
		);

		expect(repository.updateCalls).toBe(0);
		expect(repository.replaceCalls).toBe(0);
		expect(repository.department.updatedAt).toBe(updatedAtBefore);
		expect(repository.department.allowedUsers.map((membership) => membership.userId)).toEqual(
			membershipsBefore,
		);
	});

	it('returns not found when the department does not exist', async () => {
		const repository = new FakeDepartmentRepository();

		await expect(
			new DeleteDepartmentUseCase(repository).execute('550e8400-e29b-41d4-a716-446655440001'),
		).rejects.toMatchObject({ statusCode: 404, message: 'not_found' });
		expect(repository.updateCalls).toBe(0);
	});
});
