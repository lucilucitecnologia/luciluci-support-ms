import Department from '../../department/entities/department.entity';
import TicketAdminStatus from './enums/ticket-admin-status.enum';
import TicketOrigin from './enums/ticket-origin.enum';
import TicketPriority from './enums/ticket-priority.enum';
import TicketRequesterStatus from './enums/ticket-requester-status.enum';

export default class Ticket {
	id!: string;
	number!: number;
	subject!: string;
	requesterId!: string;
	departmentId!: string;
	priority!: TicketPriority;
	origin!: TicketOrigin;
	originRefId!: string;
	adminStatus!: TicketAdminStatus;
	requesterStatus!: TicketRequesterStatus;
	createdAt!: Date;
	updatedAt!: Date;
	department?: Department;
}
