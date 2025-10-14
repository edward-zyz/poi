export const baseBrands = [
  "蜜雪冰城",
  "华莱士",
  "瑞幸咖啡",
  "绝味鸭脖",
  "正新鸡排",
  "肯德基",
  "古茗",
  "书亦烧仙草",
  "星巴克",
  "麦当劳",
  "茶百道",
  "海底捞",
  "沪上阿姨",
  "必胜客",
  "德克士",
  "锅圈食汇",
  "奈雪的茶",
  "甜啦啦",
  "老乡鸡",
  "张亮麻辣烫",
  "塔斯汀"
];

export function suggestBrands(input: string, limit = 5): string[] {
  const term = input.trim();
  if (!term) return baseBrands.slice(0, limit);
  return baseBrands
    .filter((brand) => brand.includes(term))
    .slice(0, limit);
}
