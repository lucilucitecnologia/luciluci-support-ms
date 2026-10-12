import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTicketOriginRefId1768020000000 implements MigrationInterface {
	name = 'AddTicketOriginRefId1768020000000';

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.addColumn(
			'tickets',
			new TableColumn({ name: 'origin_ref_id', type: 'varchar', isNullable: false }),
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropColumn('tickets', 'origin_ref_id');
	}
}
