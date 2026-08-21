import { createItemId } from "../src/utils/createItemId";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createItemId", () => {
  it("gera UUIDs v4 distintos", () => {
    const first = createItemId();
    const second = createItemId();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });
});
