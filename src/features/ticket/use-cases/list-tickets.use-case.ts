import Ticket from '../entities/ticket.entity';
import IListTicketsRepository, {
	ListTicketsFilters,
	TicketListScope,
} from './repositories/ilist-tickets.repository';

export interface ListedTicket {
	id: string;
	number: number;
	subject: string;
	createdAt: string;
	departmentId: string;
	requesterId: string;
	origin: string;
	priority: string;
	status: string;
}

export interface ListTicketsResponse {
	data: ListedTicket[];
	pagination: { page: number; size: number; total: number; totalPages: number };
}

function toListedTicket(ticket: Ticket): ListedTicket {
	return {
		id: ticket.id,
		number: ticket.number,
		subject: ticket.subject,
		createdAt: ticket.createdAt.toISOString(),
		departmentId: ticket.departmentId,
		requesterId: ticket.requesterId,
		origin: ticket.origin,
		priority: ticket.priority,
		status: ticket.adminStatus,
	};
}

export default class ListTicketsUseCase {
	constructor(private readonly repository: IListTicketsRepository) {}

	async execute(
		scope: TicketListScope,
		filters: ListTicketsFilters,
	): Promise<ListTicketsResponse> {
		const { tickets, total } = await this.repository.findPage(scope, filters);
		return {
			data: tickets.map(toListedTicket),
			pagination: {
				page: filters.page,
				size: filters.size,
				total,
				totalPages: total === 0 ? 0 : Math.ceil(total / filters.size),
			},
		};
	}
}
