/** W1 canonical fixture v1. The T01–T16 matrix is frozen in the W1 definition report. */
export const W1_ACTORS = {
	adminA: 'seed-admin-a',
	adminB: 'seed-admin-b',
	adminC: 'seed-admin-c',
	backofficeA: 'seed-backoffice-a',
	backofficeB: 'seed-backoffice-b',
	cdA: 'seed-cd-a',
	cdB: 'seed-cd-b',
	outsider: 'seed-outsider',
} as const;

export type W1Row = Record<string, string | number | boolean | null>;
export type W1Table =
	| 'departments'
	| 'department_allowed_users'
	| 'tickets'
	| 'ticket_messages'
	| 'ticket_message_media'
	| 'ticket_audit_logs';
export const W1_TABLES: W1Table[] = [
	'departments',
	'department_allowed_users',
	'tickets',
	'ticket_messages',
	'ticket_message_media',
	'ticket_audit_logs',
];
export type W1Fixture = Record<W1Table, W1Row[]>;

type AdminStatus = 'pendente' | 'cancelado' | 'em_andamento' | 'finalizado' | 'resolvido';
type Priority = 'baixa' | 'media' | 'alta' | 'urgente';
type DepartmentKey = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06';
type Requester =
	| typeof W1_ACTORS.backofficeA
	| typeof W1_ACTORS.backofficeB
	| typeof W1_ACTORS.cdA
	| typeof W1_ACTORS.cdB;

export interface W1Scenario {
	key: string;
	department: DepartmentKey;
	requester: Requester;
	priority: Priority;
	adminStatus: AdminStatus;
	requesterResolved: boolean;
	followUp: boolean;
	adminTransitions: AdminStatus[];
}

export const W1_SCENARIOS: W1Scenario[] = [
	{
		key: 'T01',
		department: 'D01',
		requester: W1_ACTORS.backofficeA,
		priority: 'baixa',
		adminStatus: 'cancelado',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['cancelado'],
	},
	{
		key: 'T02',
		department: 'D01',
		requester: W1_ACTORS.backofficeA,
		priority: 'media',
		adminStatus: 'em_andamento',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['em_andamento'],
	},
	{
		key: 'T03',
		department: 'D01',
		requester: W1_ACTORS.backofficeA,
		priority: 'alta',
		adminStatus: 'finalizado',
		requesterResolved: false,
		followUp: true,
		adminTransitions: ['finalizado'],
	},
	{
		key: 'T04',
		department: 'D02',
		requester: W1_ACTORS.backofficeA,
		priority: 'urgente',
		adminStatus: 'resolvido',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['resolvido'],
	},
	{
		key: 'T05',
		department: 'D02',
		requester: W1_ACTORS.backofficeB,
		priority: 'baixa',
		adminStatus: 'cancelado',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['cancelado'],
	},
	{
		key: 'T06',
		department: 'D02',
		requester: W1_ACTORS.backofficeB,
		priority: 'media',
		adminStatus: 'em_andamento',
		requesterResolved: false,
		followUp: true,
		adminTransitions: ['em_andamento'],
	},
	{
		key: 'T07',
		department: 'D03',
		requester: W1_ACTORS.backofficeB,
		priority: 'alta',
		adminStatus: 'finalizado',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['finalizado'],
	},
	{
		key: 'T08',
		department: 'D03',
		requester: W1_ACTORS.backofficeB,
		priority: 'urgente',
		adminStatus: 'resolvido',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['resolvido'],
	},
	{
		key: 'T09',
		department: 'D03',
		requester: W1_ACTORS.cdA,
		priority: 'baixa',
		adminStatus: 'cancelado',
		requesterResolved: false,
		followUp: true,
		adminTransitions: ['cancelado'],
	},
	{
		key: 'T10',
		department: 'D04',
		requester: W1_ACTORS.cdA,
		priority: 'media',
		adminStatus: 'em_andamento',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['em_andamento'],
	},
	{
		key: 'T11',
		department: 'D04',
		requester: W1_ACTORS.cdA,
		priority: 'alta',
		adminStatus: 'finalizado',
		requesterResolved: true,
		followUp: true,
		adminTransitions: ['finalizado'],
	},
	{
		key: 'T12',
		department: 'D04',
		requester: W1_ACTORS.cdA,
		priority: 'urgente',
		adminStatus: 'resolvido',
		requesterResolved: false,
		followUp: true,
		adminTransitions: ['resolvido'],
	},
	{
		key: 'T13',
		department: 'D05',
		requester: W1_ACTORS.cdB,
		priority: 'baixa',
		adminStatus: 'pendente',
		requesterResolved: false,
		followUp: false,
		adminTransitions: ['em_andamento', 'pendente'],
	},
	{
		key: 'T14',
		department: 'D05',
		requester: W1_ACTORS.cdB,
		priority: 'media',
		adminStatus: 'pendente',
		requesterResolved: false,
		followUp: false,
		adminTransitions: ['em_andamento', 'pendente'],
	},
	{
		key: 'T15',
		department: 'D06',
		requester: W1_ACTORS.cdB,
		priority: 'alta',
		adminStatus: 'pendente',
		requesterResolved: false,
		followUp: false,
		adminTransitions: [],
	},
	{
		key: 'T16',
		department: 'D06',
		requester: W1_ACTORS.cdB,
		priority: 'urgente',
		adminStatus: 'pendente',
		requesterResolved: false,
		followUp: false,
		adminTransitions: [],
	},
];

