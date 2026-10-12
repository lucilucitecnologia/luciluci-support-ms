import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAdminStatus from '../../../src/features/ticket/entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../../../src/features/ticket/entities/enums/ticket-requester-status.enum';
import IUpdateTicketRepository from '../../../src/features/ticket/use-cases/repositories/iupdate-ticket.repository';
import ResolveTicketUseCase from '../../../src/features/ticket/use-cases/resolve-ticket.use-case';

const originalTime = new Date('2026-09-24T18:00:00.000Z');
const nextTime = new Date('2026-09-24T18:00:01.000Z');

function ticket(): Ticket {
	return Object.assign(new Ticket(), {
		id: 'f57d57a6-3b94-4d4b-bf09-73c127e02c45',
		number: 12,
		subject: 'Issue',
		requesterId: 'owner',
		departmentId: 'a19cf070-ea36-41df-9382-e44d541f8003',
		priority: TicketPriority.Alta,
		origin: TicketOrigin.Backoffice,
		originRefId: 'ref-1',
		adminStatus: TicketAdminStatus.Pendente,
		requesterStatus: TicketRequesterStatus.NaoResolvido,
		createdAt: originalTime,
		updatedAt: originalTime,
	});
}

function repository(aggregate?: Ticket) {
	return {
		findByIdForUpdate: jest.fn(async () => aggregate),
		updateRequesterStatus: jest.fn(async () => undefined),
		updateTicket: jest.fn(async () => undefined),
		createAuditLog: jest.fn(async () => undefined),
	} satisfies IUpdateTicketRepository;
}

describe('Unit: RF08 resolve ticket', () => {
	it.each(['backoffice', 'cd'] as const)(
		'resolves for owner %s even when role differs from origin',
		async (role) => {
			const aggregate = ticket();
			const repo = repository(aggregate);
			const result = await new ResolveTicketUseCase(
				repo,
				() => nextTime,
				() => '91828ef8-e38a-4e99-99ea-f54cbba0c034',
			).execute(aggregate.id, { id: 'owner', role });
			expect(result).toMatchObject({
				requesterStatus: 'resolvido',
				adminStatus: 'pendente',
				priority: 'alta',
				updatedAt: nextTime.toISOString(),
			});
			expect(aggregate.createdAt).toBe(originalTime);
			expect(repo.updateRequesterStatus).toHaveBeenCalledTimes(1);
			expect(repo.updateTicket).not.toHaveBeenCalled();
			expect(repo.createAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'alteracao_status',
					statusType: 'requester',
					newStatus: 'resolvido',
					authorId: 'owner',
					origin: role,
					datetime: nextTime,
				}),
			);
		},
	);

	it('returns a strict no-op for an already resolved ticket', async () => {
		const aggregate = ticket();
		aggregate.requesterStatus = TicketRequesterStatus.Resolvido;
		const repo = repository(aggregate);
		const result = await new ResolveTicketUseCase(repo).execute(aggregate.id, {
			id: 'owner',
			role: 'cd',
		});
		expect(result.updatedAt).toBe(originalTime.toISOString());
		expect(repo.updateRequesterStatus).not.toHaveBeenCalled();
		expect(repo.createAuditLog).not.toHaveBeenCalled();
	});

	it.each([
		{ id: 'owner', role: 'admin' as const },
		{ id: 'other', role: 'backoffice' as const },
	])('forbids actor $role/$id without writes', async (actor) => {
		const aggregate = ticket();
		const repo = repository(aggregate);
		await expect(
			new ResolveTicketUseCase(repo).execute(aggregate.id, actor),
		).rejects.toMatchObject({
			statusCode: 403,
		});
		expect(repo.updateRequesterStatus).not.toHaveBeenCalled();
		expect(repo.createAuditLog).not.toHaveBeenCalled();
	});

	it('returns 404 for a missing Ticket', async () => {
		await expect(
			new ResolveTicketUseCase(repository()).execute('absent', { id: 'owner', role: 'cd' }),
		).rejects.toMatchObject({ statusCode: 404 });
	});
});
