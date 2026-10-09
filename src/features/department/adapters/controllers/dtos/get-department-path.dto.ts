import { IsUUID } from 'class-validator';

export default class GetDepartmentPathDTO {
	@IsUUID('4')
	departmentId!: string;
}
