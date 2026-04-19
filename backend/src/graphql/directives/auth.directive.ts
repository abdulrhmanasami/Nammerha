import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { GraphQLSchema, defaultFieldResolver } from 'graphql';
import type { GQLContext } from '../context/auth.context';

export const authDirectiveTypeDef = `#graphql
    directive @auth(requires: UserRole) on FIELD_DEFINITION
`;

export function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
    return mapSchema(schema, {
        [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
            const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0];
            if (!authDirective) return fieldConfig;

            const requiredRole = authDirective['requires'] as string | undefined;
            const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;

            fieldConfig.resolve = async (source, args, context: GQLContext, info) => {
                if (!context.user) {
                    throw new Error('Authentication required. Please provide a valid Bearer token.');
                }
                if (requiredRole) {
                    const normalizedRequired = requiredRole.toLowerCase();
                    const userRoles = context.user.roles.map(r => r.toLowerCase());
                    const primaryRole = String(context.user.role).toLowerCase();

                    if (!userRoles.includes(normalizedRequired) && primaryRole !== normalizedRequired) {
                        throw new Error(`Insufficient permissions. Required role: ${requiredRole}`);
                    }
                }
                return originalResolve(source, args, context, info);
            };
            return fieldConfig;
        },
    });
}
