# PHASE 4D ROLLBACK INSTRUCTIONS (HARDENED SECURITY POLICY)

### Core Invariants
1. **NEVER REINTRODUCE UNAUTHENTICATED PRIVATE FILE ACCESS**: Under no circumstances should `app.use('/uploads', express.static(...))` be restored for private documents, payment proofs, or tenant data.
2. **PRESERVE AUTHENTICATED FILE CONTROLLER**: Any code rollback must retain the authenticated, tenant-authorized file access gateway (`getAuthorizedProofFile`).
3. **PRESERVE TENANT AUTHORIZATION**: Tenant isolation gates (`req.user.tenantId === payment.tenantId` or platform admin) must never be bypassed during rollback.
4. **STORAGE ABSTRACTION REVERSION (IF REQUIRED)**: If reverting storage abstraction logic, fall back to local disk streaming within the authenticated controller; do NOT revert to public static serving.
5. **PUBLIC ASSETS ONLY**: Only assets explicitly classified as public (e.g. system branding, public favicons) may use static serving.
6. **NO DATABASE ROLLBACK NEEDED**: Phase 4D performed zero index deletions and zero schema mutations on source collections.
