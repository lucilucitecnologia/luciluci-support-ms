import NotFoundError from '../../../shared/kernel/exceptions/not-found.error';
import { DepartmentResponse, toDepartmentResponse } from './department-response';
import IDepartmentRepository from './repositories/idepartment.repository';

export default class GetDepartmentUseCase {
	constructor(private readonly departmentRepository: IDepartmentRepository) {}

	async execute(id: string): Promise<DepartmentResponse> {
		const department = await this.departmentRepository.findById(id);
		if (!department) throw new NotFoundError('not_found');

		return toDepartmentResponse(department);
	}
}
