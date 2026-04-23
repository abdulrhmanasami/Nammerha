// ============================================================================
// Nammerha GraphQL — Apollo Server Integration
// ============================================================================
// Integrates Apollo Server v5 with the existing Express application.
// This is mounted as Express middleware alongside the existing REST routes,
// implementing the Strangler Fig pattern: both REST and GraphQL operate
// simultaneously during the migration period.
//
// Architecture:
//   Express (server.ts)
//     ├── /api/* → REST routes (existing, untouched)
//     ├── /graphql → Apollo Server (this file)
//     └── /:locale/:page → Stitch locale pages (existing)
//
// Package: @as-integrations/express4 provides the Express middleware adapter
// for Apollo Server v5 (which no longer bundles express4 integration).
// ============================================================================

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import type { Express } from 'express';
import express from 'express';

import { type Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
// L-1 AUDIT: @ts-ignore is required because graphql-ws uses Node16 exports map
// (`exports["./use/ws"]`). TypeScript cannot resolve this without moduleResolution: Node16,
// which would break the rest of the codebase. The runtime import is correct.
// @ts-ignore - graphql-ws exports require moduleResolution: Node16
import { useServer } from 'graphql-ws/use/ws';

import { schema } from './schema/index';
import { buildContext, type GQLContext } from './context/auth.context';
import { createUserLoader } from './context/dataloader/user.loader';
import { createProjectLoader } from './context/dataloader/project.loader';
import { createBOQLoader } from './context/dataloader/boq.loader';
import { logger } from '../utils/logger';
import { initPgNotifyListener } from './resolvers/subscription/notification.resolver';

/**
 * Creates and starts the Apollo Server instance.
 *
 * @returns The started Apollo Server, ready for Express middleware integration
 */
async function createApolloServer(): Promise<ApolloServer<GQLContext>> {
    const server = new ApolloServer<GQLContext>({
        schema,

        // ── Introspection & Playground ──────────────────────────────────
        // Enable in development for GraphQL IDE; disable in production
        // for security (prevents schema exposure)
        introspection: process.env['NODE_ENV'] !== 'production',

        // ── Error Formatting ────────────────────────────────────────────
        // SEC-008 compliance: Never expose internal error messages to clients
        formatError: (formattedError, error) => {
            // Log the full error server-side for debugging
            logger.error('GraphQL Error', {
                message: formattedError.message,
                path: formattedError.path,
                extensions: formattedError.extensions,
                originalError: error instanceof Error ? error.stack : String(error),
            });

            // In production, sanitize error messages
            if (process.env['NODE_ENV'] === 'production') {
                // Preserve authentication and authorization errors as-is
                if (formattedError.message.includes('Authentication required') ||
                    formattedError.message.includes('Insufficient permissions')) {
                    return formattedError;
                }

                // Preserve "Not implemented" errors during migration
                if (formattedError.message.includes('Not implemented')) {
                    return {
                        ...formattedError,
                        message: 'This feature is not yet available via GraphQL. Please use the REST API.',
                    };
                }

                // Sanitize all other errors
                return {
                    message: 'Internal server error',
                    extensions: {
                        code: formattedError.extensions?.['code'] ?? 'INTERNAL_SERVER_ERROR',
                    },
                };
            }

            return formattedError;
        },

        // ── Performance ─────────────────────────────────────────────────
        // Set reasonable limits to prevent abuse
        plugins: [
            {
                async requestDidStart() {
                    const start = Date.now();
                    return {
                        async willSendResponse() {
                            const duration = Date.now() - start;
                            if (duration > 200) {
                                logger.warn('GraphQL slow query detected', { durationMs: duration });
                            }
                        },
                    };
                },
            },
        ],
    });

    await server.start();
    logger.info('Apollo GraphQL server started');

    return server;
}

/**
 * Mounts the Apollo Server as Express middleware at /graphql.
 *
 * IMPORTANT: This must be called AFTER the Express app is configured
 * with CORS, body parsing, etc., but BEFORE the 404 handler.
 *
 * @param app - The Express application instance from server.ts
 */
export async function setupGraphQL(app: Express, httpServer: HttpServer): Promise<void> {
    try {
        await initPgNotifyListener();
        
        const server = await createApolloServer();

        // Mount Apollo as Express middleware
        // The context builder extracts auth from the request headers
        app.use(
            '/graphql',
            express.json(),
            expressMiddleware(server, {
                context: async ({ req }: { req: express.Request }) => buildContext({ req }),
            }),
        );
        
        // Mount graphql-ws handler
        const wsServer = new WebSocketServer({
            server: httpServer,
            path: '/graphql',
        });
        
        // M-4 FIX: Typed WebSocket context — no `any` annotations.
        interface WsConnectionContext {
            connectionParams?: Record<string, unknown>;
        }

        useServer(
            {
                schema,
                context: async (ctx: WsConnectionContext) => {
                    const token = ctx.connectionParams?.['token'] as string | undefined;
                    const fakeReq = {
                        headers: token ? { authorization: `Bearer ${token}` } : {},
                        authUser: null as null | Record<string, unknown>,
                    };
                    
                    if (token) {
                        try {
                            const jwt = await import('jsonwebtoken');
                            const secret = process.env['JWT_SECRET'];
                            if (secret) {
                                const decoded = jwt.default.verify(token, secret) as Record<string, unknown>;
                                fakeReq.authUser = {
                                    user_id: decoded['userId'],
                                    role: decoded['role'],
                                    roles: decoded['roles'] ?? [decoded['role']],
                                };
                            }
                        } catch (err) {
                            logger.error('WebSocket context JWT verify failed', { error: err instanceof Error ? err.message : String(err) });
                        }
                    }
                    
                    return {
                        req: fakeReq,
                        user: fakeReq.authUser,
                        loaders: {
                            userLoader: createUserLoader(),
                            projectLoader: createProjectLoader(),
                            boqLoader: createBOQLoader(),
                        },
                    } as unknown as GQLContext;
                },
                onConnect: () => {
                    logger.info('WebSocket client connected for GraphQL Subscriptions');
                },
                onDisconnect: () => {
                    logger.info('WebSocket client disconnected');
                },
            },
            wsServer
        );

        logger.info('GraphQL endpoint mounted at /graphql');
    } catch (err) {
        logger.error('Failed to mount GraphQL server', {
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}
