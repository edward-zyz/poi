import { describe, expect, it } from "vitest";

import { parseKeywords } from "./keywords";

describe("parseKeywords", () => {
  it("deduplicates and trims keywords", () => {
    const result = parseKeywords("喜茶, 奈雪的茶, 喜茶");
    expect(result).toEqual(["喜茶", "奈雪的茶"]);
  });

  it("handles multiple separators", () => {
    const result = parseKeywords("星巴克 奈雪的茶;蜜雪冰城");
    expect(result).toEqual(["星巴克", "奈雪的茶", "蜜雪冰城"]);
  });
});
