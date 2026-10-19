import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

import TicketPriority from '../../../entities/enums/ticket-priority.enum';
import TicketStatus from '../../../entities/enums/ticket-status.enum';

export default class UpdateTicketRequestDTO {
	@ValidateIf((_object, value) => value !== undefined)
	@IsEnum(TicketPriority)
	priority?: TicketPriority;

	@ValidateIf((_object, value) => value !== undefined)
	@IsUUID('4')
	departmentId?: string;

	@ValidateIf((_object, value) => value !== undefined)
	@IsEnum(TicketStatus)
	status?: TicketStatus;
}
