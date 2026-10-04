import { z } from 'zod';

/**
 * a copy of a response schema in which every object refuses keys it does not
 * name, however deep. zod's own `.strict()` only reaches the outer object
 */
export function strictSchema(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodType> = {};
    for (const [key, field] of Object.entries(schema.shape)) {
      shape[key] = strictSchema(field as z.ZodType);
    }
    return schema.clone({ ...schema.def, shape, catchall: z.never() });
  }
  if (schema instanceof z.ZodArray) {
    return schema.clone({ ...schema.def, element: strictSchema(schema.element as z.ZodType) });
  }
  if (schema instanceof z.ZodNullable) return strictSchema(schema.unwrap() as z.ZodType).nullable();
  if (schema instanceof z.ZodOptional) return strictSchema(schema.unwrap() as z.ZodType).optional();
  // a discriminated union is a union too
  if (schema instanceof z.ZodUnion) {
    return schema.clone({
      ...schema.def,
      options: schema.options.map((option) => strictSchema(option as z.ZodType)),
    });
  }
  return schema;
}

/** one line per problem, with the dotted path of the field */
export function describeIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(body)'}: ${issue.message}`)
    .join('\n');
}
