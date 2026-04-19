
import { makeExecutableSchema } from '@graphql-tools/schema';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { resolvers } from '../resolvers/index';
import {
    authDirectiveTypeDef,
    authDirectiveTransformer,
    rateLimitDirectiveTypeDef,
    rateLimitDirectiveTransformer,
} from '../directives/index';

const TYPE_DEFS_DIR = join(__dirname, 'typeDefs');

function loadTypeDefs(): string[] {
    const files = readdirSync(TYPE_DEFS_DIR)
        .filter((f) => f.endsWith('.graphql'))
        .sort();

    return files.map((file) => {
        return readFileSync(join(TYPE_DEFS_DIR, file), 'utf-8');
    });
}

const typeDefs = [
    authDirectiveTypeDef,
    rateLimitDirectiveTypeDef,
    ...loadTypeDefs(),
];

let schema = makeExecutableSchema({ typeDefs, resolvers });

schema = authDirectiveTransformer(schema);
schema = rateLimitDirectiveTransformer(schema);

export { schema, typeDefs, resolvers };
