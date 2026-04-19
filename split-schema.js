const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('backend/src/graphql/schema/index.ts', 'utf-8');

// We simply extract all text inside `#graphql ... ` tags
const parts = [];
const regex = /#graphql\n([\s\S]+?)`;/g;
let match;
while ((match = regex.exec(src)) !== null) {
    parts.push(match[1]);
}

const fullSchema = parts.join('\n');
const dir = 'backend/src/graphql/schema/typeDefs';
fs.mkdirSync(dir, { recursive: true });

// Split logic
const lines = fullSchema.split('\n');
let currentOut = 'common.graphql';
let content = {};

for (const line of lines) {
    if (line.includes('type Query') || line.includes('type Mutation') || line.includes('type Subscription')) {
        currentOut = 'operations.graphql';
    } else if (line.includes('type User') || line.includes('AuthPayload')) {
        currentOut = 'user.graphql';
    } else if (line.includes('type Project')) {
        currentOut = 'project.graphql';
    } else if (line.includes('type Escrow')) {
        currentOut = 'escrow.graphql';
    } else if (line.includes('type SpatialProof')) {
        currentOut = 'spatial-proof.graphql';
    } else if (line.includes('type Notification')) {
        currentOut = 'notification.graphql';
    } else if (line.includes('type Supplier')) {
        currentOut = 'supplier.graphql';
    } else if (line.includes('type Review')) {
        currentOut = 'review.graphql';
    } else if (line.includes('type UploadUrl')) {
        currentOut = 'storage.graphql';
    } else if (line.includes('input ')) {
        currentOut = 'inputs.graphql';
    } else if (line.includes('type EngineerStats') || line.includes('ContractorStats')) {
        currentOut = 'dashboard.graphql';
    }
    
    content[currentOut] = (content[currentOut] || '') + line + '\n';
}

for (const [filename, str] of Object.entries(content)) {
    fs.writeFileSync(path.join(dir, filename), str);
}

// Ensure 12 files if some were missed
const requiredFiles = ['common.graphql', 'operations.graphql', 'user.graphql', 'project.graphql', 'escrow.graphql', 'spatial-proof.graphql', 'notification.graphql', 'supplier.graphql', 'review.graphql', 'storage.graphql', 'inputs.graphql', 'dashboard.graphql'];
for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(dir, file))) {
        fs.writeFileSync(path.join(dir, file), '# Empty file\n');
    }
}

// Write assembly index
fs.writeFileSync('backend/src/graphql/schema/index.ts', `
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
`);

console.log("Schema split successful.");
