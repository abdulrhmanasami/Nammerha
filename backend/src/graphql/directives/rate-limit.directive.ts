import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { GraphQLSchema, defaultFieldResolver } from 'graphql';
import type { GQLContext } from '../context/auth.context';

export const rateLimitDirectiveTypeDef = `#graphql
    directive @rateLimit(max: Int!, window: String!) on FIELD_DEFINITION
`;

interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (entry.resetAt <= now) {rateLimitStore.delete(key);}
    }
}, 5 * 60 * 1000).unref();

function parseWindow(window: string): number {
    const match = window.match(/^(\d+)(s|m|h)$/);
    if (!match || !match[1] || !match[2]) {throw new Error(`Invalid format: "${window}"`);}
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default:  return value * 1000;
    }
}

export function rateLimitDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
    return mapSchema(schema, {
        [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
            const rateLimitDirective = getDirective(schema, fieldConfig, 'rateLimit')?.[0];
            if (!rateLimitDirective) {return fieldConfig;}

            const max = rateLimitDirective['max'] as number;
            const windowStr = rateLimitDirective['window'] as string;
            const windowMs = parseWindow(windowStr);
            const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;

            fieldConfig.resolve = async (source, args, context: GQLContext, info) => {
                const identifier = context.user?.user_id ?? context.req?.ip ?? 'anonymous';
                const key = `rl:${identifier}:${typeName}.${info.fieldName}`;
                const now = Date.now();
                const existing = rateLimitStore.get(key);

                if (existing) {
                    if (existing.resetAt <= now) {
                        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
                    } else if (existing.count >= max) {
                        throw new Error(`Rate limit exceeded for ${info.fieldName}.`);
                    } else {
                        existing.count += 1;
                    }
                } else {
                    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
                }
                return originalResolve(source, args, context, info);
            };
            return fieldConfig;
        },
    });
}