const DEPARTMENTS: {
	key: DepartmentKey;
	name: string;
	type: string;
	active: boolean;
	admins: string[];
}[] = [
	{
		key: 'D01',
		name: 'W1 Atendimento Geral A',
		type: 'todos',
		active: true,
		admins: [W1_ACTORS.adminA, W1_ACTORS.adminB],
	},
	{
		key: 'D02',
		name: 'W1 Atendimento Geral B',
		type: 'todos',
		active: true,
		admins: [W1_ACTORS.adminB],
	},
	{
		key: 'D03',
		name: 'W1 Backoffice Ativo',
		type: 'backoffice',
		active: true,
		admins: [W1_ACTORS.adminA],
	},
	{ key: 'D04', name: 'W1 CD Ativo', type: 'cd', active: true, admins: [W1_ACTORS.adminC] },
	{
		key: 'D05',
		name: 'W1 Backoffice Histórico',
		type: 'backoffice',
		active: false,
		admins: [W1_ACTORS.adminB],
	},
	{ key: 'D06', name: 'W1 CD Histórico', type: 'cd', active: false, admins: [W1_ACTORS.adminC] },
];

// Fixed UUIDv4 values by category and ordinal. No runtime randomness or clock input.
const fixedUuid = (category: number, ordinal: number): string =>
	String(category).padStart(8, '0') + '-0000-4000-8000-' + String(ordinal).padStart(12, '0');
const instant = (ticketOrdinal: number, minute: number): string =>
	new Date(Date.UTC(2026, 0, ticketOrdinal, 0, minute)).toISOString();
const departmentCreatedAt = '2025-12-01T00:00:00.000Z';
const departmentInactivatedAt = '2026-02-01T00:00:00.000Z';

