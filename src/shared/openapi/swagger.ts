import swaggerJSDoc from 'swagger-jsdoc';

const swaggerOptions: swaggerJSDoc.Options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'support-ms',
			version: '1.0.0',
			description:
				'Support OpenAPI contract. RF01–RF13 implement Departments, Tickets, messages, and scoped Ticket history.',
		},
		components: {
			parameters: {
				PerformedByHeader: {
					in: 'header',
					name: 'X-Performed-By',
					required: true,
					schema: { type: 'string', pattern: '.*\\S.*' },
				},
				PerformedByTypeHeader: {
					in: 'header',
					name: 'X-Performed-By-Type',
					required: true,
					schema: { type: 'string', enum: ['admin', 'backoffice', 'cd'] },
				},
				CorrelationIdHeader: {
					in: 'header',
					name: 'X-Correlation-ID',
					required: true,
					schema: { type: 'string', format: 'uuid' },
				},
			},
			schemas: {
				DepartmentType: { type: 'string', enum: ['todos', 'backoffice', 'cd'] },
				CreateDepartmentRequest: {
					type: 'object',
					additionalProperties: false,
					required: ['name', 'type'],
					properties: {
						name: { type: 'string', pattern: '.*\\S.*' },
						allowedUserIds: {
							type: 'array',
							items: { type: 'string', pattern: '.*\\S.*' },
						},
						type: { $ref: '#/components/schemas/DepartmentType' },
					},
				},
				UpdateDepartmentRequest: {
					type: 'object',
					additionalProperties: false,
					minProperties: 1,
					properties: {
						name: { type: 'string', pattern: '.*\\S.*' },
						allowedUserIds: {
							type: 'array',
							items: { type: 'string', pattern: '.*\\S.*' },
						},
						type: { $ref: '#/components/schemas/DepartmentType' },
					},
				},
				Department: {
					type: 'object',
					required: [
						'id',
						'name',
						'allowedUserIds',
						'type',
						'active',
						'createdAt',
						'updatedAt',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						name: { type: 'string' },
						allowedUserIds: { type: 'array', items: { type: 'string' } },
						type: { $ref: '#/components/schemas/DepartmentType' },
						active: { type: 'boolean' },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				Pagination: {
					type: 'object',
					additionalProperties: false,
					required: ['page', 'size', 'total', 'totalPages'],
					properties: {
						page: { type: 'integer', minimum: 1 },
						size: { type: 'integer', minimum: 1, maximum: 100 },
						total: { type: 'integer', minimum: 0 },
						totalPages: { type: 'integer', minimum: 0 },
					},
				},
				DepartmentListResponse: {
					type: 'object',
					additionalProperties: false,
					required: ['data', 'pagination'],
					properties: {
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/Department' },
						},
						pagination: { $ref: '#/components/schemas/Pagination' },
					},
				},
				TicketPriority: {
					type: 'string',
					enum: ['baixa', 'media', 'alta', 'urgente'],
				},
				TicketOrigin: { type: 'string', enum: ['backoffice', 'cd'] },
				TicketMessageType: { type: 'string', enum: ['admin', 'backoffice', 'cd'] },
				CreateTicketMessageRequest: {
					type: 'object',
					additionalProperties: false,
					required: ['message', 'type', 'authorId', 'isVisibleToRequester'],
					properties: {
						message: { type: 'string', pattern: '.*\\S.*' },
						type: { $ref: '#/components/schemas/TicketMessageType' },
						authorId: { type: 'string', pattern: '.*\\S.*' },
						mediaIds: { type: 'array', items: { type: 'string', pattern: '.*\\S.*' } },
						isVisibleToRequester: { type: 'boolean' },
					},
				},
				UpdateMessageVisibilityRequest: {
					type: 'object',
					additionalProperties: false,
					required: ['isVisibleToRequester'],
					properties: { isVisibleToRequester: { type: 'boolean' } },
				},
				TicketMessage: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'ticketId',
						'message',
						'type',
						'authorId',
						'mediaIds',
						'isVisibleToRequester',
						'createdAt',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						ticketId: { type: 'string', format: 'uuid' },
						message: { type: 'string' },
						type: { $ref: '#/components/schemas/TicketMessageType' },
						authorId: { type: 'string' },
						mediaIds: { type: 'array', items: { type: 'string' } },
						isVisibleToRequester: { type: 'boolean' },
						createdAt: { type: 'string', format: 'date-time' },
					},
				},
				TicketMessageListResponse: {
					type: 'object',
					additionalProperties: false,
					required: ['data', 'pagination'],
					properties: {
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/TicketMessage' },
						},
						pagination: { $ref: '#/components/schemas/Pagination' },
					},
				},
				TicketHistoryItem: {
					type: 'object',
					additionalProperties: false,
					required: [
						'ticketId',
						'number',
						'datetime',
						'authorId',
						'origin',
						'action',
						'statusType',
						'newStatus',
					],
					properties: {
						ticketId: { type: 'string', format: 'uuid' },
						number: { type: 'integer', minimum: 1 },
						datetime: { type: 'string', format: 'date-time' },
						authorId: { type: 'string' },
						origin: { type: 'string', enum: ['admin', 'backoffice', 'cd'] },
						action: {
							type: 'string',
							enum: ['criacao_ticket', 'nova_mensagem', 'alteracao_status'],
						},
						statusType: { type: 'string', nullable: true },
						newStatus: { type: 'string', nullable: true },
					},
				},
				TicketHistoryListResponse: {
					type: 'object',
					additionalProperties: false,
					required: ['data', 'pagination'],
					properties: {
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/TicketHistoryItem' },
						},
						pagination: { $ref: '#/components/schemas/Pagination' },
					},
				},
				CreateInitialTicketMessageRequest: {
					type: 'object',
					additionalProperties: false,
					required: ['message'],
					properties: {
						message: { type: 'string', pattern: '.*\\S.*' },
						mediaIds: {
							type: 'array',
							items: { type: 'string', pattern: '.*\\S.*' },
						},
					},
				},
				CreateTicketRequest: {
					type: 'object',
					additionalProperties: false,
					required: [
						'subject',
						'requesterId',
						'departmentId',
						'priority',
						'origin',
						'message',
					],
					properties: {
						subject: { type: 'string', pattern: '.*\\S.*' },
						requesterId: { type: 'string', pattern: '.*\\S.*' },
						departmentId: { type: 'string', format: 'uuid' },
						priority: { $ref: '#/components/schemas/TicketPriority' },
						origin: { $ref: '#/components/schemas/TicketOrigin' },
						message: {
							$ref: '#/components/schemas/CreateInitialTicketMessageRequest',
						},
					},
				},
				TicketAdminStatus: {
					type: 'string',
					enum: ['pendente', 'cancelado', 'em_andamento', 'finalizado', 'resolvido'],
				},
				UpdateTicketRequest: {
					type: 'object',
					additionalProperties: false,
					minProperties: 1,
					properties: {
						priority: { $ref: '#/components/schemas/TicketPriority' },
						departmentId: { type: 'string', format: 'uuid' },
						adminStatus: { $ref: '#/components/schemas/TicketAdminStatus' },
					},
				},
				CreatedTicket: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'number',
						'subject',
						'requesterId',
						'departmentId',
						'priority',
						'origin',
						'adminStatus',
						'requesterStatus',
						'createdAt',
						'updatedAt',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						number: { type: 'integer', minimum: 1 },
						subject: { type: 'string' },
						requesterId: { type: 'string' },
						departmentId: { type: 'string', format: 'uuid' },
						priority: { $ref: '#/components/schemas/TicketPriority' },
						origin: { $ref: '#/components/schemas/TicketOrigin' },
						adminStatus: { type: 'string', enum: ['pendente'] },
						requesterStatus: { type: 'string', enum: ['nao_resolvido'] },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				Ticket: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'number',
						'subject',
						'requesterId',
						'departmentId',
						'priority',
						'origin',
						'adminStatus',
						'requesterStatus',
						'createdAt',
						'updatedAt',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						number: { type: 'integer', minimum: 1 },
						subject: { type: 'string' },
						requesterId: { type: 'string' },
						departmentId: { type: 'string', format: 'uuid' },
						priority: { $ref: '#/components/schemas/TicketPriority' },
						origin: { $ref: '#/components/schemas/TicketOrigin' },
						adminStatus: { $ref: '#/components/schemas/TicketAdminStatus' },
						requesterStatus: { type: 'string', enum: ['nao_resolvido'] },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				TicketDetail: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'number',
						'subject',
						'requesterId',
						'departmentId',
						'priority',
						'origin',
						'adminStatus',
						'requesterStatus',
						'createdAt',
						'updatedAt',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						number: { type: 'integer', minimum: 1 },
						subject: { type: 'string' },
						requesterId: { type: 'string' },
						departmentId: { type: 'string', format: 'uuid' },
						priority: { $ref: '#/components/schemas/TicketPriority' },
						origin: { $ref: '#/components/schemas/TicketOrigin' },
						adminStatus: { $ref: '#/components/schemas/TicketAdminStatus' },
						requesterStatus: {
							type: 'string',
							enum: ['nao_resolvido', 'resolvido'],
						},
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
					},
				},
				TicketListItem: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'number',
						'subject',
						'createdAt',
						'departmentId',
						'requesterId',
						'origin',
						'priority',
						'status',
					],
					properties: {
						id: { type: 'string', format: 'uuid' },
						number: { type: 'integer', minimum: 1 },
						subject: { type: 'string' },
						createdAt: { type: 'string', format: 'date-time' },
						departmentId: { type: 'string', format: 'uuid' },
						requesterId: { type: 'string' },
						origin: { $ref: '#/components/schemas/TicketOrigin' },
						priority: { $ref: '#/components/schemas/TicketPriority' },
						status: { $ref: '#/components/schemas/TicketAdminStatus' },
					},
				},
				TicketListResponse: {
					type: 'object',
					additionalProperties: false,
					required: ['data', 'pagination'],
					properties: {
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/TicketListItem' },
						},
						pagination: { $ref: '#/components/schemas/Pagination' },
					},
				},
				ErrorResponse: {
					type: 'object',
					required: ['status_code', 'message'],
					properties: {
						status_code: { type: 'integer' },
						message: { type: 'string' },
						errors: { type: 'array', items: { type: 'object' } },
					},
				},
			},
		},
		paths: {
			'/api/support/tickets/history': {
				get: {
					summary: 'List scoped Ticket audit history',
					description:
						'RF13. Current Department membership or requester ownership scopes AuditLog before count and pagination. Requesters see own message audits only; admin message audits stay hidden. Ordered by datetime DESC, id DESC in a read-only REPEATABLE READ snapshot.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'query',
							name: 'ticketId',
							required: false,
							schema: { type: 'string', format: 'uuid' },
						},
						{
							in: 'query',
							name: 'page',
							required: false,
							schema: { type: 'integer', minimum: 1, default: 1 },
						},
						{
							in: 'query',
							name: 'size',
							required: false,
							schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
						},
					],
					responses: {
						'200': {
							description: 'Scoped audit history.',
							content: {
								'application/json': {
									schema: {
										$ref: '#/components/schemas/TicketHistoryListResponse',
									},
								},
							},
						},
						'400': {
							description: 'Missing or invalid actor or correlation headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Ticket access denied.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid or repeated query, or present body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets': {
				post: {
					summary: 'Create a ticket with its initial message',
					description:
						'Atomically creates one Ticket, one initial TicketMessage, zero or more ordered media references, and exactly one criacao_ticket audit. The department row is locked during the transaction; inactive departments return department_inactive.',
					tags: ['Tickets'],
					parameters: [{ $ref: '#/components/parameters/CorrelationIdHeader' }],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/CreateTicketRequest' },
							},
						},
					},
					responses: {
						'201': {
							description: 'Ticket aggregate created.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/CreatedTicket' },
								},
							},
						},
						'400': {
							description: 'Malformed JSON or missing/invalid correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Department not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description:
								'Invalid request body or inactive department (department_inactive).',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error; aggregate transaction is rolled back.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets/{ticketId}': {
				get: {
					summary: 'Get a Ticket by ID',
					description:
						'RF09. Admin requires current Department membership; backoffice and cd require requester ownership. Inactive Departments remain readable. Read-only, without audit or side effects. Query parameters and request body are forbidden.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: {
								type: 'string',
								format: 'uuid',
								pattern:
									'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
							},
						},
					],
					responses: {
						'200': {
							description: 'Complete Ticket without expanded relations.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TicketDetail' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation/actor headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description:
								'Current Department membership or requester ownership denied.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description:
								'Invalid ticketId, any query parameter, or any present body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
				patch: {
					summary: 'Update ticket priority, department, or admin status',
					description:
						'Locks Ticket, then relevant Departments in UUID order. Admin needs current and target membership; requester needs ownership. No-op preserves updatedAt. A changed adminStatus writes one audit in the transaction.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/UpdateTicketRequest' },
							},
						},
					},
					responses: {
						'200': {
							description: 'Complete Ticket after update or no-op.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/Ticket' },
								},
							},
						},
						'400': {
							description:
								'Missing or invalid correlation/actor headers or malformed JSON.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Current Ticket or target Department access denied.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket or target Department not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description:
								'Invalid path/body or inactive target (department_inactive).',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error; transaction rolled back.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets/{ticketId}/messages': {
				get: {
					summary: 'List Ticket messages',
					description:
						'RF12. Admin with current Department membership sees all messages unless filtered. Requester owner sees visible messages only; filter false returns an empty scoped page. Results use createdAt ASC, id ASC and one consistent read snapshot. No audit or write.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
						{
							in: 'query',
							name: 'page',
							required: false,
							schema: { type: 'integer', minimum: 1, default: 1 },
						},
						{
							in: 'query',
							name: 'size',
							required: false,
							schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
						},
						{
							in: 'query',
							name: 'isVisibleToRequester',
							required: false,
							schema: { type: 'string', enum: ['true', 'false'] },
						},
					],
					responses: {
						'200': {
							description: 'Paginated Ticket messages.',
							content: {
								'application/json': {
									schema: {
										$ref: '#/components/schemas/TicketMessageListResponse',
									},
								},
							},
						},
						'400': {
							description: 'Missing or invalid actor or correlation headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Ticket access denied.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid ticketId, query, or present body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
				post: {
					summary: 'Create a Ticket message',
					description:
						'RF10. Body authorId/type must match actor headers. Admin needs current Department membership and may create an internal message. Requester owner must send a visible message. Every POST creates a new message; requester messages assign adminStatus=pendente and write two audits even if already pending. A requester message to a Ticket with requesterStatus=resolvido also reopens it to nao_resolvido in the same update, with one extra alteracao_status audit (statusType=requester); admin messages never change requesterStatus. Ticket is locked before Department; all writes are atomic.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/CreateTicketMessageRequest' },
							},
						},
					},
					responses: {
						'201': {
							description: 'Created TicketMessage.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TicketMessage' },
								},
							},
						},
						'400': {
							description:
								'Missing or invalid correlation/actor headers or malformed JSON.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description:
								'Current Department membership or requester ownership denied.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description:
								'Invalid ticketId, body, actor consistency, visibility, or query.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error; transaction rolled back.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets/{ticketId}/messages/{messageId}/visibility': {
				patch: {
					summary: 'Update visibility of an admin Ticket message',
					description:
						'RF11. Admin with current Department membership only, including inactive Departments. Only admin messages are eligible. Locks Ticket, Department, then scoped Message. Changes only message visibility; no-op writes nothing. Ticket and audits remain unchanged.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
						{
							in: 'path',
							name: 'messageId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/UpdateMessageVisibilityRequest',
								},
							},
						},
					},
					responses: {
						'200': {
							description: 'Complete TicketMessage after update or no-op.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TicketMessage' },
								},
							},
						},
						'400': { description: 'Missing or invalid headers or malformed JSON.' },
						'403': { description: 'Requester role or admin membership denied.' },
						'404': { description: 'Ticket or Message not found in Ticket scope.' },
						'422': { description: 'Invalid path, body, query, or non-admin Message.' },
						'500': { description: 'Unexpected error; transaction rolled back.' },
					},
				},
			},
			'/api/support/tickets/{ticketId}/resolve': {
				post: {
					summary: 'Resolve a Ticket as its requester',
					description:
						'RF08. Requester owner only; backoffice or cd role need not match Ticket origin. No request body. Locks Ticket, changes requesterStatus and writes one requester audit atomically. Already resolved is a no-op.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'ticketId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					responses: {
						'200': {
							description: 'Complete Ticket after resolution or authorized no-op.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/Ticket' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation/actor headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Admin or non-owner.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Ticket not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid ticketId or any present request body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error; transaction rolled back.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets/requester/{requesterId}': {
				get: {
					summary: 'List tickets owned by the requester',
					description:
						'RF07a. Actor must be backoffice or cd and match requesterId. Filters combine with ownership. Dates are DD/MM/YYYY UTC days. Results are ordered by createdAt DESC, id DESC. Read only.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'requesterId',
							required: true,
							schema: { type: 'string', pattern: '.*\\S.*' },
						},
						{ in: 'query', name: 'number', schema: { type: 'integer', minimum: 1 } },
						{
							in: 'query',
							name: 'startDate',
							schema: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
						},
						{
							in: 'query',
							name: 'endDate',
							schema: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
						},
						{
							in: 'query',
							name: 'status',
							schema: { $ref: '#/components/schemas/TicketAdminStatus' },
						},
						{
							in: 'query',
							name: 'origin',
							schema: { $ref: '#/components/schemas/TicketOrigin' },
						},
						{
							in: 'query',
							name: 'departmentId',
							schema: { type: 'string', format: 'uuid' },
						},
						{
							in: 'query',
							name: 'priority',
							schema: { $ref: '#/components/schemas/TicketPriority' },
						},
						{
							in: 'query',
							name: 'page',
							schema: { type: 'integer', minimum: 1, default: 1 },
						},
						{
							in: 'query',
							name: 'size',
							schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
						},
					],
					responses: {
						'200': {
							description: 'Authorized ticket page, including empty pages.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TicketListResponse' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation or actor headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Role or actor does not match requester path.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid, repeated, or unknown query parameter.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/tickets/admin/{adminId}': {
				get: {
					summary: 'List tickets visible to the admin',
					description:
						'RF07b. Admin actor must match adminId. Visibility uses current Department allowedUserIds, including inactive departments with retained membership. Filters combine with visibility. Dates are DD/MM/YYYY UTC days. Results are ordered by createdAt DESC, id DESC. Read only.',
					tags: ['Tickets'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{ $ref: '#/components/parameters/PerformedByHeader' },
						{ $ref: '#/components/parameters/PerformedByTypeHeader' },
						{
							in: 'path',
							name: 'adminId',
							required: true,
							schema: { type: 'string', pattern: '.*\\S.*' },
						},
						{ in: 'query', name: 'number', schema: { type: 'integer', minimum: 1 } },
						{
							in: 'query',
							name: 'startDate',
							schema: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
						},
						{
							in: 'query',
							name: 'endDate',
							schema: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
						},
						{
							in: 'query',
							name: 'status',
							schema: { $ref: '#/components/schemas/TicketAdminStatus' },
						},
						{
							in: 'query',
							name: 'origin',
							schema: { $ref: '#/components/schemas/TicketOrigin' },
						},
						{
							in: 'query',
							name: 'departmentId',
							schema: { type: 'string', format: 'uuid' },
						},
						{
							in: 'query',
							name: 'priority',
							schema: { $ref: '#/components/schemas/TicketPriority' },
						},
						{
							in: 'query',
							name: 'requesterId',
							schema: { type: 'string', pattern: '.*\\S.*' },
						},
						{
							in: 'query',
							name: 'page',
							schema: { type: 'integer', minimum: 1, default: 1 },
						},
						{
							in: 'query',
							name: 'size',
							schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
						},
					],
					responses: {
						'200': {
							description: 'Authorized ticket page, including empty pages.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/TicketListResponse' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation or actor headers.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'403': {
							description: 'Role or actor does not match admin path.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid, repeated, or unknown query parameter.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/departments': {
				get: {
					summary: 'List active departments',
					description:
						'Returns active departments ordered by name ASC and id ASC. Page and size decisions are specific to RF03.',
					tags: ['Departments'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{
							in: 'query',
							name: 'type',
							required: false,
							schema: { $ref: '#/components/schemas/DepartmentType' },
						},
						{
							in: 'query',
							name: 'page',
							required: false,
							schema: { type: 'integer', minimum: 1, default: 1 },
						},
						{
							in: 'query',
							name: 'size',
							required: false,
							schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
						},
					],
					responses: {
						'200': {
							description: 'Active departments page.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/DepartmentListResponse' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid or unknown query parameter.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
				post: {
					summary: 'Create a department',
					tags: ['Departments'],
					parameters: [{ $ref: '#/components/parameters/CorrelationIdHeader' }],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/CreateDepartmentRequest' },
							},
						},
					},
					responses: {
						'201': {
							description: 'Department created.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/Department' },
								},
							},
						},
						'400': {
							description: 'Malformed JSON or missing correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid request body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/api/support/departments/{departmentId}': {
				get: {
					summary: 'Get a department by id',
					description:
						'Returns one department with the same shape as the list items. Inactive departments are returned too (active=false). Read only.',
					tags: ['Departments'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{
							in: 'path',
							name: 'departmentId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					responses: {
						'200': {
							description: 'Department, active or inactive.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/Department' },
								},
							},
						},
						'400': {
							description: 'Missing or invalid correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Department not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid path or forbidden request body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
				patch: {
					summary: 'Update a department',
					tags: ['Departments'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{
							in: 'path',
							name: 'departmentId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/UpdateDepartmentRequest' },
							},
						},
					},
					responses: {
						'200': {
							description: 'Department updated.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/Department' },
								},
							},
						},
						'400': {
							description: 'Malformed JSON or missing correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Department not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid path or request body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
				delete: {
					summary: 'Soft delete a department',
					description:
						'Sets active=false while preserving the department and its memberships. Repeating the operation for an inactive department is a successful no-op. RF03 continues to return only active departments. This operation creates no audit log or domain event.',
					tags: ['Departments'],
					parameters: [
						{ $ref: '#/components/parameters/CorrelationIdHeader' },
						{
							in: 'path',
							name: 'departmentId',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					responses: {
						'204': {
							description: 'Department soft deleted or already inactive.',
						},
						'400': {
							description: 'Missing or invalid correlation.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'404': {
							description: 'Department not found.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'422': {
							description: 'Invalid path or forbidden request body.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
						'500': {
							description: 'Unexpected error.',
							content: {
								'application/json': {
									schema: { $ref: '#/components/schemas/ErrorResponse' },
								},
							},
						},
					},
				},
			},
			'/health': {
				get: {
					summary: 'Service health',
					responses: {
						'200': {
							description: 'Operational health status.',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										required: ['status', 'timestamp', 'database', 'messaging'],
										properties: {
											status: { type: 'string', enum: ['ok'] },
											timestamp: { type: 'string', format: 'date-time' },
											database: { type: 'boolean' },
											messaging: {
												type: 'object',
												required: ['enabled', 'status'],
												properties: {
													enabled: { type: 'boolean', enum: [false] },
													status: {
														type: 'string',
														enum: ['not_applicable'],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			'/metrics': {
				get: {
					summary: 'Prometheus metrics',
					responses: {
						'200': {
							description: 'Prometheus exposition format.',
							content: { 'text/plain': { schema: { type: 'string' } } },
						},
					},
				},
			},
			'/api-docs-json': {
				get: {
					summary: 'OpenAPI document',
					responses: {
						'200': {
							description: 'Current OpenAPI document.',
							content: { 'application/json': { schema: { type: 'object' } } },
						},
					},
				},
			},
			'/api-docs': {
				get: {
					summary: 'Swagger UI',
					responses: {
						'200': {
							description: 'Interactive OpenAPI documentation.',
							content: { 'text/html': { schema: { type: 'string' } } },
						},
					},
				},
			},
		},
	},
	apis: [],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;
