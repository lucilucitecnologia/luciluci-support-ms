import { Router } from 'express';
import { DataSource } from 'typeorm';

import buildDepartmentController from '../controllers/department.controller';

export default function buildDepartmentRouter(dataSource: DataSource): Router {
	const router = Router();
	const controller = buildDepartmentController(dataSource);

	router.get('/', controller.list);
	router.get('/:departmentId', controller.get);
	router.post('/', controller.create);
	router.patch('/:departmentId', controller.update);
	router.delete('/:departmentId', controller.delete);
	return router;
}
