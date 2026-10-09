import { Request, Response } from 'express';
import { DataSource } from 'typeorm';

import { validateDto } from '../../../../shared/kernel/validation/validate-dto';
import UnprocessableEntityError from '../../../../shared/kernel/exceptions/unprocessable-entity.error';
import DepartmentTypeormRepository from '../repositories/department-typeorm.repository';
import CreateDepartmentRequestDTO from './dtos/create-department-request.dto';
import DeleteDepartmentPathDTO from './dtos/delete-department-path.dto';
import GetDepartmentPathDTO from './dtos/get-department-path.dto';
import ListDepartmentsQueryDTO from './dtos/list-departments-query.dto';
import UpdateDepartmentPathDTO from './dtos/update-department-path.dto';
import UpdateDepartmentRequestDTO from './dtos/update-department-request.dto';
import CreateDepartmentUseCase from '../../use-cases/create-department.use-case';
import DeleteDepartmentUseCase from '../../use-cases/delete-department.use-case';
import GetDepartmentUseCase from '../../use-cases/get-department.use-case';
import ListDepartmentsUseCase from '../../use-cases/list-departments.use-case';
import UpdateDepartmentUseCase from '../../use-cases/update-department.use-case';

export default function buildDepartmentController(dataSource: DataSource) {
	return {
		list: async (req: Request, res: Response): Promise<void> => {
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'forbidden',
						message: 'Request body is not allowed.',
					},
				]);
			}
			const query = await validateDto(ListDepartmentsQueryDTO, req.query);
			const response = await new ListDepartmentsUseCase(
				new DepartmentTypeormRepository(dataSource.manager),
			).execute(query);

			res.status(200).json(response);
		},
		get: async (req: Request, res: Response): Promise<void> => {
			const { departmentId } = await validateDto(GetDepartmentPathDTO, req.params);
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'forbidden',
						message: 'Request body is not allowed.',
					},
				]);
			}
			const response = await new GetDepartmentUseCase(
				new DepartmentTypeormRepository(dataSource.manager),
			).execute(departmentId);

			res.status(200).json(response);
		},
		create: async (req: Request, res: Response): Promise<void> => {
			const payload = await validateDto(CreateDepartmentRequestDTO, req.body);
			const response = await dataSource.transaction((manager) =>
				new CreateDepartmentUseCase(new DepartmentTypeormRepository(manager)).execute(
					payload,
				),
			);

			res.status(201).json(response);
		},
		update: async (req: Request, res: Response): Promise<void> => {
			const { departmentId } = await validateDto(UpdateDepartmentPathDTO, req.params);
			if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'object',
						message: 'Request body must be a JSON object.',
					},
				]);
			}
			const payload = await validateDto(UpdateDepartmentRequestDTO, req.body);
			if (!Object.values(payload).some((value) => value !== undefined)) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'minProperties',
						message: 'Request body must contain at least one editable field.',
					},
				]);
			}

			const response = await dataSource.transaction((manager) =>
				new UpdateDepartmentUseCase(new DepartmentTypeormRepository(manager)).execute(
					departmentId,
					payload,
				),
			);

			res.status(200).json(response);
		},
		delete: async (req: Request, res: Response): Promise<void> => {
			const { departmentId } = await validateDto(DeleteDepartmentPathDTO, req.params);
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'forbidden',
						message: 'Request body is not allowed.',
					},
				]);
			}

			await dataSource.transaction((manager) =>
				new DeleteDepartmentUseCase(new DepartmentTypeormRepository(manager)).execute(
					departmentId,
				),
			);

			res.status(204).send();
		},
	};
}
