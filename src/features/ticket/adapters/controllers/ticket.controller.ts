import { Request, Response } from 'express';
import { DataSource } from 'typeorm';

import DepartmentTypeormRepository from '../../../department/adapters/repositories/department-typeorm.repository';
import CreateTicketUseCase from '../../use-cases/create-ticket.use-case';
import UpdateTicketUseCase, { TicketActorRole } from '../../use-cases/update-ticket.use-case';
import ListTicketsUseCase from '../../use-cases/list-tickets.use-case';
import RequesterTicketStatusUseCase from '../../use-cases/requester-ticket-status.use-case';
import { RequesterStatusAction } from '../../use-cases/ticket-status-policy';
import GetTicketUseCase from '../../use-cases/get-ticket.use-case';
import CreateTicketMessageUseCase from '../../use-cases/create-ticket-message.use-case';
import UpdateMessageVisibilityUseCase from '../../use-cases/update-message-visibility.use-case';
import ListTicketMessagesUseCase from '../../use-cases/list-ticket-messages.use-case';
import ListTicketHistoryUseCase from '../../use-cases/list-ticket-history.use-case';
import BadRequestError from '../../../../shared/kernel/exceptions/bad-request.error';
import ForbiddenError from '../../../../shared/kernel/exceptions/forbidden.error';
import UnprocessableEntityError from '../../../../shared/kernel/exceptions/unprocessable-entity.error';
import { validateDto } from '../../../../shared/kernel/validation/validate-dto';
import TicketTypeormRepository from '../repositories/ticket-typeorm.repository';
import CreateTicketRequestDTO from './dtos/create-ticket-request.dto';
import RequesterTicketStatusRequestDTO from './dtos/requester-ticket-status-request.dto';
import { parseListTicketsQuery } from './dtos/list-tickets-query.dto';
import UpdateTicketPathDTO from './dtos/update-ticket-path.dto';
import UpdateTicketRequestDTO from './dtos/update-ticket-request.dto';
import CreateTicketMessageRequestDTO from './dtos/create-ticket-message-request.dto';
import UpdateMessageVisibilityPathDTO from './dtos/update-message-visibility-path.dto';
import UpdateMessageVisibilityRequestDTO from './dtos/update-message-visibility-request.dto';
import { parseListTicketMessagesQuery } from './dtos/list-ticket-messages-query.dto';
import { parseListTicketHistoryQuery } from './dtos/list-ticket-history-query.dto';

