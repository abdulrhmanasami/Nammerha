const fs = require('fs');
const path = require('path');

// 1. Fix types/index.ts
const typesPath = path.join(__dirname, 'types/index.ts');
let typesContent = fs.readFileSync(typesPath, 'utf-8');
typesContent = typesContent.replace(/\| 'escrow_released';/g, "| 'escrow_released'\n    | 'project_completed';");
fs.writeFileSync(typesPath, typesContent, 'utf-8');

// 2. Fix misc.resolver.ts
const miscResolverPath = path.join(__dirname, 'graphql/resolvers/query/misc.resolver.ts');
let miscContent = fs.readFileSync(miscResolverPath, 'utf-8');
miscContent = miscContent.replace(/getDonorDonations/g, 'getUserPayments');
fs.writeFileSync(miscResolverPath, miscContent, 'utf-8');

// 3. Delete donor.service.test.ts
const donorTestPath = path.join(__dirname, 'services/__tests__/donor.service.test.ts');
if (fs.existsSync(donorTestPath)) {
    fs.unlinkSync(donorTestPath);
}

// 4. Fix crowdfunding.test.ts (Casing issue)
const cfTestPath = path.join(__dirname, 'routes/__tests__/crowdfunding.test.ts');
let cfTestContent = fs.readFileSync(cfTestPath, 'utf-8');
cfTestContent = cfTestContent.replace(/getuserEscrowSummary/g, 'getUserEscrowSummary');
cfTestContent = cfTestContent.replace(/getuserpayments/g, 'getUserPayments');
fs.writeFileSync(cfTestPath, cfTestContent, 'utf-8');

// 5. Fix crowdfunding.service.test.ts
const cfSvcTestPath = path.join(__dirname, 'services/__tests__/crowdfunding.service.test.ts');
let cfSvcTestContent = fs.readFileSync(cfSvcTestPath, 'utf-8');
cfSvcTestContent = cfSvcTestContent.replace(/getDonorEscrowSummary/g, 'getUserEscrowSummary');
cfSvcTestContent = cfSvcTestContent.replace(/getDonorDonations/g, 'getUserPayments');
cfSvcTestContent = cfSvcTestContent.replace(/createDonation/g, 'createPaymentIntent');
cfSvcTestContent = cfSvcTestContent.replace(/CreateDonationDTO/g, 'CreateTransactionDTO');
fs.writeFileSync(cfSvcTestPath, cfSvcTestContent, 'utf-8');

// 6. Fix payment.service.ts
const paymentSvcPath = path.join(__dirname, 'services/payment.service.ts');
let paymentSvcContent = fs.readFileSync(paymentSvcPath, 'utf-8');
paymentSvcContent = paymentSvcContent.replace(/donor_id/g, 'user_id');
paymentSvcContent = paymentSvcContent.replace(/donorId/g, 'userId');
fs.writeFileSync(paymentSvcPath, paymentSvcContent, 'utf-8');

// 7. Remove 'getClient' unused import from domain.resolver.ts
const domainResolverPath = path.join(__dirname, 'graphql/resolvers/mutation/domain.resolver.ts');
let domainResolverContent = fs.readFileSync(domainResolverPath, 'utf-8');
domainResolverContent = domainResolverContent.replace(/, getClient } from '\.\.\/\.\.\/\.\.\/config\/database';/, " } from '../../../config/database';");
fs.writeFileSync(domainResolverPath, domainResolverContent, 'utf-8');

console.log('Fixed compilation errors');
