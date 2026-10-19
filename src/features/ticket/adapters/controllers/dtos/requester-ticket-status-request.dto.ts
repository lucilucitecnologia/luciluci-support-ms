import { IsArray, IsString, Matches, ValidateIf } from 'class-validator';

export default class RequesterTicketStatusRequestDTO {
	@ValidateIf((_object, value) => value !== undefined)
	@IsString()
	@Matches(/\S/, { message: 'message must contain a non-whitespace character' })
	message?: string;

	@ValidateIf((_object, value) => value !== undefined)
	@IsArray()
	@IsString({ each: true })
	@Matches(/\S/, { each: true, message: 'each mediaIds item must be non-blank' })
	mediaIds?: string[];
}
