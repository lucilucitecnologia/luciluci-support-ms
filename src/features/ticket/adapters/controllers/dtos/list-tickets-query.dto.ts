import UnprocessableEntityError from '../../../../../shared/kernel/exceptions/unprocessable-entity.error';
import TicketAdminStatus from '../../../entities/enums/ticket-admin-status.enum';
import TicketOrigin from '../../../entities/enums/ticket-origin.enum';
import TicketPriority from '../../../entities/enums/ticket-priority.enum';
import { ListTicketsFilters } from '../../../use-cases/repositories/ilist-tickets.repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CIVIL_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const SHARED_KEYS = new Set([
	'number',
	'startDate',
	'endDate',
	'status',
	'origin',
	'originRefId',
	'departmentId',
	'priority',
	'page',
	'size',
]);

function invalid(field: string, code: string): never {
	throw new UnprocessableEntityError('validation_error', [
		{ field, code, message: `Invalid ${field} query parameter.` },
	]);
}

function positiveInteger(field: string, value: string | undefined, fallback?: number): number {
	if (value === undefined && fallback !== undefined) return fallback;
	if (!value || !POSITIVE_INTEGER.test(value)) invalid(field, 'isInt');
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) invalid(field, 'isInt');
	return parsed;
}

function civilDay(field: string, value: string | undefined): Date | undefined {
	if (value === undefined) return undefined;
	const match = CIVIL_DATE.exec(value);
	if (!match) invalid(field, 'dateFormat');
	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	if (year < 1) invalid(field, 'calendarDate');
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	date.setUTCHours(0, 0, 0, 0);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		invalid(field, 'calendarDate');
	}
	return date;
}

function enumValue<T extends string>(
	field: string,
	value: string | undefined,
	values: T[],
): T | undefined {
	if (value === undefined) return undefined;
	if (!values.includes(value as T)) invalid(field, 'isEnum');
	return value as T;
}

export function parseListTicketsQuery(
	originalUrl: string,
	allowRequesterId: boolean,
): ListTicketsFilters {
	const params = new URL(originalUrl, 'http://support.local').searchParams;
	const values = new Map<string, string>();
	for (const [key, value] of params) {
		if (
			(!SHARED_KEYS.has(key) && !(allowRequesterId && key === 'requesterId')) ||
			values.has(key)
		) {
			invalid(key, values.has(key) ? 'repeated' : 'unknown');
		}
		if (!value.trim()) invalid(key, 'notEmpty');
		values.set(key, value);
	}

	const page = positiveInteger('page', values.get('page'), 1);
	const size = positiveInteger('size', values.get('size'), 20);
	if (size > 100) invalid('size', 'max');
	const startInclusive = civilDay('startDate', values.get('startDate'));
	const endDay = civilDay('endDate', values.get('endDate'));
	if (startInclusive && endDay && startInclusive > endDay) invalid('startDate', 'dateRange');
	const endExclusive = endDay ? new Date(endDay) : undefined;
	if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
	const departmentId = values.get('departmentId');
	if (departmentId && !UUID_V4.test(departmentId)) invalid('departmentId', 'isUuid');

	return {
		page,
		size,
		number:
			values.get('number') === undefined
				? undefined
				: positiveInteger('number', values.get('number')),
		startInclusive,
		endExclusive,
		status: enumValue('status', values.get('status'), Object.values(TicketAdminStatus)),
		origin: enumValue('origin', values.get('origin'), Object.values(TicketOrigin)),
		originRefId: values.get('originRefId'),
		departmentId,
		priority: enumValue('priority', values.get('priority'), Object.values(TicketPriority)),
		requesterId: values.get('requesterId'),
	};
}
