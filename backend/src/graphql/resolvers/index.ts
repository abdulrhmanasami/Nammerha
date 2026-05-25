import { customScalars } from '../scalars/index';
import { marketplaceQueryResolvers, projectFieldResolvers } from './query/marketplace.resolver';
import { dashboardQueryResolvers } from './query/dashboard.resolver';
import { miscQueryResolvers } from './query/misc.resolver';
import { authQueryResolvers, authMutationResolvers } from './mutation/auth.resolver';
import {
  projectMutationResolvers,
  spatialProofMutationResolvers,
  escrowMutationResolvers,
  storageMutationResolvers,
  notificationMutationResolvers,
  supplierMutationResolvers,
  reviewMutationResolvers,
} from './mutation/domain.resolver';
import { subscriptionResolvers } from './subscription/notification.resolver';
import { reviewFieldResolvers, spatialProofFieldResolvers } from './field/entity.resolver';

export const resolvers = {
  ...customScalars,
  Query: {
    ...marketplaceQueryResolvers,
    ...authQueryResolvers,
    ...dashboardQueryResolvers,
    ...miscQueryResolvers,
  },
  Mutation: {
    ...authMutationResolvers,
    ...projectMutationResolvers,
    ...spatialProofMutationResolvers,
    ...escrowMutationResolvers,
    ...storageMutationResolvers,
    ...notificationMutationResolvers,
    ...supplierMutationResolvers,
    ...reviewMutationResolvers,
  },
  ...projectFieldResolvers,
  ...reviewFieldResolvers,
  ...spatialProofFieldResolvers,
  ...subscriptionResolvers,
};
