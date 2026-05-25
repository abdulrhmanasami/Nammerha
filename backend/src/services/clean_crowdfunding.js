const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'crowdfunding.service.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace donor terminology
content = content.replace(/Path 2: Donor → Escrow/g, 'Path 2: User → Escrow');
content = content.replace(/Donor browses marketplace/g, 'User browses marketplace');
content = content.replace(/Donor selects specific/g, 'User selects specific');
content = content.replace(/donor marketplace/g, 'public marketplace');
content = content.replace(/Donor Basket/g, 'Shopping Basket');
content = content.replace(/donor basket UI/g, 'shopping basket UI');
content = content.replace(/a donor's contribution/g, "a user's contribution");
content = content.replace(/donorId/g, 'userId');
content = content.replace(/donor_id/g, 'user_id');
content = content.replace(/Donor Queries/g, 'User Queries');
content = content.replace(/getDonorEscrowSummary/g, 'getUserEscrowSummary');
content = content.replace(/vw_donor_escrow_summary/g, 'vw_user_escrow_summary');
content = content.replace(/donors see supplier name/g, 'users see supplier name');
content = content.replace(/donor's wallet/g, "user's wallet");
content = content.replace(/donor's escrow summary/g, "user's escrow summary");

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully updated crowdfunding.service.ts with donor terminology eradication.');
