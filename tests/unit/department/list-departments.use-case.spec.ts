import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import DepartmentType from '../../../src/features/department/entities/enums/department-type.enum';
import ListDepartmentsQueryDTO from '../../../src/features/department/adapters/controllers/dtos/list-departments-query.dto';
import ListDepartmentsUseCase from '../../../src/features/department/use-cases/list-departments.use-case';
import IDepartmentRepository, {
	DepartmentPage,
	FindActiveDepartmentsPageInput,
} from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import { validateDto } from '../../../src/shared/kernel/validation/validate-dto';

function department(id: string, allowedUserIds: string[]): Department {
	const value = new Department();
	value.id = id;
	value.name = 'Financeiro';
	value.type = DepartmentType.Todos;
	value.active = true;
	value.createdAt = new Date('2026-09-10T18:00:00.000Z');
	value.updatedAt = new Date('2026-09-10T18:05:00.000Z');
	value.allowedUsers = allowedUserIds.map((userId, position) => {
		const membership = new DepartmentAllowedUser();
		membership.departmentId = id;
		membership.position = position;
		membership.userId = userId;
		return membership;
	});
	return value;
}

class FakeDepartmentRepository implements IDepartmentRepository {
	findInput?: FindActiveDepartmentsPageInput;
	writes = 0;

	constructor(private readonly page: DepartmentPage) {}

	async findActivePage(input: FindActiveDepartmentsPageInput): Promise<DepartmentPage> {
		this.findInput = input;
		return this.page;
	}

	async save(value: Department): Promise<Department> {
		this.writes += 1;
		return value;
	}

	async update(value: Department): Promise<Department> {
		this.writes += 1;
		return value;
	}

	async findById(_id: string): Promise<Department | undefined> {
		return undefined;
	}

	async findByIdForUpdate(_id: string): Promise<Department | undefined> {
		return undefined;
	}

	async replaceAllowedUsers(_departmentId: string, _userIds: string[]): Promise<void> {
		this.writes += 1;
	}
}

describe('ListDepartmentsUseCase', () => {
	it('normalizes the public query defaults before use-case execution', async () => {
		await expect(validateDto(ListDepartmentsQueryDTO, {})).resolves.toEqual({
			page: 1,
			size: 20,
		});
		await expect(
			validateDto(ListDepartmentsQueryDTO, { type: 'cd', page: '2', size: '10' }),
		).resolves.toEqual({ type: 'cd', page: 2, size: 10 });
	});

	it('maps complete departments, preserves memberships, and calculates total pages', async () => {
		const repository = new FakeDepartmentRepository({
			departments: [
				department('550e8400-e29b-41d4-a716-446655440000', [
					'uid-user-2',
					'uid-user-2',
					'uid-user-1',
				]),
			],
			total: 21,
		});
		const response = await new ListDepartmentsUseCase(repository).execute({
			type: DepartmentType.Todos,
			page: 2,
			size: 20,
		});

		expect(repository.findInput).toEqual({
			type: DepartmentType.Todos,
			page: 2,
			size: 20,
		});
		expect(response).toEqual({
			data: [
				{
					id: '550e8400-e29b-41d4-a716-446655440000',
					name: 'Financeiro',
					allowedUserIds: ['uid-user-2', 'uid-user-2', 'uid-user-1'],
					type: 'todos',
					active: true,
					createdAt: '2026-09-10T18:00:00.000Z',
					updatedAt: '2026-09-10T18:05:00.000Z',
				},
			],
			pagination: { page: 2, size: 20, total: 21, totalPages: 2 },
		});
		expect(repository.writes).toBe(0);
	});

	it('returns totalPages zero for an empty or beyond-range page without writes', async () => {
		const repository = new FakeDepartmentRepository({ departments: [], total: 0 });
		const response = await new ListDepartmentsUseCase(repository).execute({
			page: 7,
			size: 20,
		});

		expect(response).toEqual({
			data: [],
			pagination: { page: 7, size: 20, total: 0, totalPages: 0 },
		});
		expect(repository.writes).toBe(0);
	});

	it('preserves totals when a requested page is beyond the last page', async () => {
		const repository = new FakeDepartmentRepository({ departments: [], total: 3 });
		const response = await new ListDepartmentsUseCase(repository).execute({ page: 9, size: 2 });

		expect(response).toEqual({
			data: [],
			pagination: { page: 9, size: 2, total: 3, totalPages: 2 },
		});
	});
});
