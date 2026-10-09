import { randomUUID } from 'node:crypto';

import ForbiddenError from '../../../shared/kernel/exceptions/forbidden.error';
import NotFoundError from '../../../shared/kernel/exceptions/not-found.error';
import UnprocessableEntityError from '../../../shared/kernel/exceptions/unprocessable-entity.error';
import IDepartmentRepository from '../../department/use-cases/repositories/idepartment.repository';
import TicketAdminStatus from '../entities/enums/ticket-admin-status.enum';
import TicketAuditAction from '../entities/enums/ticket-audit-action.enum';
import TicketAuditLog from '../entities/ticket-audit-log.entity';
import TicketMessage from '../entities/ticket-message.entity';
import TicketMessageMedia from '../entities/ticket-message-media.entity';
import ICreateTicketMessageRepository from './repositories/icreate-ticket-message.repository';
import { TicketMessageResponse, toTicketMessageResponse } from './ticket-message-response';
import { TicketActor } from './update-ticket.use-case';

export interface CreateTicketMessageInput {
	message: string;
	type: 'admin' | 'backoffice' | 'cd';
	authorId: string;
	mediaIds?: string[];
	isVisibleToRequester: boolean;
}

export default class CreateTicketMessageUseCase {
	constructor(
		private readonly departmentRepository: Pick<IDepartmentRepository, 'findByIdForUpdate'>,
		private readonly ticketRepository: ICreateTicketMessageRepository,
		private readonly now: () => Date = () => new Date(),
		private readonly uuid: () => string = randomUUID,
	) {}

	async execute(
		ticketId: string,
		input: CreateTicketMessageInput,
		actor: TicketActor,
	): Promise<TicketMessageResponse> {
		const ticket = await this.ticketRepository.findByIdForUpdate(ticketId);
		if (!ticket) throw new NotFoundError('not_found');

		if (actor.role === 'admin') {
			const department = await this.departmentRepository.findByIdForUpdate(
				ticket.departmentId,
			);
			if (!department) throw new NotFoundError('not_found');
			if (!department.allowedUsers.some((membership) => membership.userId === actor.id)) {
				throw new ForbiddenError('forbidden');
			}
		} else {
			if (ticket.requesterId !== actor.id) throw new ForbiddenError('forbidden');
			if (!input.isVisibleToRequester) {
				throw new UnprocessableEntityError('validation_error', [
					{
						field: 'isVisibleToRequester',
						code: 'requester_visibility',
						message: 'Requester messages must be visible to the requester.',
					},
				]);
			}
		}

		// Use one logical instant for every write, moving forward if the stored timestamp is newer.
		const now = this.now();
		const timestamp =
			now.getTime() > ticket.updatedAt.getTime()
				? now
				: new Date(ticket.updatedAt.getTime() + 1);
		const message = new TicketMessage();
		message.id = this.uuid();
		message.ticketId = ticket.id;
		message.message = input.message;
		message.type = input.type;
		message.authorId = input.authorId;
		message.isVisibleToRequester = input.isVisibleToRequester;
		message.createdAt = timestamp;
		await this.ticketRepository.createMessage(message);

		const mediaIds = input.mediaIds ?? [];
		await this.ticketRepository.createMedia(
			mediaIds.map((mediaId, position) => {
				const media = new TicketMessageMedia();
				media.ticketMessageId = message.id;
				media.position = position;
				media.mediaId = mediaId;
				return media;
			}),
		);

		if (actor.role === 'admin') {
			await this.ticketRepository.touchAfterAdminMessage(ticket.id, timestamp);
		} else {
			await this.ticketRepository.updateAfterRequesterMessage(ticket.id, timestamp);
		}

		const audit = (
			action: TicketAuditAction,
			statusType: string | null,
			newStatus: string | null,
		) => {
			const entry = new TicketAuditLog();
			entry.id = this.uuid();
			entry.ticketId = ticket.id;
			entry.datetime = timestamp;
			entry.authorId = actor.id;
			entry.origin = actor.role;
			entry.action = action;
			entry.statusType = statusType;
			entry.newStatus = newStatus;
			return entry;
		};
		await this.ticketRepository.createAuditLog(
			audit(TicketAuditAction.NovaMensagem, null, null),
		);
		if (actor.role !== 'admin') {
			await this.ticketRepository.createAuditLog(
				audit(TicketAuditAction.AlteracaoStatus, 'admin', TicketAdminStatus.Pendente),
			);
		}

		return toTicketMessageResponse(message, mediaIds);
	}
}
