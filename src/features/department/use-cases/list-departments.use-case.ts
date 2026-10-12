import DepartmentType from '../entities/enums/department-type.enum';
import { DepartmentResponse, toDepartmentResponse } from './department-response';
import IDepartmentRepository from './repositories/idepartment.repository';

export interface ListDepartmentsInput {
	type?: DepartmentType[];
	page: number;
	size: number;
}

export interface ListDepartmentsResponse {
	data: DepartmentResponse[];
	pagination: {
		page: number;
		size: number;
		total: number;
		totalPages: number;
	};
}

export default class ListDepartmentsUseCase {
	constructor(private readonly departmentRepository: IDepartmentRepository) {}

	async execute(input: ListDepartmentsInput): Promise<ListDepartmentsResponse> {
		const { departments, total } = await this.departmentRepository.findActivePage(input);

		return {
			data: departments.map(toDepartmentResponse),
			pagination: {
				page: input.page,
				size: input.size,
				total,
				totalPages: total === 0 ? 0 : Math.ceil(total / input.size),
			},
		};
	}
}
