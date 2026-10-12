import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import IDepartmentRepository from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAdminStatus from '../../../src/features/ticket/entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import TicketRequesterStatus from '../../../src/features/ticket/entities/enums/ticket-requester-status.enum';
import IUpdateTicketRepository from '../../../src/features/ticket/use-cases/repositories/iupdate-ticket.repository';
import UpdateTicketUseCase from '../../../src/features/ticket/use-cases/update-ticket.use-case';

const currentId = 'a19cf070-ea36-41df-9382-e44d541f8003';
const targetId = '319cf070-ea36-41df-9382-e44d541f8004';
const originalTime = new Date('2026-09-17T18:00:00.000Z');

function department(id: string): Department {
	const item = new Department();
	item.id = id;
	item.active = true;
	item.allowedUsers = [Object.assign(new DepartmentAllowedUser(), { userId: 'admin-1' })];
	return item;
}

function ticket(): Ticket {
	const item = new Ticket();
	Object.assign(item, {
		id: 'f57d57a6-3b94-4d4b-bf09-73c127e02c45',
		number: 1,
		subject: 'Issue',
		requesterId: 'requester-1',
		departmentId: currentId,
		priority: TicketPriority.Alta,
		origin: TicketOrigin.Backoffice,
		originRefId: 'ref-1',
		adminStatus: TicketAdminStatus.Pendente,
		requesterStatus: TicketRequesterStatus.NaoResolvido,
		createdAt: originalTime,
		updatedAt: originalTime,
	});
	return item;
}

describe('Unit: RF06 transaction sequencing', () => {
	it('locks Ticket before Departments in ascending UUID order and audits one transition', async () => {
		const order: string[] = [];
		const aggregate = ticket();
		const departments = new Map([
			[currentId, department(currentId)],
			[targetId, department(targetId)],
		]);
		const departmentRepository = {
			findByIdForUpdate: jest.fn(async (id: string) => {
				order.push(`department:${id}`);
				return departments.get(id);
			}),
		} as unknown as IDepartmentRepository;
		const ticketRepository = {
			findByIdForUpdate: jest.fn(async () => {
				order.push('ticket');
				return aggregate;
			}),
			updateTicket: jest.fn(async () => {
				order.push('update');
			}),
			createAuditLog: jest.fn(async () => {
				order.push('audit');
			}),
		} as unknown as IUpdateTicketRepository;
		const useCase = new UpdateTicketUseCase(
			departmentRepository,
			ticketRepository,
			() => new Date('2026-09-17T18:00:01.000Z'),
			() => '91828ef8-e38a-4e99-99ea-f54cbba0c034',
		);
		const response = await useCase.execute(
			aggregate.id,
			{
				departmentId: targetId,
				adminStatus: TicketAdminStatus.Finalizado,
			},
			{ id: 'admin-1', role: 'admin' },
		);
		expect(order).toEqual([
			'ticket',
			`department:${targetId}`,
			`department:${currentId}`,
			'update',
			'audit',
		]);
		expect(response).toMatchObject({ departmentId: targetId, adminStatus: 'finalizado' });
		expect(ticketRepository.createAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'alteracao_status',
				statusType: 'admin',
				newStatus: 'finalizado',
				authorId: 'admin-1',
				origin: 'admin',
			}),
		);
	});

	it('does not write on a total no-op', async () => {
		const aggregate = ticket();
		const departmentRepository = {
			findByIdForUpdate: jest.fn(async () => department(currentId)),
		} as unknown as IDepartmentRepository;
		const ticketRepository = {
			findByIdForUpdate: jest.fn(async () => aggregate),
			updateTicket: jest.fn(),
			createAuditLog: jest.fn(),
		} as unknown as IUpdateTicketRepository;
		const response = await new UpdateTicketUseCase(
			departmentRepository,
			ticketRepository,
		).execute(
			aggregate.id,
			{ priority: TicketPriority.Alta },
			{ id: 'requester-1', role: 'cd' },
		);
		expect(response.updatedAt).toBe(originalTime.toISOString());
		expect(ticketRepository.updateTicket).not.toHaveBeenCalled();
		expect(ticketRepository.createAuditLog).not.toHaveBeenCalled();
	});
});
