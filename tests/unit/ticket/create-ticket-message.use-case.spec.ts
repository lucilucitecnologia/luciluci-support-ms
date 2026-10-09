import Department from '../../../src/features/department/entities/department.entity';
import DepartmentAllowedUser from '../../../src/features/department/entities/department-allowed-user.entity';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAuditLog from '../../../src/features/ticket/entities/ticket-audit-log.entity';
import CreateTicketMessageUseCase from '../../../src/features/ticket/use-cases/create-ticket-message.use-case';
import ICreateTicketMessageRepository from '../../../src/features/ticket/use-cases/repositories/icreate-ticket-message.repository';

const before = new Date('2026-09-25T10:00:00.000Z');
const after = new Date('2026-09-25T10:00:01.000Z');

function fixture(status = 'em_andamento') {
	const ticket = Object.assign(new Ticket(), {
		id: 'f57d57a6-3b94-4d4b-bf09-73c127e02c45',
		departmentId: 'a19cf070-ea36-41df-9382-e44d541f8003',
		requesterId: 'owner',
		adminStatus: status,
		requesterStatus: 'resolvido',
		updatedAt: before,
	});
	const department = Object.assign(new Department(), {
		id: ticket.departmentId,
		active: false,
		allowedUsers: [Object.assign(new DepartmentAllowedUser(), { userId: 'admin-1' })],
	});
	const calls: string[] = [];
	const departments = {
		findByIdForUpdate: jest.fn(async () => {
			calls.push('department');
			return department;
		}),
	};
	const tickets = {
		findByIdForUpdate: jest.fn(async () => {
			calls.push('ticket');
			return ticket;
		}),
		createMessage: jest.fn(async () => {
			calls.push('message');
		}),
		createMedia: jest.fn(async () => {
			calls.push('media');
		}),
		touchAfterAdminMessage: jest.fn(async () => {
			calls.push('touch');
		}),
		updateAfterRequesterMessage: jest.fn(async () => {
			calls.push('status');
		}),
		createAuditLog: jest.fn(async (_audit: TicketAuditLog) => {
			calls.push('audit');
		}),
	} satisfies ICreateTicketMessageRepository;
	let counter = 0;
	const useCase = new CreateTicketMessageUseCase(
		departments,
		tickets,
		() => after,
		() => `f57d57a6-3b94-4d4b-bf09-73c127e02c4${counter++}`,
	);
	return { ticket, department, departments, tickets, calls, useCase };
}

describe('Unit: RF10 create TicketMessage', () => {
	it.each([true, false])(
		'creates an admin message with visibility %s and one audit',
		async (visible) => {
			const f = fixture();
			const response = await f.useCase.execute(
				f.ticket.id,
				{
					message: '  Keep this text  ',
					type: 'admin',
					authorId: 'admin-1',
					isVisibleToRequester: visible,
				},
				{ id: 'admin-1', role: 'admin' },
			);
			expect(Object.keys(response)).toEqual([
				'id',
				'ticketId',
				'message',
				'type',
				'authorId',
				'mediaIds',
				'isVisibleToRequester',
				'createdAt',
			]);
			expect(response).toMatchObject({
				message: '  Keep this text  ',
				mediaIds: [],
				isVisibleToRequester: visible,
				createdAt: after,
			});
			expect(f.calls).toEqual(['ticket', 'department', 'message', 'media', 'touch', 'audit']);
			expect(f.tickets.touchAfterAdminMessage).toHaveBeenCalledWith(f.ticket.id, after);
			expect(f.tickets.updateAfterRequesterMessage).not.toHaveBeenCalled();
			expect(f.ticket.adminStatus).toBe('em_andamento');
			expect(f.ticket.requesterStatus).toBe('resolvido');
			expect(f.tickets.createAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'nova_mensagem',
					statusType: null,
					newStatus: null,
					authorId: 'admin-1',
					origin: 'admin',
					datetime: after,
				}),
			);
		},
	);

	it.each(['backoffice', 'cd'] as const)(
		'creates requester %s message and two audits even when pending',
		async (role) => {
			const f = fixture('pendente');
			const response = await f.useCase.execute(
				f.ticket.id,
				{
					message: 'More detail',
					type: role,
					authorId: 'owner',
					mediaIds: ['a', 'b', 'a'],
					isVisibleToRequester: true,
				},
				{ id: 'owner', role },
			);
			expect(response.mediaIds).toEqual(['a', 'b', 'a']);
			expect(f.tickets.createMedia).toHaveBeenCalledWith([
				expect.objectContaining({ position: 0, mediaId: 'a' }),
				expect.objectContaining({ position: 1, mediaId: 'b' }),
				expect.objectContaining({ position: 2, mediaId: 'a' }),
			]);
			expect(f.calls).toEqual(['ticket', 'message', 'media', 'status', 'audit', 'audit']);
			expect(f.departments.findByIdForUpdate).not.toHaveBeenCalled();
			expect(f.tickets.updateAfterRequesterMessage).toHaveBeenCalledWith(f.ticket.id, after);
			expect(
				f.tickets.createAuditLog.mock.calls.map(([audit]) => [
					audit.action,
					audit.statusType,
					audit.newStatus,
				]),
			).toEqual([
				['nova_mensagem', null, null],
				['alteracao_status', 'admin', 'pendente'],
			]);
			expect(f.ticket.requesterStatus).toBe('resolvido');
		},
	);

	it('denies admin without membership and requester without ownership before writes', async () => {
		const admin = fixture();
		admin.department.allowedUsers = [];
		await expect(
			admin.useCase.execute(
				admin.ticket.id,
				{ message: 'x', type: 'admin', authorId: 'admin-1', isVisibleToRequester: false },
				{ id: 'admin-1', role: 'admin' },
			),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(admin.tickets.createMessage).not.toHaveBeenCalled();
		const requester = fixture();
		await expect(
			requester.useCase.execute(
				requester.ticket.id,
				{ message: 'x', type: 'cd', authorId: 'other', isVisibleToRequester: true },
				{ id: 'other', role: 'cd' },
			),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(requester.tickets.createMessage).not.toHaveBeenCalled();
	});

	it('rejects a hidden requester message without writes', async () => {
		const f = fixture();
		await expect(
			f.useCase.execute(
				f.ticket.id,
				{ message: 'x', type: 'cd', authorId: 'owner', isVisibleToRequester: false },
				{ id: 'owner', role: 'cd' },
			),
		).rejects.toMatchObject({ statusCode: 422 });
		expect(f.tickets.createMessage).not.toHaveBeenCalled();
	});
});
