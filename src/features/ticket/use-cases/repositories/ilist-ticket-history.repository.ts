import Ticket from '../../entities/ticket.entity';

export interface ListTicketHistoryFilters {
	ticketId?: string;
	page: number;
	size: number;
}

export interface HistoryScope {
	kind: 'admin' | 'requester';
	actorId: string;
}

export interface HistoryRow {
	ticketId: string;
	number: number;
	datetime: Date;
	authorId: string;
	origin: string;
	action: string;
	newStatus: string | null;
}

export default interface IListTicketHistoryRepository {
	findById(id: string): Promise<Ticket | undefined>;
	hasDepartmentMembership(departmentId: string, userId: string): Promise<boolean>;
	findHistoryPage(
		scope: HistoryScope,
		filters: ListTicketHistoryFilters,
	): Promise<{ rows: HistoryRow[]; total: number }>;
}
