import Ticket from '../../entities/ticket.entity';
import TicketAuditLog from '../../entities/ticket-audit-log.entity';

export default interface IUpdateTicketRepository {
	findByIdForUpdate(id: string): Promise<Ticket | undefined>;
	updateTicket(ticket: Ticket): Promise<void>;
	createAuditLog(auditLog: TicketAuditLog): Promise<void>;
}
