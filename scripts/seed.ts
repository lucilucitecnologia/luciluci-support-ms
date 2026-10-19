import fs from 'node:fs';
import path from 'node:path';

import { W1_FIXTURE } from './seed/support-w1.fixture';
import { validateW1Fixture } from './seed/support-w1.validate';
import { validateW1Preconnection, W1Identity, W1SeedError } from './seed/support-w1.safety';
import {
	applyW1State,
	assertW1SchemaReady,
	classifyW1Snapshot,
	readW1Snapshot,
	writeW1Fixture,
} from './seed/support-w1.database';

async function main(): Promise<void> {
	// All checks here run before importing or initializing AppDataSource.
	validateW1Fixture(W1_FIXTURE);
	let identity: W1Identity;
	try {
		identity = JSON.parse(
			fs.readFileSync(path.resolve(__dirname, '../service-identity.json'), 'utf8'),
		) as W1Identity;
	} catch {
		throw new W1SeedError(
			'SEED_W1_REFUSED',
			'Support service identity is unavailable or invalid',
		);
	}
	const { database } = validateW1Preconnection(process.env, identity);
	const { default: dataSource } =
		await import('../src/shared/infrastructure/database/data-source');
	let initialized = false;
	try {
		await dataSource.initialize();
		initialized = true;
		const runner = dataSource.createQueryRunner();
		await runner.connect();
		try {
			// READ COMMITTED refreshes the snapshot after a competing seeder releases the lock.
			await runner.startTransaction('READ COMMITTED');
			// Serialize concurrent W1 seed commands for this disposable database.
			await runner.query('SELECT pg_advisory_xact_lock(19383184)');
			await assertW1SchemaReady(runner, database);
			// Block ordinary writers while classifying and writing. Advisory locks alone
			// only coordinate other seed processes, not manual SQL or the HTTP service.
			await runner.query(
				'LOCK TABLE public.departments, public.department_allowed_users, public.tickets, public.ticket_messages, public.ticket_message_media, public.ticket_audit_logs IN SHARE ROW EXCLUSIVE MODE',
			);
			const initial = classifyW1Snapshot(await readW1Snapshot(runner, database), W1_FIXTURE);
			const outcome = await applyW1State(initial, async () => {
				await writeW1Fixture(runner, W1_FIXTURE);
				if (
					classifyW1Snapshot(await readW1Snapshot(runner, database), W1_FIXTURE) !==
					'EXACT_W1'
				) {
					throw new W1SeedError(
						'SEED_W1_FAILED',
						'W1 write verification failed; recreate the disposable database',
					);
				}
			});
			if (outcome === 'ALREADY_SEEDED') {
				await runner.commitTransaction();
				console.log('ALREADY_SEEDED');
				return;
			}
			await runner.commitTransaction();
		} catch (error) {
			if (runner.isTransactionActive) await runner.rollbackTransaction();
			throw error;
		} finally {
			await runner.release();
		}
		const verification = dataSource.createQueryRunner();
		try {
			await verification.connect();
			if (
				classifyW1Snapshot(await readW1Snapshot(verification, database), W1_FIXTURE) !==
				'EXACT_W1'
			) {
				throw new W1SeedError('SEED_W1_FAILED', 'W1 post-commit verification failed');
			}
		} finally {
			await verification.release();
		}
		console.log(
			'SEED_W1_CREATED departments=6 memberships=7 tickets=16 messages=44 media=8 audits=98',
		);
	} finally {
		if (initialized) await dataSource.destroy();
	}
}

main().catch((error: unknown) => {
	const marker = error instanceof W1SeedError ? error.marker : 'SEED_W1_FAILED';
	let message = error instanceof Error ? error.message : String(error);
	for (const secret of [process.env.DB_PASSWORD, process.env.DATABASE_URL]) {
		if (secret) message = message.replaceAll(secret, '[REDACTED]');
	}
	console.error(marker + ': ' + message);
	process.exitCode = 1;
});
