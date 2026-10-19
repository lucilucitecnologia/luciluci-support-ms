import TicketStatus from '../../entities/enums/ticket-status.enum';
import Ticket from '../../entities/ticket.entity';
import TicketAuditLog from '../../entities/ticket-audit-log.entity';
import TicketMessage from '../../entities/ticket-message.entity';
import TicketMessageMedia from '../../entities/ticket-message-media.entity';

export default interface ICreateTicketMessageRepository {
	findByIdForUpdate(id: string): Promise<Ticket | undefined>;
	createMessage(message: TicketMessage): Promise<void>;
	createMedia(media: TicketMessageMedia[]): Promise<void>;
	updateAfterAdminMessage(ticketId: string, updatedAt: Date, status: TicketStatus): Promise<void>;
	updateAfterRequesterMessage(ticketId: string, updatedAt: Date): Promise<void>;
	createAuditLog(auditLog: TicketAuditLog): Promise<void>;
}
