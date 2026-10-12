import { Type } from 'class-transformer';
import {
	IsArray,
	IsDefined,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	ValidateNested,
} from 'class-validator';

import TicketOrigin from '../../../entities/enums/ticket-origin.enum';
import TicketPriority from '../../../entities/enums/ticket-priority.enum';

export class CreateInitialMessageRequestDTO {
	@IsString()
	@Matches(/\S/, { message: 'message must contain a non-whitespace character' })
	message!: string;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Matches(/\S/, { each: true, message: 'each mediaIds item must be non-blank' })
	mediaIds?: string[];
}

export default class CreateTicketRequestDTO {
	@IsString()
	@Matches(/\S/, { message: 'subject must contain a non-whitespace character' })
	subject!: string;

	@IsString()
	@Matches(/\S/, { message: 'requesterId must contain a non-whitespace character' })
	requesterId!: string;

	@IsUUID('4')
	departmentId!: string;

	@IsEnum(TicketPriority)
	priority!: TicketPriority;

	@IsEnum(TicketOrigin)
	origin!: TicketOrigin;

	@IsString()
	@Matches(/\S/, { message: 'originRefId must contain a non-whitespace character' })
	originRefId!: string;

	@IsDefined()
	@ValidateNested()
	@Type(() => CreateInitialMessageRequestDTO)
	message!: CreateInitialMessageRequestDTO;
}
