// ============================================================================
// Nammerha GraphQL — Custom Scalar Definitions
// ============================================================================
// Custom scalars for domain-specific data types that don't map to standard
// GraphQL scalars. Each scalar includes serialization, parsing, and literal
// parsing logic.
// ============================================================================

import { GraphQLScalarType, Kind } from 'graphql';

/**
 * DateTime scalar — ISO 8601 date-time strings.
 * Serializes JavaScript Date objects to ISO strings.
 * Parses ISO strings and Unix timestamps from clients.
 */
export const DateTimeScalar = new GraphQLScalarType({
    name: 'DateTime',
    description: 'ISO 8601 date-time string (e.g., 2026-04-17T06:00:00.000Z)',
    serialize(value: unknown): string {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'string') {
            return new Date(value).toISOString();
        }
        throw new TypeError(`DateTime cannot serialize value: ${value}`);
    },
    parseValue(value: unknown): Date {
        if (typeof value === 'string') {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new TypeError(`DateTime cannot parse invalid date string: ${value}`);
            }
            return date;
        }
        if (typeof value === 'number') {
            return new Date(value);
        }
        throw new TypeError(`DateTime cannot parse value: ${value}`);
    },
    parseLiteral(ast): Date {
        if (ast.kind === Kind.STRING) {
            return new Date(ast.value);
        }
        if (ast.kind === Kind.INT) {
            return new Date(parseInt(ast.value, 10));
        }
        throw new TypeError(`DateTime cannot parse literal of kind: ${ast.kind}`);
    },
});

/**
 * BigIntCents scalar — Monetary values stored as BIGINT in cents.
 *
 * MONETARY CONVENTION (from 001_core_schema.sql):
 * All monetary values are stored as BIGINT in the smallest currency unit (cents).
 * Example: $500.00 → 50000
 *
 * Serializes to string to avoid JavaScript number precision loss.
 * Parses both strings and numbers from clients.
 */
export const BigIntCentsScalar = new GraphQLScalarType({
    name: 'BigIntCents',
    description: 'Monetary value in smallest currency unit (cents). Serialized as string to preserve precision. Example: $500.00 → "50000"',
    serialize(value: unknown): string {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (typeof value === 'number') {
            return Math.round(value).toString();
        }
        if (typeof value === 'string') {
            return value;
        }
        throw new TypeError(`BigIntCents cannot serialize value: ${value}`);
    },
    parseValue(value: unknown): number {
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (isNaN(parsed)) {
                throw new TypeError(`BigIntCents cannot parse value: ${value}`);
            }
            return parsed;
        }
        if (typeof value === 'number') {
            return Math.round(value);
        }
        throw new TypeError(`BigIntCents cannot parse value: ${value}`);
    },
    parseLiteral(ast): number {
        if (ast.kind === Kind.STRING) {
            return parseInt(ast.value, 10);
        }
        if (ast.kind === Kind.INT) {
            return parseInt(ast.value, 10);
        }
        throw new TypeError(`BigIntCents cannot parse literal of kind: ${ast.kind}`);
    },
});

/**
 * JSON scalar — Arbitrary JSON objects.
 * Used for JSONB fields like device_info, fidic_formula_params, etc.
 */
export const JSONScalar = new GraphQLScalarType({
    name: 'JSON',
    description: 'Arbitrary JSON value. Used for device metadata, FIDIC parameters, and other flexible data structures.',
    serialize(value: unknown): unknown {
        return value;
    },
    parseValue(value: unknown): unknown {
        return value;
    },
    parseLiteral(ast): unknown {
        if (ast.kind === Kind.STRING) {
            try {
                return JSON.parse(ast.value);
            } catch {
                return ast.value;
            }
        }
        if (ast.kind === Kind.OBJECT) {
            // GraphQL AST object parsing — let Apollo handle it
            return ast;
        }
        return null;
    },
});

/**
 * All custom scalars bundled for schema integration.
 */
export const customScalars = {
    DateTime: DateTimeScalar,
    BigIntCents: BigIntCentsScalar,
    JSON: JSONScalar,
};

export const scalarTypeDefs = `#graphql
    """ISO 8601 date-time string"""
    scalar DateTime

    """Monetary value in smallest currency unit (cents), serialized as string"""
    scalar BigIntCents

    """Arbitrary JSON value"""
    scalar JSON
`;
