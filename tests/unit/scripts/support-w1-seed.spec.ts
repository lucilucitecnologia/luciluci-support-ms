import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
	applyW1State,
	classifyW1Snapshot,
	W1Snapshot,
} from '../../../scripts/seed/support-w1.database';
import {
	W1_ACTORS,
	W1_FIXTURE,
	W1Fixture,
	W1_SCENARIOS,
	W1_TABLES,
} from '../../../scripts/seed/support-w1.fixture';
import { validateW1Preconnection, W1SeedError } from '../../../scripts/seed/support-w1.safety';
import { validateW1Fixture } from '../../../scripts/seed/support-w1.validate';

const identity = { serviceSlug: 'support-ms', domainSlug: 'support' };
const environment = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
	SUPPORT_SEED_CONFIRM: 'W1_DISPOSABLE',
	NODE_ENV: 'test',
	DB_NAME: 'support_s1_proof_seed_unit',
	DB_HOST: '127.0.0.1',
	...overrides,
});
const snapshot = (
	rows: W1Fixture = structuredClone(W1_FIXTURE),
	lastValue = 16,
	isCalled = true,
): W1Snapshot => ({ rows, sequence: { lastValue, isCalled } });

describe('W1 canonical fixture', () => {
	it.each(W1_TABLES)('rejects a mutated %s count', (table) => {
		const changed = structuredClone(W1_FIXTURE);
		changed[table].pop();
		expect(() => validateW1Fixture(changed)).toThrow(/count/);
	});

	it('validates the exact approved manifest and timeline', () => {
		expect(() => validateW1Fixture(W1_FIXTURE)).not.toThrow();
		expect(W1_TABLES.map((table) => W1_FIXTURE[table].length)).toEqual([6, 7, 16, 44, 8, 98]);
		expect(Object.values(W1_ACTORS)).toHaveLength(8);
		expect(W1_SCENARIOS.map((scenario) => scenario.key)).toEqual(
			Array.from({ length: 16 }, (_, index) => 'T' + String(index + 1).padStart(2, '0')),
		);
	});

	it('pins the approved Department and T01–T16 matrix independently of the generator', () => {
		expect(W1_FIXTURE.departments.map((row) => [row.type, row.active])).toEqual([
			['todos', true],
			['todos', true],
			['backoffice', true],
			['cd', true],
			['backoffice', false],
			['cd', false],
		]);
		expect(
			W1_FIXTURE.departments.map(
				(department) =>
					W1_FIXTURE.department_allowed_users.filter(
						(row) => row.department_id === department.id,
					).length,
			),
		).toEqual([2, 1, 1, 1, 1, 1]);
		expect(
			W1_SCENARIOS.map((scenario) => [
				scenario.department,
				scenario.requester.replace('seed-', ''),
				scenario.priority,
				scenario.status,
				scenario.followUp,
				scenario.steps.map((step) => step.by[0] + ':' + step.status),
			]),
		).toEqual([
			['D01', 'backoffice-a', 'baixa', 'cancelado', true, ['r:cancelado']],
			['D01', 'backoffice-a', 'media', 'em_andamento', true, []],
			['D01', 'backoffice-a', 'alta', 'finalizado', true, ['a:resolvido', 'r:finalizado']],
			['D02', 'backoffice-a', 'urgente', 'resolvido', true, ['a:resolvido']],
			['D02', 'backoffice-b', 'baixa', 'cancelado', true, ['a:cancelado']],
			[
				'D02',
				'backoffice-b',
				'media',
				'em_andamento',
				true,
				['a:resolvido', 'r:pendente', 'a:em_andamento'],
			],
			['D03', 'backoffice-b', 'alta', 'finalizado', true, ['a:finalizado']],
			['D03', 'backoffice-b', 'urgente', 'resolvido', true, ['a:resolvido']],
			['D03', 'cd-a', 'baixa', 'cancelado', true, ['a:pendente', 'r:cancelado']],
			['D04', 'cd-a', 'media', 'em_andamento', true, ['a:pendente', 'a:em_andamento']],
			[
				'D04',
				'cd-a',
				'alta',
				'finalizado',
				true,
				['a:resolvido', 'r:pendente', 'a:em_andamento', 'a:resolvido', 'r:finalizado'],
			],
			['D04', 'cd-a', 'urgente', 'resolvido', true, ['a:pendente', 'a:resolvido']],
			['D05', 'cd-b', 'baixa', 'pendente', false, ['a:pendente']],
			['D05', 'cd-b', 'media', 'pendente', false, ['a:pendente']],
			['D06', 'cd-b', 'alta', 'pendente', false, ['a:pendente']],
			['D06', 'cd-b', 'urgente', 'pendente', false, ['a:resolvido', 'r:pendente']],
		]);
	});

	it('rejects a changed final status and invalid internal UUID before I/O', () => {
		const changed = structuredClone(W1_FIXTURE);
		changed.tickets[0].status = 'pendente';
		expect(() => validateW1Fixture(changed)).toThrow(/Ticket status/);
		const invalidId = structuredClone(W1_FIXTURE);
		invalidId.tickets[0].id = 'not-a-uuid';
		expect(() => validateW1Fixture(invalidId)).toThrow(/UUID v4/);
	});

	it('keeps persisted instants identical in UTC and São Paulo', () => {
		const root = path.resolve(__dirname, '../../..');
		const run = (timezone: string) =>
			spawnSync(
				process.execPath,
				[
					'-r',
					'ts-node/register',
					'-e',
					"process.stdout.write(JSON.stringify(require('./scripts/seed/support-w1.fixture').W1_FIXTURE))",
				],
				{ cwd: root, env: { ...process.env, TZ: timezone }, encoding: 'utf8' },
			);
		const utc = run('UTC');
		const saoPaulo = run('America/Sao_Paulo');
		expect(utc.status).toBe(0);
		expect(saoPaulo.status).toBe(0);
		expect(saoPaulo.stdout).toBe(utc.stdout);
	});
});

