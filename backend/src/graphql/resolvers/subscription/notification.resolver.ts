import { EventEmitter } from 'events';
import { Client } from 'pg';
import { logger } from '../../../utils/logger';

export const CHANNELS = {
    NOTIFICATION: 'nammerha_notifications',
    PROJECT_UPDATE: 'nammerha_project_updates',
};

const pubsub = new EventEmitter();

export function publishEvent(channel: string, payload: unknown): void {
    pubsub.emit(channel, payload);
}

export async function initPgNotifyListener(): Promise<void> {
    const client = new Client({ connectionString: process.env['DATABASE_URL'] });
    try {
        await client.connect();
        await client.query(`LISTEN ${CHANNELS.NOTIFICATION}`);
        await client.query(`LISTEN ${CHANNELS.PROJECT_UPDATE}`);

        client.on('notification', (msg) => {
            if (!msg.payload) return;
            try {
                const payload = JSON.parse(msg.payload);
                publishEvent(msg.channel, payload);
            } catch (err) {
                logger.error('Failed to parse PG NOFIFY payload', { error: err instanceof Error ? err.message : String(err) });
            }
        });
        logger.info('✅ PostgreSQL LISTEN/NOTIFY initialized for GraphQL Subscriptions');
    } catch (err) {
        logger.error('PG NOTIFY connection failed:', { error: err instanceof Error ? err.message : String(err) });
    }
}

export const subscriptionResolvers = {
    Subscription: {
        notificationReceived: {
            subscribe: async function* (
                _: unknown,
                __: unknown,
                context: { user?: { user_id: string } }
            ) {
                if (!context.user) throw new Error('Authentication required');
                const iterator = {
                    [Symbol.asyncIterator]() {
                        return this;
                    },
                    next() {
                        return new Promise((resolve) => {
                            const handler = (payload: any) => {
                                if (payload.user_id === context.user!.user_id) {
                                    pubsub.off(CHANNELS.NOTIFICATION, handler);
                                    resolve({ value: { notificationReceived: payload }, done: false });
                                }
                            };
                            pubsub.on(CHANNELS.NOTIFICATION, handler);
                        });
                    }
                };
                return iterator;
            },
        },
        projectUpdated: {
            subscribe: async function* (
                _: unknown,
                args: { projectId: string },
                context: { user?: { user_id: string } }
            ) {
                if (!context.user) throw new Error('Authentication required');
                const iterator = {
                    [Symbol.asyncIterator]() {
                        return this;
                    },
                    next() {
                        return new Promise((resolve) => {
                            const handler = (payload: any) => {
                                if (payload.project_id === args.projectId) {
                                    pubsub.off(CHANNELS.PROJECT_UPDATE, handler);
                                    resolve({ value: { projectUpdated: payload }, done: false });
                                }
                            };
                            pubsub.on(CHANNELS.PROJECT_UPDATE, handler);
                        });
                    }
                };
                return iterator;
            },
        },
    },
};
