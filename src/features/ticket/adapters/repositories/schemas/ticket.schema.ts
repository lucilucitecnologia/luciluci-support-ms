import { EntitySchema } from 'typeorm';

import Ticket from '../../../entities/ticket.entity';

const TicketSchema = new EntitySchema<Ticket>({
	name: 'Ticket',
	target: Ticket,
	tableName: 'tickets',
	columns: {
		id: { type: String, primary: true },
		number: { type: Number, unique: true },
		subject: { type: String },
		requesterId: { name: 'requester_id', type: String },
		departmentId: { name: 'department_id', type: String },
		priority: { type: String },
		origin: { type: String },
		originRefId: { name: 'origin_ref_id', type: String },
		adminStatus: { name: 'admin_status', type: String },
		requesterStatus: { name: 'requester_status', type: String },
		createdAt: { name: 'created_at', type: Date },
		updatedAt: { name: 'updated_at', type: Date },
	},
	relations: {
		department: {
			type: 'many-to-one',
			target: 'Department',
			joinColumn: { name: 'department_id', referencedColumnName: 'id' },
			onDelete: 'RESTRICT',
		},
	},
});

export default TicketSchema;
