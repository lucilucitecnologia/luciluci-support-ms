import { randomUUID } from 'node:crypto';

import ForbiddenError from '../../../shared/kernel/exceptions/forbidden.error';
import NotFoundError from '../../../shared/kernel/exceptions/not-found.error';
import UnprocessableEntityError from '../../../shared/kernel/exceptions/unprocessable-entity.error';
import TicketAuditAction from '../entities/enums/ticket-audit-action.enum';
import TicketAuditLog from '../entities/ticket-audit-log.entity';
import TicketMessage from '../entities/ticket-message.entity';
import TicketMessageMedia from '../entities/ticket-message-media.entity';
import IRequesterTicketStatusRepository from './repositories/irequester-ticket-status.repository';
import { REQUESTER_TRANSITIONS, RequesterStatusAction } from './ticket-status-policy';
import { TicketResponse, toTicketResponse } from './ticket-response';
import { TicketActor } from './update-ticket.use-case';

export interface RequesterTicketStatusInput {
	message?: string;
	mediaIds?: string[];
}

export default class RequesterTicketStatusUseCase {
	constructor(
		private readonly ticketRepository: IRequesterTicketStatusRepository,
		private readonly now: () => Date = () => new Date(),
		private readonly uuid: () => string = randomUUID,
	) {}

	async execute(
		ticketId: string,
		action: RequesterStatusAction,
		input: RequesterTicketStatusInput,
		actor: TicketActor,
	): Promise<TicketResponse> {
		const ticket = await this.ticketRepository.findByIdForUpdate(ticketId);
		if (!ticket) throw new NotFoundError('not_found');
		if (actor.role === 'admin' || ticket.requesterId !== actor.id) {
			throw new ForbiddenError('forbidden');
		}

		const transition = REQUESTER_TRANSITIONS[action];
		if (!transition.from.includes(ticket.status)) {
			throw new UnprocessableEntityError('invalid_status_transition', [
				{
					field: 'status',
					code: 'invalid_status_transition',
					message: `Cannot ${action} a ticket with status ${ticket.status}.`,
				},
			]);
		}

		const now = this.now();
		const timestamp =
			now.getTime() > ticket.updatedAt.getTime()
				? now
				: new Date(ticket.updatedAt.getTime() + 1);
		ticket.status = transition.to;
		ticket.updatedAt = timestamp;
		await this.ticketRepository.updateStatus(ticket);

		const audit = (auditAction: TicketAuditAction, newStatus: string | null) => {
			const entry = new TicketAuditLog();
			entry.id = this.uuid();
			entry.ticketId = ticket.id;
			entry.datetime = timestamp;
			entry.authorId = actor.id;
			entry.origin = actor.role;
			entry.action = auditAction;
			entry.newStatus = newStatus;
			return entry;
		};

		if (input.message !== undefined) {
			const message = new TicketMessage();
			message.id = this.uuid();
			message.ticketId = ticket.id;
			message.message = input.message;
			message.type = actor.role;
			message.authorId = actor.id;
			message.isVisibleToRequester = true;
			message.createdAt = timestamp;
			await this.ticketRepository.createMessage(message);
			await this.ticketRepository.createMedia(
				(input.mediaIds ?? []).map((mediaId, position) => {
					const media = new TicketMessageMedia();
					media.ticketMessageId = message.id;
					media.position = position;
					media.mediaId = mediaId;
					return media;
				}),
			);
			await this.ticketRepository.createAuditLog(audit(TicketAuditAction.NovaMensagem, null));
		}
		await this.ticketRepository.createAuditLog(
			audit(TicketAuditAction.AlteracaoStatus, transition.to),
		);

		return toTicketResponse(ticket);
	}
}
