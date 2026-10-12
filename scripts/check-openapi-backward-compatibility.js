const fs = require('node:fs');
const SwaggerParser = require('swagger-parser');

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTypes(typeValue) {
	if (!typeValue) {
		return [];
	}

	return Array.isArray(typeValue) ? typeValue : [typeValue];
}

function compareRequestSchemas(baselineSchema, candidateSchema, path, errors) {
	if (!baselineSchema || typeof baselineSchema !== 'object') {
		return;
	}

	if (!candidateSchema || typeof candidateSchema !== 'object') {
		errors.push(`${path}: candidate schema is missing.`);
		return;
	}

	const baselineTypes = normalizeTypes(baselineSchema.type);
	const candidateTypes = normalizeTypes(candidateSchema.type);

	// A scalar widened to an array of the same scalar (repeatable query param) still accepts the
	// single-value form on the wire, so compare the baseline against the array items.
	if (
		baselineTypes.length > 0 &&
		!baselineTypes.includes('array') &&
		candidateTypes.includes('array') &&
		!candidateTypes.some((typeName) => baselineTypes.includes(typeName)) &&
		candidateSchema.items
	) {
		compareRequestSchemas(baselineSchema, candidateSchema.items, path, errors);
		return;
	}

	const missingTypes = baselineTypes.filter((typeName) => !candidateTypes.includes(typeName));

	if (baselineTypes.length > 0 && missingTypes.length > 0) {
		errors.push(
			`${path}: candidate schema no longer accepts baseline type(s) '${missingTypes.join('|')}'.`,
		);
		return;
	}

	if (baselineSchema.format && candidateSchema.format !== baselineSchema.format) {
		errors.push(
			`${path}: format changed from '${baselineSchema.format}' to '${candidateSchema.format ?? 'undefined'}'.`,
		);
	}

	if (
		Object.prototype.hasOwnProperty.call(baselineSchema, 'const') &&
		candidateSchema.const !== baselineSchema.const
	) {
		errors.push(
			`${path}: const changed from '${baselineSchema.const}' to '${candidateSchema.const}'.`,
		);
	}

	if (Array.isArray(baselineSchema.enum) && Array.isArray(candidateSchema.enum)) {
		const removedValues = baselineSchema.enum.filter(
			(value) => !candidateSchema.enum.includes(value),
		);

		if (removedValues.length > 0) {
			errors.push(
				`${path}: candidate enum no longer accepts baseline value(s) [${removedValues.join(', ')}].`,
			);
		}
	}

	if (baselineTypes.includes('object')) {
		const baselineProperties = baselineSchema.properties ?? {};
		const candidateProperties = candidateSchema.properties ?? {};
		const baselineRequired = new Set(baselineSchema.required ?? []);
		const candidateRequired = new Set(candidateSchema.required ?? []);

		for (const propertyName of Object.keys(baselineProperties)) {
			if (!Object.prototype.hasOwnProperty.call(candidateProperties, propertyName)) {
				errors.push(`${path}: property '${propertyName}' was removed.`);
				continue;
			}

			compareRequestSchemas(
				baselineProperties[propertyName],
				candidateProperties[propertyName],
				`${path}.${propertyName}`,
				errors,
			);
		}

		for (const requiredName of candidateRequired) {
			if (!baselineRequired.has(requiredName)) {
				errors.push(
					`${path}: property '${requiredName}' became newly required in the candidate contract.`,
				);
			}
		}

		return;
	}

	if (baselineTypes.includes('array') && baselineSchema.items) {
		if (!candidateSchema.items) {
			errors.push(`${path}: array item schema is missing.`);
			return;
		}

		compareRequestSchemas(baselineSchema.items, candidateSchema.items, `${path}[]`, errors);
	}
}

