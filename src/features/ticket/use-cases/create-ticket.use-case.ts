import { randomUUID } from 'node:crypto';

import NotFoundError from '../../../shared/kernel/exceptions/not-found.error';
import UnprocessableEntityError from '../../../shared/kernel/exceptions/unprocessable-entity.error';
import IDepartmentRepository from '../../department/use-cases/repositories/idepartment.repository';
import TicketAdminStatus from '../entities/enums/ticket-admin-status.enum';
import TicketAuditAction from '../entities/enums/ticket-audit-action.enum';
import TicketOrigin from '../entities/enums/ticket-origin.enum';
import TicketPriority from '../entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../entities/enums/ticket-requester-status.enum';
import Ticket from '../entities/ticket.entity';
import TicketAuditLog from '../entities/ticket-audit-log.entity';
import TicketMessage from '../entities/ticket-message.entity';
import TicketMessageMedia from '../entities/ticket-message-media.entity';
import ITicketRepository from './repositories/iticket.repository';
import { TicketResponse, toTicketResponse } from './ticket-response';

export interface CreateTicketInput {
	subject: string;
	requesterId: string;
	departmentId: string;
	priority: TicketPriority;
	origin: TicketOrigin;
	originRefId: string;
	message: {
		message: string;
		mediaIds?: string[];
	};
}

export default class CreateTicketUseCase {
	constructor(
		private readonly departmentRepository: IDepartmentRepository,
		private readonly ticketRepository: ITicketRepository,
		private readonly now: () => Date = () => new Date(),
		private readonly uuid: () => string = randomUUID,
	) {}

	async execute(input: CreateTicketInput): Promise<TicketResponse> {
		const department = await this.departmentRepository.findByIdForUpdate(input.departmentId);
		if (!department) throw new NotFoundError('not_found');
		if (!department.active) {
			throw new UnprocessableEntityError('department_inactive', [
				{
					field: 'departmentId',
					code: 'department_inactive',
					message: 'Department is inactive.',
				},
			]);
		}

		const timestamp = this.now();
		const ticket = new Ticket();
		ticket.id = this.uuid();
		ticket.subject = input.subject;
		ticket.requesterId = input.requesterId;
		ticket.departmentId = input.departmentId;
		ticket.priority = input.priority;
		ticket.origin = input.origin;
		ticket.originRefId = input.originRefId;
		ticket.adminStatus = TicketAdminStatus.Pendente;
		ticket.requesterStatus = TicketRequesterStatus.NaoResolvido;
		ticket.createdAt = timestamp;
		ticket.updatedAt = timestamp;
		await this.ticketRepository.createTicket(ticket);

		const message = new TicketMessage();
		message.id = this.uuid();
		message.ticketId = ticket.id;
		message.message = input.message.message;
		message.type = ticket.origin;
		message.authorId = ticket.requesterId;
		message.isVisibleToRequester = true;
		message.createdAt = timestamp;
		await this.ticketRepository.createMessage(message);

		const media = (input.message.mediaIds ?? []).map((mediaId, position) => {
			const item = new TicketMessageMedia();
			item.ticketMessageId = message.id;
			item.position = position;
			item.mediaId = mediaId;
			return item;
		});
		await this.ticketRepository.createMedia(media);

		const auditLog = new TicketAuditLog();
		auditLog.id = this.uuid();
		auditLog.ticketId = ticket.id;
		auditLog.datetime = timestamp;
		auditLog.authorId = ticket.requesterId;
		auditLog.origin = ticket.origin;
		auditLog.action = TicketAuditAction.CriacaoTicket;
		auditLog.statusType = null;
		auditLog.newStatus = null;
		await this.ticketRepository.createAuditLog(auditLog);

		return toTicketResponse(ticket);
	}
}
