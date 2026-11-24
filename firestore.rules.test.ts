/**
 * Security Rule Verification Suite — The "Dirty Dozen" Payloads
 * Documents and validates the 12 adversarial payloads against firestore.rules.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string | null; email?: string; email_verified?: boolean };
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on User Profile',
    operation: 'create',
    path: '/users/user_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { uid: 'user_1', displayName: 'Buyer', email: 'buyer@example.com', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidUser(data) -> data.keys().hasOnly([...]) rejects isAdmin',
  },
  {
    id: 2,
    name: 'Cross-User PII Read',
    operation: 'get',
    path: '/users/user_1',
    actor: { uid: 'user_2', email: 'other@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'users.get requires request.auth.uid == userId || isAdmin()',
  },
  {
    id: 3,
    name: 'Unverified Admin Email Spoof',
    operation: 'create',
    path: '/products/prod_spoof',
    actor: { uid: 'attacker', email: 'jitendrav56@gmail.com', email_verified: false },
    payload: { name: 'Spoofed Bag' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isBootstrapAdmin() mandates request.auth.token.email_verified == true',
  },
  {
    id: 4,
    name: 'Self-Promotion to Admin',
    operation: 'create',
    path: '/admins/user_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { uid: 'user_1', email: 'buyer@example.com', grantedBy: 'user_1' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'admins.create requires isAdmin()',
  },
  {
    id: 5,
    name: 'Product Price Tampering by Customer',
    operation: 'update',
    path: '/products/prod_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { price: 0.01 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'products.update Tier 2 restricts affectedKeys().hasOnly([stock, updatedAt])',
  },
  {
    id: 6,
    name: 'Inventory Stock Inflation by Customer',
    operation: 'update',
    path: '/products/prod_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { stock: 999 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'products.update Tier 2 enforces incoming().stock < existing().stock',
  },
  {
    id: 7,
    name: 'Orphaned Review Write on Nonexistent Product',
    operation: 'create',
    path: '/products/ghost_product/reviews/rev_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { productId: 'ghost_product', userId: 'user_1', rating: 5 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'reviews.create enforces exists(/databases/$(database)/documents/products/$(productId))',
  },
  {
    id: 8,
    name: 'Review Identity Spoofing',
    operation: 'create',
    path: '/products/prod_1/reviews/rev_2',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { productId: 'prod_1', userId: 'user_2', rating: 1 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'reviews.create enforces incoming().userId == request.auth.uid',
  },
  {
    id: 9,
    name: 'Order State Shortcutting on Create',
    operation: 'create',
    path: '/orders/ord_1',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { userId: 'user_1', status: 'delivered' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'orders.create enforces incoming().status == "placed"',
  },
  {
    id: 10,
    name: 'Terminal Order State Mutation by Customer',
    operation: 'update',
    path: '/orders/ord_delivered',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    payload: { status: 'cancelled' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'orders.update Tier 2 requires existing().status == "placed"',
  },
  {
    id: 11,
    name: 'Unfiltered Cross-Tenant Order Listing',
    operation: 'list',
    path: '/orders',
    actor: { uid: 'user_2', email: 'other@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'orders.list enforces resource.data.userId == request.auth.uid || isBootstrapAdmin()',
  },
  {
    id: 12,
    name: 'ID Poisoning with Oversized/Invalid Path Variable',
    operation: 'create',
    path: '/orders/invalid id!@#',
    actor: { uid: 'user_1', email: 'buyer@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId(orderId) enforces ^[a-zA-Z0-9_\\-]+$ and size <= 128',
  },
];