export function buildW1Fixture(): W1Fixture {
	const result: W1Fixture = {
		departments: [],
		department_allowed_users: [],
		tickets: [],
		ticket_messages: [],
		ticket_message_media: [],
		ticket_audit_logs: [],
	};
	const departmentId = new Map<DepartmentKey, string>();
	const departmentAdmin = new Map<DepartmentKey, string>();
	let messageOrdinal = 0;
	let auditOrdinal = 0;
	const addMessage = (
		ticketId: string,
		message: string,
		type: string,
		authorId: string,
		visible: boolean,
		createdAt: string,
	): string => {
		const id = fixedUuid(3, ++messageOrdinal);
		result.ticket_messages.push({
			id,
			ticket_id: ticketId,
			message,
			type,
			author_id: authorId,
			is_visible_to_requester: visible,
			created_at: createdAt,
		});
		return id;
	};
	const addAudit = (
		ticketId: string,
		datetime: string,
		authorId: string,
		origin: string,
		action: string,
		statusType: string | null = null,
		newStatus: string | null = null,
	): void => {
		result.ticket_audit_logs.push({
			id: fixedUuid(4, ++auditOrdinal),
			ticket_id: ticketId,
			datetime,
			author_id: authorId,
			origin,
			action,
			status_type: statusType,
			new_status: newStatus,
		});
	};

	for (const [index, department] of DEPARTMENTS.entries()) {
		const id = fixedUuid(1, index + 1);
		departmentId.set(department.key, id);
		departmentAdmin.set(department.key, department.admins[0]);
		result.departments.push({
			id,
			name: department.name,
			type: department.type,
			active: department.active,
			created_at: departmentCreatedAt,
			updated_at: department.active ? departmentCreatedAt : departmentInactivatedAt,
		});
		department.admins.forEach((admin, position) =>
			result.department_allowed_users.push({ department_id: id, position, user_id: admin }),
		);
	}

	for (const [index, scenario] of W1_SCENARIOS.entries()) {
		const ordinal = index + 1;
		const id = fixedUuid(2, ordinal);
		const deptId = departmentId.get(scenario.department);
		const admin = departmentAdmin.get(scenario.department);
		if (!deptId || !admin) throw new Error('W1 scenario references unknown Department');
		const origin = scenario.requester.startsWith('seed-cd-') ? 'cd' : 'backoffice';
		const createdAt = instant(ordinal, 0);
		const followAt = instant(ordinal, 1);
		const adminAt = instant(ordinal, 2);
		const finalStep = scenario.requesterResolved
			? 5
			: scenario.adminTransitions.length === 2
				? 4
				: scenario.adminTransitions.length === 1
					? 3
					: 2;
		result.tickets.push({
			id,
			number: ordinal,
			subject: 'W1 ' + scenario.key + ' synthetic request',
			requester_id: scenario.requester,
			department_id: deptId,
			priority: scenario.priority,
			origin,
			origin_ref_id: 'seed-' + origin + '-ref-' + String(ordinal).padStart(2, '0'),
			admin_status: scenario.adminStatus,
			requester_status: scenario.requesterResolved ? 'resolvido' : 'nao_resolvido',
			created_at: createdAt,
			updated_at: instant(ordinal, finalStep),
		});
		addMessage(
			id,
			'W1 ' + scenario.key + ' initial requester message',
			origin,
			scenario.requester,
			true,
			createdAt,
		);
		addAudit(id, createdAt, scenario.requester, origin, 'criacao_ticket');
		if (scenario.followUp) {
			addMessage(
				id,
				'W1 ' + scenario.key + ' requester follow-up',
				origin,
				scenario.requester,
				true,
				followAt,
			);
			addAudit(id, followAt, scenario.requester, origin, 'nova_mensagem');
			addAudit(
				id,
				followAt,
				scenario.requester,
				origin,
				'alteracao_status',
				'admin',
				'pendente',
			);
		}
		const adminMessageId = addMessage(
			id,
			'W1 ' + scenario.key + ' admin message',
			'admin',
			admin,
			ordinal % 2 === 1,
			adminAt,
		);
		addAudit(id, adminAt, admin, 'admin', 'nova_mensagem');
		for (const [transitionIndex, status] of scenario.adminTransitions.entries()) {
			addAudit(
				id,
				instant(ordinal, 3 + transitionIndex),
				admin,
				'admin',
				'alteracao_status',
				'admin',
				status,
			);
		}
		if (scenario.requesterResolved)
			addAudit(
				id,
				instant(ordinal, 5),
				scenario.requester,
				origin,
				'alteracao_status',
				'requester',
				'resolvido',
			);
		if (ordinal === 1 || ordinal === 2)
			result.ticket_message_media.push({
				ticket_message_id: adminMessageId,
				position: 0,
				media_id: 'seed-media-' + scenario.key + '-a',
			});
		if (ordinal === 3 || ordinal === 4) {
			result.ticket_message_media.push(
				{
					ticket_message_id: adminMessageId,
					position: 0,
					media_id: 'seed-media-' + scenario.key + '-a',
				},
				{
					ticket_message_id: adminMessageId,
					position: 1,
					media_id: 'seed-media-' + scenario.key + '-b',
				},
				{
					ticket_message_id: adminMessageId,
					position: 2,
					media_id:
						ordinal === 3
							? 'seed-media-' + scenario.key + '-a'
							: 'seed-media-' + scenario.key + '-c',
				},
			);
		}
	}
	return result;
}

export const W1_FIXTURE = buildW1Fixture();