describe('W1 preconnection safety', () => {
	it.each([
		[{ SUPPORT_SEED_CONFIRM: '' }, /SUPPORT_SEED_CONFIRM/],
		[{ SUPPORT_SEED_CONFIRM: 'true' }, /SUPPORT_SEED_CONFIRM/],
		[{ NODE_ENV: '' }, /NODE_ENV/],
		[{ NODE_ENV: 'production' }, /NODE_ENV/],
		[{ DB_NAME: '' }, /DB_NAME/],
		[{ DB_NAME: 'support_ms' }, /DB_NAME/],
		[{ DB_NAME: 'postgres' }, /DB_NAME/],
		[{ DB_HOST: '' }, /DB_HOST/],
		[{ DB_HOST: 'remote.example.com' }, /DB_HOST/],
		[{ DB_HOST: 'localhost' }, /DB_HOST/],
	] as const)('refuses unsafe environment %j', (overrides, message) => {
		expect(() => validateW1Preconnection(environment(overrides), identity)).toThrow(message);
	});

	it('accepts only approved local, proof, and CI names with matching identity', () => {
		expect(
			validateW1Preconnection(
				environment({ NODE_ENV: 'development', DB_NAME: 'support_seed_local_unit' }),
				identity,
			).database,
		).toBe('support_seed_local_unit');
		expect(validateW1Preconnection(environment(), identity).database).toBe(
			'support_s1_proof_seed_unit',
		);
		expect(
			validateW1Preconnection(environment({ DB_NAME: 'support_s1_ci_seed_unit' }), identity)
				.database,
		).toBe('support_s1_ci_seed_unit');
		expect(() =>
			validateW1Preconnection(environment(), { ...identity, domainSlug: 'profile' }),
		).toThrow(/identity/);
		expect(() =>
			validateW1Preconnection(environment(), { ...identity, serviceSlug: 'profile-ms' }),
		).toThrow(/identity/);
		expect(() =>
			validateW1Preconnection(environment(), null as unknown as typeof identity),
		).toThrow(/identity/);
	});
});

