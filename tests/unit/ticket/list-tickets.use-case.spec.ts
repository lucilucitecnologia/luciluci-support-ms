import { parseListTicketsQuery } from '../../../src/features/ticket/adapters/controllers/dtos/list-tickets-query.dto';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAdminStatus from '../../../src/features/ticket/entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import IListTicketsRepository from '../../../src/features/ticket/use-cases/repositories/ilist-tickets.repository';
import ListTicketsUseCase from '../../../src/features/ticket/use-cases/list-tickets.use-case';

describe('Unit: RF07 listing contract', () => {
	it('parses leap-day UTC boundaries without locale dependence', () => {
		const filters = parseListTicketsQuery(
			'/api/support/tickets/admin/admin-1?startDate=29/02/2024&endDate=29/02/2024',
			true,
		);
		expect(filters.startInclusive?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
		expect(filters.endExclusive?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
		expect(() => parseListTicketsQuery('?startDate=29/02/2025', false)).toThrow();
	});

	it('limits the projection to nine fields and keeps the repository scope', async () => {
		const ticket = Object.assign(new Ticket(), {
			id: 'ed4fa86e-1536-4f02-a0c5-cbcf92a865c6',
			number: 42,
			createdAt: new Date('2026-09-04T23:59:59.999Z'),
			departmentId: 'b46ff00b-8632-4222-b276-1d5a503c1dc0',
			requesterId: 'requester-1',
			origin: TicketOrigin.Cd,
			priority: TicketPriority.Urgente,
			adminStatus: TicketAdminStatus.Resolvido,
			subject: 'Private subject',
			requesterStatus: 'nao_resolvido',
			updatedAt: new Date('2026-09-05T00:00:00.000Z'),
		});
		const repository = {
			findPage: jest.fn(async () => ({ tickets: [ticket], total: 21 })),
		} as unknown as IListTicketsRepository;
		const scope = { kind: 'requester' as const, actorId: 'requester-1' };
		const filters = parseListTicketsQuery('?page=2&size=10', false);
		const response = await new ListTicketsUseCase(repository).execute(scope, filters);
		expect(repository.findPage).toHaveBeenCalledWith(scope, filters);
		expect(response).toEqual({
			data: [
				{
					id: ticket.id,
					number: 42,
					subject: 'Private subject',
					createdAt: '2026-09-04T23:59:59.999Z',
					departmentId: ticket.departmentId,
					requesterId: 'requester-1',
					origin: 'cd',
					priority: 'urgente',
					status: 'resolvido',
				},
			],
			pagination: { page: 2, size: 10, total: 21, totalPages: 3 },
		});
	});
});
