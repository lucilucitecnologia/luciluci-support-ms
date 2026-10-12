import Ticket from '../entities/ticket.entity';
import TicketAdminStatus from '../entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../entities/enums/ticket-origin.enum';
import TicketPriority from '../entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../entities/enums/ticket-requester-status.enum';

export interface TicketResponse {
	id: string;
	number: number;
	subject: string;
	requesterId: string;
	departmentId: string;
	priority: TicketPriority;
	origin: TicketOrigin;
	originRefId: string;
	adminStatus: TicketAdminStatus;
	requesterStatus: TicketRequesterStatus;
	createdAt: string;
	updatedAt: string;
}

export function toTicketResponse(ticket: Ticket): TicketResponse {
	return {
		id: ticket.id,
		number: ticket.number,
		subject: ticket.subject,
		requesterId: ticket.requesterId,
		departmentId: ticket.departmentId,
		priority: ticket.priority,
		origin: ticket.origin,
		originRefId: ticket.originRefId,
		adminStatus: ticket.adminStatus,
		requesterStatus: ticket.requesterStatus,
		createdAt: ticket.createdAt.toISOString(),
		updatedAt: ticket.updatedAt.toISOString(),
	};
}