function compareResponseSchemas(baselineSchema, candidateSchema, path, errors) {
	if (!baselineSchema || typeof baselineSchema !== 'object') {
		return;
	}

	if (!candidateSchema || typeof candidateSchema !== 'object') {
		errors.push(`${path}: candidate schema is missing.`);
		return;
	}

	const baselineTypes = normalizeTypes(baselineSchema.type);
	const candidateTypes = normalizeTypes(candidateSchema.type);

	if (
		baselineTypes.length > 0 &&
		(baselineTypes.length !== candidateTypes.length ||
			baselineTypes.some((typeName) => !candidateTypes.includes(typeName)))
	) {
		errors.push(
			`${path}: type changed from '${baselineTypes.join('|')}' to '${candidateTypes.join('|') || 'undefined'}'.`,
		);
		return;
	}

	if (baselineSchema.format && candidateSchema.format !== baselineSchema.format) {
		errors.push(
			`${path}: format changed from '${baselineSchema.format}' to '${candidateSchema.format ?? 'undefined'}'.`,
		);
	}

	if (
		Object.prototype.hasOwnProperty.call(baselineSchema, 'const') &&
		candidateSchema.const !== baselineSchema.const
	) {
		errors.push(
			`${path}: const changed from '${baselineSchema.const}' to '${candidateSchema.const}'.`,
		);
	}

	if (Array.isArray(baselineSchema.enum) && Array.isArray(candidateSchema.enum)) {
		const removedValues = baselineSchema.enum.filter(
			(value) => !candidateSchema.enum.includes(value),
		);
		const addedValues = candidateSchema.enum.filter(
			(value) => !baselineSchema.enum.includes(value),
		);

		if (removedValues.length > 0 || addedValues.length > 0) {
			errors.push(
				`${path}: enum changed from [${baselineSchema.enum.join(', ')}] to [${candidateSchema.enum.join(', ')}].`,
			);
		}
	}

	if (baselineTypes.includes('object')) {
		const baselineProperties = baselineSchema.properties ?? {};
		const candidateProperties = candidateSchema.properties ?? {};
		const baselineRequired = new Set(baselineSchema.required ?? []);
		const candidateRequired = new Set(candidateSchema.required ?? []);

		for (const propertyName of Object.keys(baselineProperties)) {
			if (!Object.prototype.hasOwnProperty.call(candidateProperties, propertyName)) {
				errors.push(`${path}: property '${propertyName}' was removed.`);
				continue;
			}

			compareResponseSchemas(
				baselineProperties[propertyName],
				candidateProperties[propertyName],
				`${path}.${propertyName}`,
				errors,
			);
		}

		for (const requiredName of baselineRequired) {
			if (!candidateRequired.has(requiredName)) {
				errors.push(
					`${path}: required property '${requiredName}' became optional or was removed.`,
				);
			}
		}

		return;
	}

	if (baselineTypes.includes('array') && baselineSchema.items) {
		if (!candidateSchema.items) {
			errors.push(`${path}: array item schema is missing.`);
			return;
		}

		compareResponseSchemas(baselineSchema.items, candidateSchema.items, `${path}[]`, errors);
	}
}

function compareParameters(baselineParameters, candidateParameters, path, errors) {
	const candidateParametersByKey = new Map(
		candidateParameters.map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]),
	);

	for (const baselineParameter of baselineParameters) {
		const parameterKey = `${baselineParameter.in}:${baselineParameter.name}`;
		const candidateParameter = candidateParametersByKey.get(parameterKey);

		if (!candidateParameter) {
			errors.push(`${path}: parameter '${parameterKey}' was removed.`);
			continue;
		}

		if (candidateParameter.required && !baselineParameter.required) {
			errors.push(`${path}: parameter '${parameterKey}' became required.`);
		}

		if (baselineParameter.schema) {
			compareRequestSchemas(
				baselineParameter.schema,
				candidateParameter.schema,
				`${path}.parameters.${parameterKey}`,
				errors,
			);
		}
	}
}

function compareRequestBodies(baselineOperation, candidateOperation, path, errors) {
	if (!baselineOperation.requestBody) {
		return;
	}

	if (!candidateOperation.requestBody) {
		errors.push(`${path}: request body was removed.`);
		return;
	}

	if (candidateOperation.requestBody.required && !baselineOperation.requestBody.required) {
		errors.push(`${path}: request body became newly required.`);
	}

	const baselineContent = baselineOperation.requestBody.content ?? {};
	const candidateContent = candidateOperation.requestBody.content ?? {};

	for (const [mediaType, baselineMediaTypeObject] of Object.entries(baselineContent)) {
		const candidateMediaTypeObject = candidateContent[mediaType];

		if (!candidateMediaTypeObject) {
			errors.push(`${path}: media type '${mediaType}' was removed from request body.`);
			continue;
		}

		compareRequestSchemas(
			baselineMediaTypeObject.schema,
			candidateMediaTypeObject.schema,
			`${path}.requestBody.${mediaType}`,
			errors,
		);
	}
}

