import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import UpdateDepartmentUseCase from '../../../src/features/department/use-cases/update-department.use-case';
import IDepartmentRepository from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import { FindActiveDepartmentsPageInput } from '../../../src/features/department/use-cases/repositories/idepartment.repository';

class FakeDepartmentRepository implements IDepartmentRepository {
	readonly department: Department;
	updateCalls = 0;
	replaceCalls: Array<{ departmentId: string; userIds: string[] }> = [];

	constructor(allowedUserIds = ['uid-1', 'uid-2'], active = true) {
		this.department = new Department();
		this.department.id = '550e8400-e29b-41d4-a716-446655440000';
		this.department.name = 'Financeiro';
		this.department.type = DepartmentType.Todos;
		this.department.active = active;
		this.department.createdAt = new Date('2026-09-10T18:00:00.000Z');
		this.department.updatedAt = new Date('2026-09-10T18:10:00.000Z');
		this.department.allowedUsers = allowedUserIds.map((userId, position) => {
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

	async replaceAllowedUsers(departmentId: string, userIds: string[]): Promise<void> {
		this.replaceCalls.push({ departmentId, userIds: [...userIds] });
		this.department.allowedUsers = userIds.map((userId, position) => {
			const membership = new DepartmentAllowedUser();
			membership.departmentId = departmentId;
			membership.position = position;
			membership.userId = userId;
			return membership;
		});
	}

	async findActivePage(_input: FindActiveDepartmentsPageInput) {
		return { departments: [], total: 0 };
	}
}

describe('UpdateDepartmentUseCase', () => {
	it('updates only name and preserves type, active state, and memberships', async () => {
		const repository = new FakeDepartmentRepository();
		const before = repository.department.updatedAt;
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				name: 'Financeiro Corporativo',
			},
		);

		expect(response).toMatchObject({
			name: 'Financeiro Corporativo',
			type: DepartmentType.Todos,
			active: true,
			allowedUserIds: ['uid-1', 'uid-2'],
		});
		expect(response.updatedAt).not.toBe(before.toISOString());
		expect(repository.replaceCalls).toHaveLength(0);
	});

	it('updates only type', async () => {
		const repository = new FakeDepartmentRepository();
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				type: DepartmentType.Backoffice,
			},
		);

		expect(response.type).toBe(DepartmentType.Backoffice);
		expect(response.name).toBe('Financeiro');
	});

	it('replaces memberships preserving order, duplicates, and positions', async () => {
		const repository = new FakeDepartmentRepository();
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				allowedUserIds: ['uid-2', 'uid-2', 'uid-3'],
			},
		);

		expect(response.allowedUserIds).toEqual(['uid-2', 'uid-2', 'uid-3']);
		expect(repository.replaceCalls).toEqual([
			{
				departmentId: repository.department.id,
				userIds: ['uid-2', 'uid-2', 'uid-3'],
			},
		]);
	});

	it('combines fields and clears memberships with an empty list', async () => {
		const repository = new FakeDepartmentRepository();
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				name: 'Atendimento',
				type: DepartmentType.Cd,
				allowedUserIds: [],
			},
		);

		expect(response).toMatchObject({
			name: 'Atendimento',
			type: DepartmentType.Cd,
			allowedUserIds: [],
		});
	});

	it('returns without saving for a semantic no-op', async () => {
		const repository = new FakeDepartmentRepository();
		const before = repository.department.updatedAt.toISOString();
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				name: 'Financeiro',
				type: DepartmentType.Todos,
				allowedUserIds: ['uid-1', 'uid-2'],
			},
		);

		expect(repository.updateCalls).toBe(0);
		expect(response.updatedAt).toBe(before);
		expect(repository.replaceCalls).toHaveLength(0);
	});

	it('edits an inactive department without restoring it', async () => {
		const repository = new FakeDepartmentRepository(['uid-1'], false);
		const response = await new UpdateDepartmentUseCase(repository).execute(
			repository.department.id,
			{
				name: 'Financeiro Inativo',
			},
		);

		expect(response.active).toBe(false);
		expect(response.name).toBe('Financeiro Inativo');
	});

	it('returns not found when the department does not exist', async () => {
		const repository = new FakeDepartmentRepository();
		await expect(
			new UpdateDepartmentUseCase(repository).execute(
				'550e8400-e29b-41d4-a716-446655440001',
				{
					name: 'Missing',
				},
			),
		).rejects.toMatchObject({ statusCode: 404, message: 'not_found' });
	});
});
