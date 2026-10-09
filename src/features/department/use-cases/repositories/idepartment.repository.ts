import Department from '../../entities/department.entity';
import DepartmentType from '../../entities/enums/department-type.enum';

export interface FindActiveDepartmentsPageInput {
	type?: DepartmentType;
	page: number;
	size: number;
}

export interface DepartmentPage {
	departments: Department[];
	total: number;
}

export default interface IDepartmentRepository {
	save(department: Department): Promise<Department>;
	update(department: Department): Promise<Department>;
	findById(id: string): Promise<Department | undefined>;
	findByIdForUpdate(id: string): Promise<Department | undefined>;
	replaceAllowedUsers(departmentId: string, userIds: string[]): Promise<void>;
	findActivePage(input: FindActiveDepartmentsPageInput): Promise<DepartmentPage>;
}
