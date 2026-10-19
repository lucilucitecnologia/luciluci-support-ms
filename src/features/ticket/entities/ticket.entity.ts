import Department from '../../department/entities/department.entity';
import TicketOrigin from './enums/ticket-origin.enum';
import TicketPriority from './enums/ticket-priority.enum';
import TicketStatus from './enums/ticket-status.enum';

export default class Ticket {
	id!: string;
	number!: number;
	subject!: string;
	requesterId!: string;
	departmentId!: string;
	priority!: TicketPriority;
	origin!: TicketOrigin;
	originRefId!: string;
	status!: TicketStatus;
	createdAt!: Date;
	updatedAt!: Date;
	department?: Department;
}
