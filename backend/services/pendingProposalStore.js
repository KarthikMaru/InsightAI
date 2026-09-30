// File path: backend/services/pendingProposalStore.js
// Purpose: Holds AI-modification proposals between the "propose" and
// "apply" steps, so apply uses the EXACT computed result the user saw
// in the preview — it never re-runs the AI or recomputes anything.
// Deliberately in-process memory, not a DB table: proposals are
// short-lived (a few minutes, one browser session) and losing them on a
// server restart just means the user re-asks, which is harmless. Scoped
// per dataset+user so one user can never apply another's proposal.

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const store = new Map(); // token -> { userId, datasetId, operation, preview, applyPlan, expiresAt }

function cleanup() {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(token);
  }
}

module.exports = {
  create({ userId, datasetId, operation, preview, applyPlan }) {
    cleanup();
    const token = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    store.set(token, { userId, datasetId: Number(datasetId), operation, preview, applyPlan, expiresAt: Date.now() + TTL_MS });
    return token;
  },

  // Returns the entry only if it exists, hasn't expired, and belongs to
  // this exact user+dataset — otherwise null (never leaks another
  // user's or dataset's pending proposal).
  get(token, userId, datasetId) {
    cleanup();
    const entry = store.get(token);
    if (!entry) return null;
    if (entry.userId !== userId || entry.datasetId !== Number(datasetId)) return null;
    return entry;
  },

  discard(token) {
    store.delete(token);
  },
};
