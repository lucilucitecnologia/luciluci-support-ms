import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import DepartmentType from '../../../entities/enums/department-type.enum';

function toNumber(value: unknown): unknown {
	return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

function toTypeList(value: unknown): unknown {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return [...new Set(value)];
	return value;
}

export default class ListDepartmentsQueryDTO {
	@IsOptional()
	@Transform(({ value }) => toTypeList(value))
	@IsArray()
	@ArrayNotEmpty()
	@IsEnum(DepartmentType, { each: true })
	type?: DepartmentType[];

	@Transform(({ value }) => toNumber(value))
	@IsInt()
	@Min(1)
	page: number = 1;

	@Transform(({ value }) => toNumber(value))
	@IsInt()
	@Min(1)
	@Max(100)
	size: number = 20;
}
