/**
 * Hand-rolled zod -> JSON Schema converter for the subset the LLM client
 * needs (forced `emit` tool input_schema): objects, strings, numbers
 * (int-aware), booleans, arrays, enums, literals, nullable, optional/default.
 *
 * Deliberately NOT a general converter — unsupported zod types throw loudly
 * so a schema author finds out at dev time, not via silent misextraction.
 */
import { z } from "zod";

export type JsonSchema = { [key: string]: unknown };

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as Record<string, unknown> & {
    typeName: z.ZodFirstPartyTypeKind;
  };
  const out = convert(schema, def);
  const description = def.description as string | undefined;
  if (description !== undefined) out.description = description;
  return out;
}

function convert(
  schema: z.ZodTypeAny,
  def: Record<string, unknown> & { typeName: z.ZodFirstPartyTypeKind },
): JsonSchema {
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(field);
        if (!field.isOptional()) required.push(key);
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    case z.ZodFirstPartyTypeKind.ZodString:
      return { type: "string" };
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const checks = (def.checks as Array<{ kind: string }> | undefined) ?? [];
      return { type: checks.some((c) => c.kind === "int") ? "integer" : "number" };
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return { type: "boolean" };
    case z.ZodFirstPartyTypeKind.ZodArray:
      return { type: "array", items: zodToJsonSchema(def.type as z.ZodTypeAny) };
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return { type: "string", enum: [...(def.values as readonly string[])] };
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return { const: def.value };
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return { anyOf: [zodToJsonSchema(def.innerType as z.ZodTypeAny), { type: "null" }] };
    // Optionality is encoded on the parent object's `required` array; the
    // property schema itself is the unwrapped inner type.
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return zodToJsonSchema(def.innerType as z.ZodTypeAny);
    default:
      // Message carries only the zod type name — never schema/document data.
      throw new Error(`zodToJsonSchema: unsupported zod type ${String(def.typeName)}`);
  }
}
