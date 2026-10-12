import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAdminStatus from '../../../src/features/ticket/entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../../../src/features/ticket/entities/enums/ticket-requester-status.enum';
import GetTicketUseCase from '../../../src/features/ticket/use-cases/get-ticket.use-case';
import IGetTicketRepository from '../../../src/features/ticket/use-cases/repositories/iget-ticket.repository';

const createdAt = new Date('2026-09-24T18:00:00.000Z');
const id = 'f57d57a6-3b94-4d4b-bf09-73c127e02c45';
const departmentId = 'a19cf070-ea36-41df-9382-e44d541f8003';

function ticket(): Ticket {
	return Object.assign(new Ticket(), {
		id,
		number: 12,
		subject: 'Issue',
		requesterId: 'owner',
		departmentId,
		priority: TicketPriority.Alta,
		origin: TicketOrigin.Backoffice,
		originRefId: 'ref-1',
		adminStatus: TicketAdminStatus.Pendente,
		requesterStatus: TicketRequesterStatus.Resolvido,
		createdAt,
		updatedAt: createdAt,
	});
}

function repository(aggregate?: Ticket, membership = false) {
	return {
		findById: jest.fn(async () => aggregate),
		hasDepartmentMembership: jest.fn(async () => membership),
	} satisfies IGetTicketRepository;
}

describe('Unit: RF09 get ticket by ID', () => {
	it.each(['backoffice', 'cd'] as const)(
		'returns exactly the Ticket fields for owner %s regardless of origin',
		async (role) => {
			const aggregate = ticket();
			const repo = repository(aggregate);
			const before = { ...aggregate };
			const response = await new GetTicketUseCase(repo).execute(id, { id: 'owner', role });
			expect(response).toEqual({
				id,
				number: 12,
				subject: 'Issue',
				requesterId: 'owner',
				departmentId,
				priority: 'alta',
				origin: 'backoffice',
				originRefId: 'ref-1',
				adminStatus: 'pendente',
				requesterStatus: 'resolvido',
				createdAt: createdAt.toISOString(),
				updatedAt: createdAt.toISOString(),
			});
			expect(aggregate).toEqual(before);
			expect(repo.hasDepartmentMembership).not.toHaveBeenCalled();
		},
	);

	it('uses current Department membership for admin', async () => {
		const repo = repository(ticket(), true);
		const result = await new GetTicketUseCase(repo).execute(id, {
			id: 'admin-1',
			role: 'admin',
		});
		expect(result.id).toBe(id);
		expect(repo.hasDepartmentMembership).toHaveBeenCalledWith(departmentId, 'admin-1');
	});

	it.each([
		{ id: 'other', role: 'backoffice' as const },
		{ id: 'other', role: 'cd' as const },
		{ id: 'admin-2', role: 'admin' as const },
	])('returns 403 when $role/$id lacks access', async (actor) => {
		await expect(
			new GetTicketUseCase(repository(ticket())).execute(id, actor),
		).rejects.toMatchObject({
			statusCode: 403,
		});
	});

	it('returns 404 before checking membership for absent Ticket', async () => {
		const repo = repository();
		await expect(
			new GetTicketUseCase(repo).execute(id, { id: 'admin-1', role: 'admin' }),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(repo.hasDepartmentMembership).not.toHaveBeenCalled();
	});
});
