import { Router } from 'express';
import { DataSource } from 'typeorm';

import buildTicketController from '../controllers/ticket.controller';

export default function buildTicketRouter(dataSource: DataSource): Router {
	const router = Router();
	const controller = buildTicketController(dataSource);

	router.post('/', controller.create);
	router.get('/requester/:requesterId', controller.listByRequester);
	router.get('/admin/:adminId', controller.listByAdmin);
	router.get('/history', controller.listHistory);
	router.get('/:ticketId', controller.getById);
	router.patch('/:ticketId', controller.update);
	router.post('/:ticketId/approve', controller.approve);
	router.post('/:ticketId/reject', controller.reject);
	router.post('/:ticketId/cancel', controller.cancel);
	router.post('/:ticketId/messages', controller.createMessage);
	router.get('/:ticketId/messages', controller.listMessages);
	router.patch('/:ticketId/messages/:messageId/visibility', controller.updateMessageVisibility);
	return router;
}
