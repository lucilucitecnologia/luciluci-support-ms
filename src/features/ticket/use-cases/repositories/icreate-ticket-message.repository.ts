import Ticket from '../../entities/ticket.entity';
import TicketAuditLog from '../../entities/ticket-audit-log.entity';
import TicketMessage from '../../entities/ticket-message.entity';
import TicketMessageMedia from '../../entities/ticket-message-media.entity';

export default interface ICreateTicketMessageRepository {
	findByIdForUpdate(id: string): Promise<Ticket | undefined>;
	createMessage(message: TicketMessage): Promise<void>;
	createMedia(media: TicketMessageMedia[]): Promise<void>;
	touchAfterAdminMessage(ticketId: string, updatedAt: Date): Promise<void>;
	updateAfterRequesterMessage(ticketId: string, updatedAt: Date): Promise<void>;
	createAuditLog(auditLog: TicketAuditLog): Promise<void>;
}
