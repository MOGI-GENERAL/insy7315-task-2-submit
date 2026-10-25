import { z } from 'zod';
import { CSRF_HEADER } from './common.js';
import { ErrorEnvelope } from './errors.js';
import { ROUTES } from './routes.js';
import type { RouteSpec } from './routes.js';

type Json = Record<string, unknown>;

const SESSION_COOKIE = 'fedsa.sid';
const TWILIO_HEADER = 'x-twilio-signature';
const CONTENT_FREE_STATUS = [204, 302];

/** file field names match the multer setup in the API */
const FILE_FIELDS: Record<string, { name: string; many: boolean }> = {
  '/api/offers': { name: 'photos', many: true },
  '/api/offers/:id/handover/donor-confirm': { name: 'photo', many: false },
};

const FILE_RESPONSES: Record<string, { type: string; description: string }> = {
  'GET /api/tax-certificates/:id/pdf': { type: 'application/pdf', description: 'Certificate PDF' },
  'GET /api/reports/export': { type: 'text/csv', description: 'CSV export' },
  'POST /api/webhooks/twilio/inbound': { type: 'text/xml', description: 'TwiML reply' },
};

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Json;
  delete json.$schema;
  return json;
}

function openApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

function pathParams(path: string): string[] {
  return [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
}

function operationId(route: RouteSpec): string {
  let id = route.method.toLowerCase();
  for (const segment of route.path.split('/').slice(2)) {
    const name = segment.startsWith(':') ? `By-${segment.slice(1)}` : segment;
    for (const word of name.split('-')) id += word.charAt(0).toUpperCase() + word.slice(1);
  }
  return id;
}

function describeAccess(route: RouteSpec): string {
  let text: string;
  if (route.access === 'public') text = 'Public.';
  else if (route.access === 'any') text = 'Any signed-in user.';
  else if (route.access === 'twilio') text = 'Twilio webhook, signed.';
  else text = `Roles: ${route.access.join(', ')}.`;
  if (route.ownedByOrganisation) text += " Another organisation's records answer 404.";
  return text;
}

function securityOf(route: RouteSpec): Json[] {
  if (route.access === 'public') return [];
  if (route.access === 'twilio') return [{ twilioSignature: [] }];
  if (route.method === 'GET') return [{ sessionCookie: [] }];
  return [{ sessionCookie: [], csrfToken: [] }];
}

function queryParameters(query: z.ZodType): Json[] {
  const json = schemaOf(query, 'input');
  const properties = (json.properties ?? {}) as Record<string, Json>;
  const required = (json.required ?? []) as string[];
  return Object.keys(properties).map((name) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: properties[name],
  }));
}

function requestBody(route: RouteSpec): Json | undefined {
  if (!route.body) return undefined;
  const schema = schemaOf(route.body, 'input');
  if (route.multipart) {
    const file = FILE_FIELDS[route.path];
    if (file) {
      const binary = { type: 'string', contentMediaType: 'application/octet-stream' };
      const properties = (schema.properties ?? {}) as Record<string, Json>;
      properties[file.name] = file.many ? { type: 'array', items: binary } : binary;
      schema.properties = properties;
    }
    return { required: true, content: { 'multipart/form-data': { schema } } };
  }
  if (route.access === 'twilio') {
    return {
      required: true,
      content: { 'application/x-www-form-urlencoded': { schema } },
    };
  }
  return { required: true, content: { 'application/json': { schema } } };
}

function successResponse(route: RouteSpec): Json {
  if (route.response) {
    const schema = schemaOf(route.response, 'output');
    return { description: 'Success', content: { 'application/json': { schema } } };
  }
  const file = FILE_RESPONSES[`${route.method} ${route.path}`];
  if (file) {
    const schema =
      file.type === 'application/pdf' ? { type: 'string', format: 'binary' } : { type: 'string' };
    return { description: file.description, content: { [file.type]: { schema } } };
  }
  if (route.status === 302) {
    const location = { description: 'Short-lived photo URL', schema: { type: 'string' } };
    return { description: 'Redirect to the photo', headers: { Location: location } };
  }
  if (CONTENT_FREE_STATUS.includes(route.status)) return { description: 'No content' };
  return { description: 'Success' };
}

function operationOf(route: RouteSpec): Json {
  const parameters: Json[] = pathParams(route.path).map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  if (route.query) parameters.push(...queryParameters(route.query));

  const operation: Json = {
    operationId: operationId(route),
    summary: `${route.method} ${route.path}`,
    description: describeAccess(route),
    tags: [route.path.split('/')[2]],
    security: securityOf(route),
  };
  if (parameters.length > 0) operation.parameters = parameters;
  const body = requestBody(route);
  if (body) operation.requestBody = body;
  operation.responses = {
    [String(route.status)]: successResponse(route),
    default: {
      description: 'Error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    },
  };
  return operation;
}

export function buildOpenApi(routes: readonly RouteSpec[] = ROUTES, version = '1.0.1'): Json {
  const paths: Record<string, Json> = {};
  for (const route of routes) {
    const path = openApiPath(route.path);
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = operationOf(route);
  }
  return {
    openapi: '3.1.0',
    info: { title: 'FEDSA API', version },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: { ErrorEnvelope: schemaOf(ErrorEnvelope, 'output') },
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
        csrfToken: { type: 'apiKey', in: 'header', name: CSRF_HEADER },
        twilioSignature: { type: 'apiKey', in: 'header', name: TWILIO_HEADER },
      },
    },
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const sorted: Json = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeys((value as Json)[key]);
    return sorted;
  }
  return value;
}

export function serialiseOpenApi(doc: Json = buildOpenApi()): string {
  return `${JSON.stringify(sortKeys(doc), null, 2)}\n`;
}
