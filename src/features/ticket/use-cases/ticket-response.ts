import Ticket from '../entities/ticket.entity';
import TicketOrigin from '../entities/enums/ticket-origin.enum';
import TicketPriority from '../entities/enums/ticket-priority.enum';
import TicketStatus from '../entities/enums/ticket-status.enum';

export interface TicketResponse {
	id: string;
	number: number;
	subject: string;
	requesterId: string;
	departmentId: string;
	priority: TicketPriority;
	origin: TicketOrigin;
	originRefId: string;
	status: TicketStatus;
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
		status: ticket.status,
		createdAt: ticket.createdAt.toISOString(),
		updatedAt: ticket.updatedAt.toISOString(),
	};
}
