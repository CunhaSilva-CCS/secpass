// Copia identica de src/services/vaultMerge.js (app mobile) - logica de
// merge por item, agnostica de plataforma. Nao alterar sem replicar la.
export const isVaultTombstone = (item) => Boolean(item?.tombstone);

export const getVisibleVaultItems = (items) =>
  (Array.isArray(items) ? items : []).filter((item) => !isVaultTombstone(item));

export const createVaultTombstone = (id, deletedAt = Date.now()) => ({
  id,
  tombstone: true,
  deletedAt,
});

const itemRevision = (item) =>
  Math.max(Number(item?.updatedAt) || 0, Number(item?.deletedAt) || 0);

export const mergeVaultItems = (localItems, remoteItems) => {
  const safeLocal = Array.isArray(localItems) ? localItems : [];
  const safeRemote = Array.isArray(remoteItems) ? remoteItems : [];

  const merged = new Map(safeLocal.map((item) => [item.id, item]));

  for (const remoteItem of safeRemote) {
    const localItem = merged.get(remoteItem.id);
    if (!localItem) {
      merged.set(remoteItem.id, remoteItem);
      continue;
    }

    if (itemRevision(remoteItem) > itemRevision(localItem)) {
      merged.set(remoteItem.id, remoteItem);
    }
  }

  return Array.from(merged.values());
};