function compareResponses(baselineResponses, candidateResponses, path, errors) {
	for (const [statusCode, baselineResponse] of Object.entries(baselineResponses)) {
		const candidateResponse = candidateResponses[statusCode];

		if (!candidateResponse) {
			errors.push(`${path}: response '${statusCode}' was removed.`);
			continue;
		}

		const baselineContent = baselineResponse.content ?? {};
		const candidateContent = candidateResponse.content ?? {};

		for (const [mediaType, baselineMediaTypeObject] of Object.entries(baselineContent)) {
			const candidateMediaTypeObject = candidateContent[mediaType];

			if (!candidateMediaTypeObject) {
				errors.push(`${path}: response '${statusCode}' removed media type '${mediaType}'.`);
				continue;
			}

			compareResponseSchemas(
				baselineMediaTypeObject.schema,
				candidateMediaTypeObject.schema,
				`${path}.responses.${statusCode}.${mediaType}`,
				errors,
			);
		}
	}
}

async function checkOpenApiBackwardCompatibility(baselineSpec, candidateSpec) {
	const errors = [];
	const dereferencedBaseline = await SwaggerParser.dereference(baselineSpec);
	const dereferencedCandidate = await SwaggerParser.dereference(candidateSpec);
	const baselinePaths = dereferencedBaseline.paths ?? {};
	const candidatePaths = dereferencedCandidate.paths ?? {};

	for (const [pathName, baselinePathItem] of Object.entries(baselinePaths)) {
		const candidatePathItem = candidatePaths[pathName];

		if (!candidatePathItem) {
			errors.push(`Path '${pathName}' was removed from the candidate contract.`);
			continue;
		}

		const baselinePathParameters = baselinePathItem.parameters ?? [];
		const candidatePathParameters = candidatePathItem.parameters ?? [];

		for (const methodName of ['get', 'post', 'put', 'patch', 'delete']) {
			const baselineOperation = baselinePathItem[methodName];

			if (!baselineOperation) {
				continue;
			}

			const candidateOperation = candidatePathItem[methodName];
			const operationPath = `paths.${pathName}.${methodName}`;

			if (!candidateOperation) {
				errors.push(`Operation '${methodName.toUpperCase()} ${pathName}' was removed.`);
				continue;
			}

			compareParameters(
				[...baselinePathParameters, ...(baselineOperation.parameters ?? [])],
				[...candidatePathParameters, ...(candidateOperation.parameters ?? [])],
				operationPath,
				errors,
			);
			compareRequestBodies(baselineOperation, candidateOperation, operationPath, errors);
			compareResponses(
				baselineOperation.responses ?? {},
				candidateOperation.responses ?? {},
				operationPath,
				errors,
			);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

async function main() {
	const [baselinePath, candidatePath] = process.argv.slice(2);

	if (!baselinePath || !candidatePath) {
		console.error(
			'Usage: node scripts/check-openapi-backward-compatibility.js <baseline.json> <candidate.json>',
		);
		process.exit(1);
	}

	const result = await checkOpenApiBackwardCompatibility(
		readJson(baselinePath),
		readJson(candidatePath),
	);

	if (!result.valid) {
		console.error('OpenAPI backward compatibility check failed:');
		for (const error of result.errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}

	console.log('OpenAPI backward compatibility OK');
}

if (require.main === module) {
	main().catch((error) => {
		console.error(`OpenAPI backward compatibility check failed: ${error.message}`);
		process.exit(1);
	});
}

module.exports = {
	checkOpenApiBackwardCompatibility,
	compareRequestSchemas,
	compareResponseSchemas,
	readJson,
};
