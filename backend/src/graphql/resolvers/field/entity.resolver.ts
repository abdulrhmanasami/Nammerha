import type { GQLContext } from '../../context/auth.context';

export const reviewFieldResolvers = {
    Review: {
        reviewer: async (
            parent: { reviewerId: string },
            _args: unknown,
            context: GQLContext,
        ) => {
            if (!parent.reviewerId) return null;
            return context.loaders.userLoader.load(parent.reviewerId);
        },
    },
};

export const spatialProofFieldResolvers = {
    SpatialProof: {
        engineer: async (
            parent: { engineerId: string },
            _args: unknown,
            context: GQLContext,
        ) => {
            if (!parent.engineerId) return null;
            return context.loaders.userLoader.load(parent.engineerId);
        },
    },
};
