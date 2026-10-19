import { MigrationInterface, QueryRunner } from 'typeorm';

const STATUSES = `'pendente', 'em_andamento', 'resolvido', 'finalizado', 'cancelado'`;

export class UnifyTicketStatus1768030000000 implements MigrationInterface {
	name = 'UnifyTicketStatus1768030000000';

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "tickets" ADD COLUMN "status" varchar`);
		// Resolved by the requester while the admin status was still open means "resolvido".
		await queryRunner.query(`
			UPDATE "tickets" SET "status" = CASE
				WHEN "requester_status" = 'resolvido' AND "admin_status" IN ('pendente', 'em_andamento')
					THEN 'resolvido'
				ELSE "admin_status"
			END
		`);
		await queryRunner.query(`ALTER TABLE "tickets" ALTER COLUMN "status" SET NOT NULL`);
		await queryRunner.query(`
			ALTER TABLE "tickets"
				DROP CONSTRAINT "CHK_tickets_admin_status",
				DROP CONSTRAINT "CHK_tickets_requester_status",
				DROP COLUMN "admin_status",
				DROP COLUMN "requester_status",
				ADD CONSTRAINT "CHK_tickets_status" CHECK ("status" IN (${STATUSES}))
		`);

		await queryRunner.query(`
			ALTER TABLE "ticket_audit_logs"
				DROP CONSTRAINT "CHK_ticket_audit_logs_status_fields",
				DROP COLUMN "status_type",
				ADD CONSTRAINT "CHK_ticket_audit_logs_status_fields" CHECK (
					("action" = 'alteracao_status' AND "new_status" IN (${STATUSES}))
					OR ("action" <> 'alteracao_status' AND "new_status" IS NULL)
				)
		`);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "ticket_audit_logs"
				DROP CONSTRAINT "CHK_ticket_audit_logs_status_fields",
				ADD COLUMN "status_type" varchar
		`);
		await queryRunner.query(
			`UPDATE "ticket_audit_logs" SET "status_type" = 'admin' WHERE "action" = 'alteracao_status'`,
		);
		await queryRunner.query(`
			ALTER TABLE "ticket_audit_logs" ADD CONSTRAINT "CHK_ticket_audit_logs_status_fields" CHECK (
				("action" = 'alteracao_status' AND "status_type" IN ('admin', 'requester') AND "new_status" IS NOT NULL)
				OR ("action" <> 'alteracao_status' AND "status_type" IS NULL AND "new_status" IS NULL)
			)
		`);

		await queryRunner.query(`
			ALTER TABLE "tickets"
				ADD COLUMN "admin_status" varchar,
				ADD COLUMN "requester_status" varchar
		`);
		await queryRunner.query(`
			UPDATE "tickets" SET
				"admin_status" = "status",
				"requester_status" = CASE
					WHEN "status" IN ('resolvido', 'finalizado') THEN 'resolvido'
					ELSE 'nao_resolvido'
				END
		`);
		await queryRunner.query(`
			ALTER TABLE "tickets"
				ALTER COLUMN "admin_status" SET NOT NULL,
				ALTER COLUMN "requester_status" SET NOT NULL,
				DROP CONSTRAINT "CHK_tickets_status",
				DROP COLUMN "status",
				ADD CONSTRAINT "CHK_tickets_admin_status" CHECK ("admin_status" IN (${STATUSES})),
				ADD CONSTRAINT "CHK_tickets_requester_status" CHECK ("requester_status" IN ('nao_resolvido', 'resolvido'))
		`);
	}
}