export default function buildTicketController(dataSource: DataSource) {
	async function list(req: Request, res: Response, kind: 'requester' | 'admin'): Promise<void> {
		const actorId = req.performedBy;
		const role = req.performedByType;
		if (!actorId?.trim() || !['admin', 'backoffice', 'cd'].includes(role ?? '')) {
			throw new BadRequestError('bad_request');
		}
		if (kind === 'admin' ? role !== 'admin' : role === 'admin') {
			throw new ForbiddenError('forbidden');
		}
		const pathId = kind === 'admin' ? req.params.adminId : req.params.requesterId;
		if (typeof pathId !== 'string' || !pathId.trim()) {
			throw new UnprocessableEntityError('validation_error');
		}
		if (actorId !== pathId) {
			throw new ForbiddenError('forbidden');
		}
		if (req.body !== undefined) {
			throw new UnprocessableEntityError('validation_error', [
				{ field: 'body', code: 'forbidden', message: 'Request body is not allowed.' },
			]);
		}
		const filters = parseListTicketsQuery(req.originalUrl, kind === 'admin');
		const response = await new ListTicketsUseCase(
			new TicketTypeormRepository(dataSource.manager),
		).execute({ kind, actorId }, filters);
		res.status(200).json(response);
	}

	function requesterStatusHandler(action: RequesterStatusAction, bodyAllowed: boolean) {
		return async (req: Request, res: Response): Promise<void> => {
			const callerId = req.performedBy;
			const callerRole = req.performedByType;
			if (!callerId?.trim() || !['admin', 'backoffice', 'cd'].includes(callerRole ?? '')) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId } = await validateDto(UpdateTicketPathDTO, req.params);
			let input: RequesterTicketStatusRequestDTO = {};
			if (!bodyAllowed) {
				if (req.body !== undefined) {
					throw new UnprocessableEntityError('validation_error', [
						{
							field: 'body',
							code: 'forbidden',
							message: 'Request body is not allowed.',
						},
					]);
				}
			} else if (req.body !== undefined) {
				if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
					throw new UnprocessableEntityError('validation_error', [
						{
							field: 'body',
							code: 'object',
							message: 'Request body must be a JSON object.',
						},
					]);
				}
				input = await validateDto(RequesterTicketStatusRequestDTO, req.body);
				if (input.message === undefined && input.mediaIds !== undefined) {
					throw new UnprocessableEntityError('validation_error', [
						{
							field: 'mediaIds',
							code: 'requires_message',
							message: 'mediaIds require a message.',
						},
					]);
				}
			}
			const response = await dataSource.transaction((manager) =>
				new RequesterTicketStatusUseCase(new TicketTypeormRepository(manager)).execute(
					ticketId,
					action,
					input,
					{ id: callerId, role: callerRole as TicketActorRole },
				),
			);
			res.status(200).json(response);
		};
	}

	return {
		listHistory: async (req: Request, res: Response): Promise<void> => {
			const actorId = req.performedBy;
			const role = req.performedByType;
			if (!actorId?.trim() || !['admin', 'backoffice', 'cd'].includes(role ?? '')) {
				throw new BadRequestError('bad_request');
			}
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{ field: 'body', code: 'forbidden', message: 'Request body is not allowed.' },
				]);
			}
			const filters = parseListTicketHistoryQuery(req.originalUrl);
			const read = (manager: typeof dataSource.manager) =>
				new ListTicketHistoryUseCase(new TicketTypeormRepository(manager)).execute(
					{ id: actorId, role: role as TicketActorRole },
					filters,
				);
			const response =
				dataSource.options.type === 'postgres'
					? await dataSource.transaction('REPEATABLE READ', read)
					: await dataSource.transaction(read);
			res.status(200).json(response);
		},
		listMessages: async (req: Request, res: Response): Promise<void> => {
			const actorId = req.performedBy;
			const role = req.performedByType;
			if (!actorId?.trim() || !['admin', 'backoffice', 'cd'].includes(role ?? '')) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId } = await validateDto(UpdateTicketPathDTO, req.params);
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{ field: 'body', code: 'forbidden', message: 'Request body is not allowed.' },
				]);
			}
			const filters = parseListTicketMessagesQuery(req.originalUrl);
			const read = (manager: typeof dataSource.manager) =>
				new ListTicketMessagesUseCase(new TicketTypeormRepository(manager)).execute(
					ticketId,
					{ id: actorId, role: role as TicketActorRole },
					filters,
				);
			// SQLite test driver has no explicit REPEATABLE READ level; PostgreSQL does.
			const response =
				dataSource.options.type === 'postgres'
					? await dataSource.transaction('REPEATABLE READ', read)
					: await dataSource.transaction(read);
			res.status(200).json(response);
		},
		getById: async (req: Request, res: Response): Promise<void> => {
			const callerId = req.performedBy;
			const callerRole = req.performedByType;
			if (!callerId?.trim() || !['admin', 'backoffice', 'cd'].includes(callerRole ?? '')) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId } = await validateDto(UpdateTicketPathDTO, req.params);
			if (req.originalUrl.includes('?')) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'query',
						code: 'forbidden',
						message: 'Query parameters are not allowed.',
					},
				]);
			}
			if (req.body !== undefined) {
				throw new UnprocessableEntityError('validation_error', [
					{ field: 'body', code: 'forbidden', message: 'Request body is not allowed.' },
				]);
			}
			const response = await new GetTicketUseCase(
				new TicketTypeormRepository(dataSource.manager),
			).execute(ticketId, { id: callerId, role: callerRole as TicketActorRole });
			res.status(200).json(response);
		},
		listByRequester: (req: Request, res: Response): Promise<void> =>
			list(req, res, 'requester'),
		listByAdmin: (req: Request, res: Response): Promise<void> => list(req, res, 'admin'),
		create: async (req: Request, res: Response): Promise<void> => {
			const payload = await validateDto(CreateTicketRequestDTO, req.body ?? {});
			const response = await dataSource.transaction((manager) =>
				new CreateTicketUseCase(
					new DepartmentTypeormRepository(manager),
					new TicketTypeormRepository(manager),
				).execute(payload),
			);

			res.status(201).json(response);
		},
		update: async (req: Request, res: Response): Promise<void> => {
			const callerId = req.performedBy;
			const callerRole = req.performedByType;
			if (
				!callerId ||
				!callerId.trim() ||
				!['admin', 'backoffice', 'cd'].includes(callerRole ?? '')
			) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId } = await validateDto(UpdateTicketPathDTO, req.params);
			if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'object',
						message: 'Request body must be a JSON object.',
					},
				]);
			}
			const payload = await validateDto(UpdateTicketRequestDTO, req.body);
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
				new UpdateTicketUseCase(
					new DepartmentTypeormRepository(manager),
					new TicketTypeormRepository(manager),
				).execute(ticketId, payload, { id: callerId, role: callerRole as TicketActorRole }),
			);
			res.status(200).json(response);
		},
		approve: requesterStatusHandler('approve', false),
		reject: requesterStatusHandler('reject', true),
		cancel: requesterStatusHandler('cancel', true),
		createMessage: async (req: Request, res: Response): Promise<void> => {
			const callerId = req.performedBy;
			const callerRole = req.performedByType;
			if (!callerId?.trim() || !['admin', 'backoffice', 'cd'].includes(callerRole ?? '')) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId } = await validateDto(UpdateTicketPathDTO, req.params);
			if (req.originalUrl.includes('?')) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'query',
						code: 'forbidden',
						message: 'Query parameters are not allowed.',
					},
				]);
			}
			if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'object',
						message: 'Request body must be a JSON object.',
					},
				]);
			}
			const payload = await validateDto(CreateTicketMessageRequestDTO, req.body);
			if (payload.authorId !== callerId || payload.type !== callerRole) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'authorId/type',
						code: 'actor_mismatch',
						message: 'Body actor must match headers.',
					},
				]);
			}
			const response = await dataSource.transaction((manager) =>
				new CreateTicketMessageUseCase(
					new DepartmentTypeormRepository(manager),
					new TicketTypeormRepository(manager),
				).execute(ticketId, payload, { id: callerId, role: callerRole as TicketActorRole }),
			);
			res.status(201).json(response);
		},
		updateMessageVisibility: async (req: Request, res: Response): Promise<void> => {
			const callerId = req.performedBy;
			const callerRole = req.performedByType;
			if (!callerId?.trim() || !['admin', 'backoffice', 'cd'].includes(callerRole ?? '')) {
				throw new BadRequestError('bad_request');
			}
			const { ticketId, messageId } = await validateDto(
				UpdateMessageVisibilityPathDTO,
				req.params,
			);
			if (req.originalUrl.includes('?')) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'query',
						code: 'forbidden',
						message: 'Query parameters are not allowed.',
					},
				]);
			}
			if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'body',
						code: 'object',
						message: 'Request body must be a JSON object.',
					},
				]);
			}
			const { isVisibleToRequester } = await validateDto(
				UpdateMessageVisibilityRequestDTO,
				req.body,
			);
			const response = await dataSource.transaction((manager) =>
				new UpdateMessageVisibilityUseCase(
					new DepartmentTypeormRepository(manager),
					new TicketTypeormRepository(manager),
				).execute(ticketId, messageId, isVisibleToRequester, {
					id: callerId,
					role: callerRole as TicketActorRole,
				}),
			);
			res.status(200).json(response);
		},
	};
}
