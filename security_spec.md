# Kova Goods — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are explicitly denied (`allow read, write: if false;`).
2. **PII Isolation**: `/users/{userId}` and `/orders/{orderId}` contain emails, phone numbers, and shipping addresses; only the owning user (`uid == userId`) or a verified admin may read them.
3. **No Self-Assigned Roles**: Users cannot create or mutate `/admins/{adminId}` or inject `role`/`isAdmin` shadow keys into `/users/{userId}`.
4. **Master Gate for Reviews**: A review at `/products/{productId}/reviews/{reviewId}` can only be created if the parent product document `/products/{productId}` exists and `incoming().productId == productId`.
5. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
6. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on updates; `updatedAt` must equal `request.time` on both creation and updates.
7. **Terminal State Locking**: Once an order reaches `delivered` or `cancelled`, non-admin customers cannot modify it. Customers may only cancel an order while its status is `placed`.
8. **Safe Inventory Decrement**: Verified customers may only decrement `products/{productId}.stock` (never increase it, never drop below 0, max 20 units per transaction) with `affectedKeys().hasOnly(['stock', 'updatedAt'])`. Only admins can create/delete products or edit price/title/description.
9. **Query Enforcement (Zero Client Trust)**: Every `allow list` rule enforces `resource.data` predicates directly without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on User Profile**: Creating `/users/u1` with `{ ..., isAdmin: true }`. Expected: `PERMISSION_DENIED`.
2. **Cross-User PII Read**: Authenticated user `u2` reading `/users/u1`. Expected: `PERMISSION_DENIED`.
3. **Unverified Admin Email Spoof**: User with email `jitendrav56@gmail.com` and `email_verified: false` creating `/products/p1`. Expected: `PERMISSION_DENIED`.
4. **Self-Promotion to Admin**: Customer `u1` creating `/admins/u1`. Expected: `PERMISSION_DENIED`.
5. **Price Tampering by Customer**: Customer `u1` updating `/products/p1` with `{ price: 0.01, updatedAt: serverTimestamp() }`. Expected: `PERMISSION_DENIED`.
6. **Stock Inflation by Customer**: Customer `u1` updating `/products/p1` to increase `stock` from 10 to 999. Expected: `PERMISSION_DENIED`.
7. **Orphaned Review Write**: Customer `u1` creating `/products/nonexistent_prod/reviews/r1`. Expected: `PERMISSION_DENIED`.
8. **Review Identity Spoofing**: Customer `u1` creating a review with `userId: "u2"`. Expected: `PERMISSION_DENIED`.
9. **Order State Shortcutting**: Customer `u1` creating `/orders/o1` with `status: "delivered"` instead of `"placed"`. Expected: `PERMISSION_DENIED`.
10. **Terminal State Mutation**: Customer `u1` updating a `delivered` order back to `cancelled`. Expected: `PERMISSION_DENIED`.
11. **Order Cross-Tenant List Scraping**: Customer `u2` listing `/orders` without filtering to `userId == "u2"`. Expected: `PERMISSION_DENIED`.
12. **Resource / ID Poisoning**: Creating a document with a 300-character document ID or invalid characters (`../bad id`). Expected: `PERMISSION_DENIED`.
