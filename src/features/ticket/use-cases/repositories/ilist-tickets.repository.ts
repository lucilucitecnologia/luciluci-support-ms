import Ticket from '../../entities/ticket.entity';
import TicketAdminStatus from '../../entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../entities/enums/ticket-origin.enum';
import TicketPriority from '../../entities/enums/ticket-priority.enum';

export interface ListTicketsFilters {
	number?: number;
	startInclusive?: Date;
	endExclusive?: Date;
	status?: TicketAdminStatus;
	origin?: TicketOrigin;
	originRefId?: string;
	departmentId?: string;
	priority?: TicketPriority;
	requesterId?: string;
	page: number;
	size: number;
}

export type TicketListScope =
	| { kind: 'requester'; actorId: string }
	| { kind: 'admin'; actorId: string };

export interface TicketPage {
	tickets: Ticket[];
	total: number;
}

export default interface IListTicketsRepository {
	findPage(scope: TicketListScope, filters: ListTicketsFilters): Promise<TicketPage>;
}
