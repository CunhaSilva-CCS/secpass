import {
  getVisibleVaultItems,
  mergeVaultItems,
} from "../src/services/vaultMerge";

describe("mergeVaultItems", () => {
  it("mantem itens so locais e so remotos", () => {
    const local = [{ id: "1", title: "Local", updatedAt: 10 }];
    const remote = [{ id: "2", title: "Remoto", updatedAt: 20 }];

    const merged = mergeVaultItems(local, remote);

    expect(merged).toEqual(expect.arrayContaining([local[0], remote[0]]));
    expect(merged).toHaveLength(2);
  });

  it("mantem a versao local quando ela e mais recente", () => {
    const local = [{ id: "1", title: "Editado localmente", updatedAt: 50 }];
    const remote = [{ id: "1", title: "Versao antiga", updatedAt: 10 }];

    const merged = mergeVaultItems(local, remote);

    expect(merged).toEqual([local[0]]);
  });

  it("usa a versao remota quando ela e mais recente", () => {
    const local = [{ id: "1", title: "Versao antiga", updatedAt: 10 }];
    const remote = [{ id: "1", title: "Editado no outro aparelho", updatedAt: 50 }];

    const merged = mergeVaultItems(local, remote);

    expect(merged).toEqual([remote[0]]);
  });

  it("trata itens sem updatedAt como os mais antigos", () => {
    const local = [{ id: "1", title: "Sem timestamp" }];
    const remote = [{ id: "1", title: "Com timestamp", updatedAt: 1 }];

    const merged = mergeVaultItems(local, remote);

    expect(merged).toEqual([remote[0]]);
  });

  it("lida com listas vazias/invalidas sem lancar erro", () => {
    expect(mergeVaultItems(undefined, undefined)).toEqual([]);
    expect(mergeVaultItems([{ id: "1" }], null)).toEqual([{ id: "1" }]);
    expect(mergeVaultItems(null, [{ id: "1" }])).toEqual([{ id: "1" }]);
  });

  it("mantem tombstone local quando o remoto ainda tem o item antigo", () => {
    const local = [{ id: "1", tombstone: true, deletedAt: 80 }];
    const remote = [{ id: "1", title: "Ainda vivo", updatedAt: 20 }];

    expect(mergeVaultItems(local, remote)).toEqual(local);
  });

  it("usa tombstone remoto quando a exclusao e mais recente", () => {
    const local = [{ id: "1", title: "Ainda vivo", updatedAt: 20 }];
    const remote = [{ id: "1", tombstone: true, deletedAt: 80 }];

    expect(mergeVaultItems(local, remote)).toEqual(remote);
  });

  it("ressuscita o item se a edicao remota for posterior ao tombstone", () => {
    const local = [{ id: "1", tombstone: true, deletedAt: 20 }];
    const remote = [{ id: "1", title: "Recriado", updatedAt: 80 }];

    expect(mergeVaultItems(local, remote)).toEqual(remote);
  });

  it("oculta tombstones na lista visivel", () => {
    const items = [
      { id: "1", title: "Vivo" },
      { id: "2", tombstone: true, deletedAt: 1 },
    ];

    expect(getVisibleVaultItems(items)).toEqual([{ id: "1", title: "Vivo" }]);
  });
});
