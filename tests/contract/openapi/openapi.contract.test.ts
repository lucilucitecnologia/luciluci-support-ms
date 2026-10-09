import request from 'supertest';
import { OpenAPIV3 } from 'openapi-types';

import swaggerSpec from '../../../src/shared/openapi/swagger';
import {
	buildTestApp,
	destroyTestDataSource,
	initializeTestDataSource,
} from '../../helpers/test-helpers';

describe('Contract: Support bootstrap OpenAPI', () => {
	beforeAll(async () => {
		await initializeTestDataSource();
	});

	afterAll(async () => {
		await destroyTestDataSource();
	});

	it('documents operational paths and RF01-RF13', () => {
		const spec = swaggerSpec as OpenAPIV3.Document;

		expect(Object.keys(spec.paths ?? {}).sort()).toEqual([
			'/api-docs',
			'/api-docs-json',
			'/api/support/departments',
			'/api/support/departments/{departmentId}',
			'/api/support/tickets',
			'/api/support/tickets/admin/{adminId}',
			'/api/support/tickets/history',
			'/api/support/tickets/requester/{requesterId}',
			'/api/support/tickets/{ticketId}',
			'/api/support/tickets/{ticketId}/messages',
			'/api/support/tickets/{ticketId}/messages/{messageId}/visibility',
			'/api/support/tickets/{ticketId}/resolve',
			'/health',
			'/metrics',
		]);
		expect(spec.paths?.['/profiles']).toBeUndefined();
		const listOperation = spec.paths?.['/api/support/departments']?.get;
		expect(listOperation?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			expect.objectContaining({ in: 'query', name: 'type', required: false }),
			expect.objectContaining({
				in: 'query',
				name: 'page',
				schema: expect.objectContaining({ type: 'integer', minimum: 1, default: 1 }),
			}),
			expect.objectContaining({
				in: 'query',
				name: 'size',
				schema: expect.objectContaining({
					type: 'integer',
					minimum: 1,
					maximum: 100,
					default: 20,
				}),
			}),
		]);
		expect(listOperation?.responses).toEqual(
			expect.objectContaining({
				'200': expect.any(Object),
				'400': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		expect(spec.paths?.['/api/support/departments']?.post?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
		]);
		expect(spec.paths?.['/api/support/departments']?.post?.responses).toEqual(
			expect.objectContaining({
				'201': expect.any(Object),
				'400': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		const updatePath = spec.paths?.['/api/support/departments/{departmentId}'];
		expect(updatePath?.patch?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			expect.objectContaining({ in: 'path', name: 'departmentId', required: true }),
		]);
		expect(updatePath?.patch?.responses).toEqual(
			expect.objectContaining({
				'200': expect.any(Object),
				'400': expect.any(Object),
				'404': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		expect(updatePath?.delete?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			expect.objectContaining({
				in: 'path',
				name: 'departmentId',
				required: true,
				schema: { type: 'string', format: 'uuid' },
			}),
		]);
		expect(updatePath?.delete?.responses).toEqual(
			expect.objectContaining({
				'204': expect.not.objectContaining({ content: expect.anything() }),
				'400': expect.any(Object),
				'404': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		expect(spec.components?.schemas?.UpdateDepartmentRequest).toEqual(
			expect.objectContaining({
				additionalProperties: false,
				minProperties: 1,
			}),
		);
		const departmentSchema = spec.components?.schemas?.Department as OpenAPIV3.SchemaObject;
		expect(departmentSchema.properties?.active).toEqual({
			type: 'boolean',
		});
		const paginationSchema = spec.components?.schemas?.Pagination as OpenAPIV3.SchemaObject;
		expect(paginationSchema.required).toEqual(['page', 'size', 'total', 'totalPages']);
		expect(paginationSchema.properties?.size).toEqual({
			type: 'integer',
			minimum: 1,
			maximum: 100,
		});
		expect(paginationSchema.properties).not.toHaveProperty('limit');
		const listSchema = spec.components?.schemas
			?.DepartmentListResponse as OpenAPIV3.SchemaObject;
		expect(listSchema.required).toEqual(['data', 'pagination']);
		const createTicket = spec.paths?.['/api/support/tickets']?.post;
		expect(createTicket?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
		]);
		expect(createTicket?.requestBody).toEqual(
			expect.objectContaining({
				required: true,
				content: {
					'application/json': {
						schema: { $ref: '#/components/schemas/CreateTicketRequest' },
					},
				},
			}),
		);
		expect(createTicket?.responses).toEqual(
			expect.objectContaining({
				'201': expect.any(Object),
				'400': expect.any(Object),
				'404': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		expect(createTicket?.responses?.['201']).toEqual(
			expect.objectContaining({
				content: {
					'application/json': { schema: { $ref: '#/components/schemas/CreatedTicket' } },
				},
			}),
		);
		const createTicketSchema = spec.components?.schemas
			?.CreateTicketRequest as OpenAPIV3.SchemaObject;
		expect(createTicketSchema.additionalProperties).toBe(false);
		expect(createTicketSchema.required).toEqual([
			'subject',
			'requesterId',
			'departmentId',
			'priority',
			'origin',
			'message',
		]);
		expect(createTicketSchema.properties?.priority).toEqual({
			$ref: '#/components/schemas/TicketPriority',
		});
		expect(spec.components?.schemas?.TicketPriority).toEqual({
			type: 'string',
			enum: ['baixa', 'media', 'alta', 'urgente'],
		});
		expect(spec.components?.schemas?.TicketOrigin).toEqual({
			type: 'string',
			enum: ['backoffice', 'cd'],
		});
		const initialMessageSchema = spec.components?.schemas
			?.CreateInitialTicketMessageRequest as OpenAPIV3.SchemaObject;
		expect(initialMessageSchema.required).toEqual(['message']);
		expect(initialMessageSchema.properties).toHaveProperty('mediaIds');
		expect(initialMessageSchema.required).not.toContain('mediaIds');
		const ticketSchema = spec.components?.schemas?.Ticket as OpenAPIV3.SchemaObject;
		expect(ticketSchema.additionalProperties).toBe(false);
		expect(ticketSchema.properties).not.toHaveProperty('message');
		expect(ticketSchema.properties).not.toHaveProperty('audit');
		const updateTicket = spec.paths?.['/api/support/tickets/{ticketId}']?.patch;
		const getTicket = spec.paths?.['/api/support/tickets/{ticketId}']?.get;
		expect(getTicket?.requestBody).toBeUndefined();
		expect(getTicket?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
		]);
		expect(Object.keys(getTicket?.responses ?? {}).sort()).toEqual([
			'200',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		expect(getTicket?.responses?.['200']).toEqual(
			expect.objectContaining({
				content: {
					'application/json': { schema: { $ref: '#/components/schemas/TicketDetail' } },
				},
			}),
		);
		expect(updateTicket?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
		]);
		expect(updateTicket?.responses).toEqual(
			expect.objectContaining({
				'200': expect.any(Object),
				'400': expect.any(Object),
				'403': expect.any(Object),
				'404': expect.any(Object),
				'422': expect.any(Object),
				'500': expect.any(Object),
			}),
		);
		const resolveTicket = spec.paths?.['/api/support/tickets/{ticketId}/resolve']?.post;
		expect(resolveTicket?.requestBody).toBeUndefined();
		expect(resolveTicket?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
		]);
		expect(Object.keys(resolveTicket?.responses ?? {}).sort()).toEqual([
			'200',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		expect(spec.components?.schemas?.UpdateTicketRequest).toEqual(
			expect.objectContaining({
				additionalProperties: false,
				minProperties: 1,
			}),
		);
		expect(ticketSchema.properties?.adminStatus).toEqual({
			$ref: '#/components/schemas/TicketAdminStatus',
		});
		const ticketDetailSchema = spec.components?.schemas?.TicketDetail as OpenAPIV3.SchemaObject;
		expect(ticketDetailSchema.additionalProperties).toBe(false);
		expect(ticketDetailSchema.required).toHaveLength(11);
		expect(ticketDetailSchema.properties?.requesterStatus).toEqual({
			type: 'string',
			enum: ['nao_resolvido', 'resolvido'],
		});
		for (const [path, pathId, includesRequesterFilter] of [
			['/api/support/tickets/requester/{requesterId}', 'requesterId', false],
			['/api/support/tickets/admin/{adminId}', 'adminId', true],
		] as const) {
			const operation = spec.paths?.[path]?.get;
			const parameters = operation?.parameters as OpenAPIV3.ParameterObject[];
			expect(parameters).toEqual(
				expect.arrayContaining([
					{ $ref: '#/components/parameters/CorrelationIdHeader' },
					{ $ref: '#/components/parameters/PerformedByHeader' },
					{ $ref: '#/components/parameters/PerformedByTypeHeader' },
					expect.objectContaining({ in: 'path', name: pathId, required: true }),
				]),
			);
			expect(
				parameters
					.filter((parameter) => parameter.in === 'query')
					.map((parameter) => parameter.name)
					.sort(),
			).toEqual(
				[
					'number',
					'startDate',
					'endDate',
					'status',
					'origin',
					'departmentId',
					'priority',
					'page',
					'size',
					...(includesRequesterFilter ? ['requesterId'] : []),
				].sort(),
			);
			expect(operation?.responses).toEqual(
				expect.objectContaining({
					'200': expect.any(Object),
					'400': expect.any(Object),
					'403': expect.any(Object),
					'422': expect.any(Object),
					'500': expect.any(Object),
				}),
			);
			expect(operation?.responses?.['200']).toEqual(
				expect.objectContaining({
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/TicketListResponse' },
						},
					},
				}),
			);
		}
		const item = spec.components?.schemas?.TicketListItem as OpenAPIV3.SchemaObject;
		const createMessage = spec.paths?.['/api/support/tickets/{ticketId}/messages']?.post;
		expect(createMessage?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
		]);
		expect(createMessage?.requestBody).toEqual(expect.objectContaining({ required: true }));
		expect(Object.keys(createMessage?.responses ?? {}).sort()).toEqual([
			'201',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		const messageRequest = spec.components?.schemas
			?.CreateTicketMessageRequest as OpenAPIV3.SchemaObject;
		expect(messageRequest.additionalProperties).toBe(false);
		expect(messageRequest.required).toEqual([
			'message',
			'type',
			'authorId',
			'isVisibleToRequester',
		]);
		expect(Object.keys(messageRequest.properties ?? {})).toEqual([
			'message',
			'type',
			'authorId',
			'mediaIds',
			'isVisibleToRequester',
		]);
		const messageResponse = spec.components?.schemas?.TicketMessage as OpenAPIV3.SchemaObject;
		expect(messageResponse.required).toHaveLength(8);
		const listMessages = spec.paths?.['/api/support/tickets/{ticketId}/messages']?.get;
		expect(listMessages?.requestBody).toBeUndefined();
		expect(listMessages?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
			expect.objectContaining({ in: 'query', name: 'page', required: false }),
			expect.objectContaining({ in: 'query', name: 'size', required: false }),
			expect.objectContaining({ in: 'query', name: 'isVisibleToRequester', required: false }),
		]);
		expect(
			(listMessages?.parameters as OpenAPIV3.ParameterObject[])
				.filter((parameter) => parameter.in === 'query')
				.map((parameter) => parameter.name),
		).toEqual(['page', 'size', 'isVisibleToRequester']);
		expect(Object.keys(listMessages?.responses ?? {}).sort()).toEqual([
			'200',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		expect(listMessages?.responses?.['200']).toEqual(
			expect.objectContaining({
				content: {
					'application/json': {
						schema: { $ref: '#/components/schemas/TicketMessageListResponse' },
					},
				},
			}),
		);
		const listMessageResponse = spec.components?.schemas
			?.TicketMessageListResponse as OpenAPIV3.SchemaObject;
		expect(listMessageResponse.required).toEqual(['data', 'pagination']);
		expect(listMessageResponse.additionalProperties).toBe(false);
		const history = spec.paths?.['/api/support/tickets/history']?.get;
		expect(history?.requestBody).toBeUndefined();
		expect(history?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({
				in: 'query',
				name: 'ticketId',
				required: false,
				schema: { type: 'string', format: 'uuid' },
			}),
			expect.objectContaining({
				in: 'query',
				name: 'page',
				required: false,
				schema: { type: 'integer', minimum: 1, default: 1 },
			}),
			expect.objectContaining({
				in: 'query',
				name: 'size',
				required: false,
				schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
			}),
		]);
		expect(Object.keys(history?.responses ?? {}).sort()).toEqual([
			'200',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		const historyItem = spec.components?.schemas?.TicketHistoryItem as OpenAPIV3.SchemaObject;
		expect(historyItem.additionalProperties).toBe(false);
		expect(historyItem.required).toEqual([
			'ticketId',
			'number',
			'datetime',
			'authorId',
			'origin',
			'action',
			'statusType',
			'newStatus',
		]);
		expect(Object.keys(historyItem.properties ?? {})).toEqual(historyItem.required);
		expect(spec.components?.schemas?.TicketHistoryListResponse).toEqual(
			expect.objectContaining({
				required: ['data', 'pagination'],
				additionalProperties: false,
			}),
		);
		const businessOperations = Object.entries(spec.paths ?? {}).flatMap(([path, item]) =>
			path.startsWith('/api/support/')
				? ['get', 'post', 'patch', 'delete'].filter(
						(method) => item?.[method as keyof typeof item],
					)
				: [],
		);
		expect(businessOperations).toHaveLength(15);
		const visibility =
			spec.paths?.['/api/support/tickets/{ticketId}/messages/{messageId}/visibility']?.patch;
		expect(visibility?.parameters).toEqual([
			{ $ref: '#/components/parameters/CorrelationIdHeader' },
			{ $ref: '#/components/parameters/PerformedByHeader' },
			{ $ref: '#/components/parameters/PerformedByTypeHeader' },
			expect.objectContaining({ in: 'path', name: 'ticketId', required: true }),
			expect.objectContaining({ in: 'path', name: 'messageId', required: true }),
		]);
		expect(visibility?.requestBody).toEqual(expect.objectContaining({ required: true }));
		expect(Object.keys(visibility?.responses ?? {}).sort()).toEqual([
			'200',
			'400',
			'403',
			'404',
			'422',
			'500',
		]);
		const visibilityRequest = spec.components?.schemas
			?.UpdateMessageVisibilityRequest as OpenAPIV3.SchemaObject;
		expect(visibilityRequest.additionalProperties).toBe(false);
		expect(visibilityRequest.required).toEqual(['isVisibleToRequester']);
		expect(visibilityRequest.properties).toEqual({ isVisibleToRequester: { type: 'boolean' } });
		expect(visibility?.responses?.['200']).toEqual(
			expect.objectContaining({
				content: {
					'application/json': { schema: { $ref: '#/components/schemas/TicketMessage' } },
				},
			}),
		);
		expect(item.additionalProperties).toBe(false);
		expect(item.required).toEqual([
			'id',
			'number',
			'subject',
			'createdAt',
			'departmentId',
			'requesterId',
			'origin',
			'priority',
			'status',
		]);
		expect(Object.keys(item.properties ?? {})).toEqual(item.required);
		expect(spec.components?.schemas?.TicketListResponse).toEqual(
			expect.objectContaining({
				additionalProperties: false,
				required: ['data', 'pagination'],
			}),
		);
		expect(spec.info.title).toBe('support-ms');
	});

	it('serves the runtime OpenAPI document without requiring correlation', async () => {
		const response = await request(buildTestApp()).get('/api-docs-json');

		expect(response.status).toBe(200);
		expect(response.headers['x-correlation-id']).toEqual(expect.any(String));
		expect(response.body.paths).toEqual((swaggerSpec as OpenAPIV3.Document).paths);
	});
});
