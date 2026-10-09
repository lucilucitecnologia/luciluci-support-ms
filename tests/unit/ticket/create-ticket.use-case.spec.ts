import Department from '../../../src/features/department/entities/department.entity';
import IDepartmentRepository, {
	FindActiveDepartmentsPageInput,
} from '../../../src/features/department/use-cases/repositories/idepartment.repository';
import TicketOrigin from '../../../src/features/ticket/entities/enums/ticket-origin.enum';
import TicketPriority from '../../../src/features/ticket/entities/enums/ticket-priority.enum';
import Ticket from '../../../src/features/ticket/entities/ticket.entity';
import TicketAuditLog from '../../../src/features/ticket/entities/ticket-audit-log.entity';
import TicketMessage from '../../../src/features/ticket/entities/ticket-message.entity';
import TicketMessageMedia from '../../../src/features/ticket/entities/ticket-message-media.entity';
import CreateTicketUseCase from '../../../src/features/ticket/use-cases/create-ticket.use-case';
import ITicketRepository from '../../../src/features/ticket/use-cases/repositories/iticket.repository';

const departmentId = 'b7c98c89-fbcb-4d36-9d8d-345d36162736';
const timestamp = new Date('2026-09-17T18:30:00.000Z');
const ids = [
	'113f6164-9f15-493c-8386-ac81670986e1',
	'20311a13-0172-4a78-a707-3a2ad03f0c88',
	'3a3bbc89-6af1-4eab-b20a-3d8035e27d22',
];

class FakeDepartmentRepository implements IDepartmentRepository {
	constructor(private readonly department?: Department) {}

	async save(value: Department): Promise<Department> {
		return value;
	}

	async update(value: Department): Promise<Department> {
		return value;
	}

	async findById(_id: string): Promise<Department | undefined> {
		return undefined;
	}

	async findByIdForUpdate(_id: string): Promise<Department | undefined> {
		return this.department;
	}

	async replaceAllowedUsers(_departmentId: string, _userIds: string[]): Promise<void> {
		return undefined;
	}

	async findActivePage(_input: FindActiveDepartmentsPageInput) {
		return { departments: [], total: 0 };
	}
}

class FakeTicketRepository implements ITicketRepository {
	ticket?: Ticket;
	message?: TicketMessage;
	media?: TicketMessageMedia[];
	audit?: TicketAuditLog;
	operations: string[] = [];
	failOn?: 'ticket' | 'message' | 'media' | 'audit';

	async createTicket(ticket: Ticket): Promise<Ticket> {
		this.operations.push('ticket');
		if (this.failOn === 'ticket') throw new Error('repository failure');
		ticket.number = 41;
		this.ticket = ticket;
		return ticket;
	}

	async createMessage(message: TicketMessage): Promise<void> {
		this.operations.push('message');
		if (this.failOn === 'message') throw new Error('repository failure');
		this.message = message;
	}

	async createMedia(media: TicketMessageMedia[]): Promise<void> {
		this.operations.push('media');
		if (this.failOn === 'media') throw new Error('repository failure');
		this.media = media;
	}

	async createAuditLog(audit: TicketAuditLog): Promise<void> {
		this.operations.push('audit');
		if (this.failOn === 'audit') throw new Error('repository failure');
		this.audit = audit;
	}
}

function activeDepartment(active = true): Department {
	const department = new Department();
	department.id = departmentId;
	department.active = active;
	return department;
}

function input() {
	return {
		subject: 'Falha no acesso',
		requesterId: 'requester-123',
		departmentId,
		priority: TicketPriority.Alta,
		origin: TicketOrigin.Backoffice,
		message: {
			message: 'Não consigo acessar o painel.',
			mediaIds: ['media-2', 'media-1', 'media-2'],
		},
	};
}

describe('CreateTicketUseCase', () => {
	it('creates the ticket, initial message, ordered media and one creation audit', async () => {
		const repository = new FakeTicketRepository();
		let idIndex = 0;
		const response = await new CreateTicketUseCase(
			new FakeDepartmentRepository(activeDepartment()),
			repository,
			() => timestamp,
			() => ids[idIndex++],
		).execute(input());

		expect(response).toEqual({
			id: ids[0],
			number: 41,
			subject: 'Falha no acesso',
			requesterId: 'requester-123',
			departmentId,
			priority: 'alta',
			origin: 'backoffice',
			adminStatus: 'pendente',
			requesterStatus: 'nao_resolvido',
			createdAt: timestamp.toISOString(),
			updatedAt: timestamp.toISOString(),
		});
		expect(repository.ticket).toMatchObject({ id: ids[0], number: 41 });
		expect(repository.message).toMatchObject({
			id: ids[1],
			ticketId: ids[0],
			type: 'backoffice',
			authorId: 'requester-123',
			isVisibleToRequester: true,
			createdAt: timestamp,
		});
		expect(repository.media).toEqual([
			expect.objectContaining({ ticketMessageId: ids[1], position: 0, mediaId: 'media-2' }),
			expect.objectContaining({ ticketMessageId: ids[1], position: 1, mediaId: 'media-1' }),
			expect.objectContaining({ ticketMessageId: ids[1], position: 2, mediaId: 'media-2' }),
		]);
		expect(repository.audit).toMatchObject({
			id: ids[2],
			ticketId: ids[0],
			authorId: 'requester-123',
			origin: 'backoffice',
			action: 'criacao_ticket',
			statusType: null,
			newStatus: null,
			datetime: timestamp,
		});
		expect(repository.operations).toEqual(['ticket', 'message', 'media', 'audit']);
		expect(Object.keys(response)).not.toEqual(
			expect.arrayContaining(['message', 'mediaIds', 'audit']),
		);
	});

	it('persists no media rows when mediaIds is omitted', async () => {
		const repository = new FakeTicketRepository();
		let idIndex = 0;
		const value = { ...input(), message: { message: 'Sem anexos.' } };

		await new CreateTicketUseCase(
			new FakeDepartmentRepository(activeDepartment()),
			repository,
			() => timestamp,
			() => ids[idIndex++],
		).execute(value);

		expect(repository.media).toEqual([]);
	});

	it('rejects an unknown department before any ticket write', async () => {
		const repository = new FakeTicketRepository();
		await expect(
			new CreateTicketUseCase(new FakeDepartmentRepository(), repository).execute(input()),
		).rejects.toMatchObject({ statusCode: 404, message: 'not_found' });
		expect(repository.ticket).toBeUndefined();
	});

	it('rejects an inactive department with the frozen error before any ticket write', async () => {
		const repository = new FakeTicketRepository();
		await expect(
			new CreateTicketUseCase(
				new FakeDepartmentRepository(activeDepartment(false)),
				repository,
			).execute(input()),
		).rejects.toMatchObject({ statusCode: 422, message: 'department_inactive' });
		expect(repository.ticket).toBeUndefined();
	});

	it('propagates a repository error to the transaction boundary', async () => {
		const repository = new FakeTicketRepository();
		repository.failOn = 'audit';
		await expect(
			new CreateTicketUseCase(
				new FakeDepartmentRepository(activeDepartment()),
				repository,
			).execute(input()),
		).rejects.toThrow('repository failure');
		expect(repository.operations).toEqual(['ticket', 'message', 'media', 'audit']);
	});
});
