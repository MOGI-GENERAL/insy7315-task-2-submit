import { expect, test } from 'vitest';
import { buildOpenApi, ROUTES } from './index.js';

type Operation = { operationId: string; responses: Record<string, unknown> };
const doc = buildOpenApi() as { paths: Record<string, Record<string, Operation>> };

test('every route is in the document', () => {
  for (const r of ROUTES) {
    const path = r.path.replace(/:(\w+)/g, '{$1}');
    expect(doc.paths[path]?.[r.method.toLowerCase()], `${r.method} ${r.path}`).toBeDefined();
  }
});

test('every operation has a default error response and a unique id', () => {
  const ids = new Set<string>();
  for (const methods of Object.values(doc.paths)) {
    for (const op of Object.values(methods)) {
      expect(op.responses.default).toBeDefined();
      ids.add(op.operationId);
    }
  }
  expect(ids.size).toBe(ROUTES.length);
});
