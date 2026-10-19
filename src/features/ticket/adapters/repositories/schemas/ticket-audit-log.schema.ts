import { EntitySchema } from 'typeorm';

import TicketAuditLog from '../../../entities/ticket-audit-log.entity';

const TicketAuditLogSchema = new EntitySchema<TicketAuditLog>({
	name: 'TicketAuditLog',
	target: TicketAuditLog,
	tableName: 'ticket_audit_logs',
	columns: {
		id: { type: String, primary: true },
		ticketId: { name: 'ticket_id', type: String },
		datetime: { type: Date },
		authorId: { name: 'author_id', type: String },
		origin: { type: String },
		action: { type: String },
		newStatus: { name: 'new_status', type: String, nullable: true },
	},
	relations: {
		ticket: {
			type: 'many-to-one',
			target: 'Ticket',
			joinColumn: { name: 'ticket_id', referencedColumnName: 'id' },
			onDelete: 'CASCADE',
		},
	},
});

export default TicketAuditLogSchema;
