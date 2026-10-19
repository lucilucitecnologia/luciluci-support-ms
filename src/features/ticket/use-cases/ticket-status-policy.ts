import TicketStatus from '../entities/enums/ticket-status.enum';

export type RequesterStatusAction = 'approve' | 'reject' | 'cancel';

interface RequesterTransition {
	from: TicketStatus[];
	to: TicketStatus;
}

// Requester status changes are only reachable through these three actions.
export const REQUESTER_TRANSITIONS: Record<RequesterStatusAction, RequesterTransition> = {
	approve: { from: [TicketStatus.Resolvido], to: TicketStatus.Finalizado },
	reject: { from: [TicketStatus.Resolvido], to: TicketStatus.Pendente },
	cancel: { from: [TicketStatus.Pendente, TicketStatus.EmAndamento], to: TicketStatus.Cancelado },
};

export function isClosedStatus(status: TicketStatus): boolean {
	return status === TicketStatus.Finalizado || status === TicketStatus.Cancelado;
}