describe('W1 state classifier and orchestration', () => {
	it('distinguishes EMPTY, EXACT_W1, and every divergent shape', () => {
		const empty: W1Fixture = {
			departments: [],
			department_allowed_users: [],
			tickets: [],
			ticket_messages: [],
			ticket_message_media: [],
			ticket_audit_logs: [],
		};
		expect(classifyW1Snapshot(snapshot(empty, 1, false), W1_FIXTURE)).toBe('EMPTY');
		expect(classifyW1Snapshot(snapshot(empty, 2, true), W1_FIXTURE)).toBe('DIVERGENT');
		expect(classifyW1Snapshot(snapshot(), W1_FIXTURE)).toBe('EXACT_W1');
		expect(
			classifyW1Snapshot(snapshot(structuredClone(W1_FIXTURE), 17, true), W1_FIXTURE),
		).toBe('DIVERGENT');
		const manual = structuredClone(W1_FIXTURE);
		manual.departments.push({
			...manual.departments[0],
			id: '00000001-0000-4000-8000-000000000999',
		});
		expect(classifyW1Snapshot(snapshot(manual), W1_FIXTURE)).toBe('DIVERGENT');
		const partial = structuredClone(W1_FIXTURE);
		partial.ticket_messages = [];
		expect(classifyW1Snapshot(snapshot(partial), W1_FIXTURE)).toBe('DIVERGENT');
		const drift = structuredClone(W1_FIXTURE);
		drift.tickets[0].subject = 'manual edit';
		expect(classifyW1Snapshot(snapshot(drift), W1_FIXTURE)).toBe('DIVERGENT');
		for (const [table, field, value] of [
			['ticket_messages', 'is_visible_to_requester', false],
			['ticket_audit_logs', 'new_status', 'cancelado'],
			['ticket_message_media', 'position', 9],
			['tickets', 'number', 99],
		] as const) {
			const changed = structuredClone(W1_FIXTURE);
			changed[table][0][field] = value;
			expect(classifyW1Snapshot(snapshot(changed), W1_FIXTURE)).toBe('DIVERGENT');
		}
	});

	it.each([
		[
			'duplicate UUID',
			(rows: W1Fixture): void => {
				rows.tickets[1].id = rows.tickets[0].id;
			},
		],
		[
			'unknown membership Department',
			(rows: W1Fixture): void => {
				rows.department_allowed_users[0].department_id = 'missing';
			},
		],
		[
			'invisible requester message',
			(rows: W1Fixture): void => {
				rows.ticket_messages[0].is_visible_to_requester = false;
			},
		],
		[
			'admin without membership',
			(rows: W1Fixture): void => {
				rows.ticket_messages[2].author_id = W1_ACTORS.outsider;
			},
		],
		[
			'duplicate media position',
			(rows: W1Fixture): void => {
				rows.ticket_message_media[3].position = 0;
			},
		],
		[
			'wrong audit breakdown',
			(rows: W1Fixture): void => {
				rows.ticket_audit_logs[1].action = 'alteracao_status';
			},
		],
		[
			'stale Ticket updatedAt',
			(rows: W1Fixture): void => {
				rows.tickets[0].updated_at = rows.tickets[0].created_at;
			},
		],
	] as const)('rejects %s before I/O', (_label, mutate) => {
		const changed = structuredClone(W1_FIXTURE);
		mutate(changed);
		expect(() => validateW1Fixture(changed)).toThrow();
	});

	it('calls the writer only for EMPTY', async () => {
		const writer = jest.fn(async () => undefined);
		await expect(applyW1State('EXACT_W1', writer)).resolves.toBe('ALREADY_SEEDED');
		await expect(applyW1State('DIVERGENT', writer)).rejects.toBeInstanceOf(W1SeedError);
		expect(writer).not.toHaveBeenCalled();
		await expect(applyW1State('EMPTY', writer)).resolves.toBe('CREATED');
		expect(writer).toHaveBeenCalledTimes(1);
	});
});
