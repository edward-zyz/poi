import process from "node:process";

import { loadConfig } from "../settings/config.js";
import { GaodeProvider } from "../providers/gaodeProvider.js";

function parseArgs(): { keyword: string; city: string } {
  const [, , ...rest] = process.argv;
  let keyword = "";
  let city = "";

  for (const arg of rest) {
    if (arg.startsWith("--keyword=")) {
      keyword = arg.replace("--keyword=", "").trim();
    } else if (arg.startsWith("--city=")) {
      city = arg.replace("--city=", "").trim();
    } else if (!keyword) {
      keyword = arg.trim();
    } else if (!city) {
      city = arg.trim();
    }
  }

  return {
    keyword: keyword || "喜茶",
    city: city || "上海市",
  };
}

async function main(): Promise<void> {
  const { keyword, city } = parseArgs();
  const config = loadConfig();

  if (!config.gaode.apiKey) {
    throw new Error("缺少高德 Web 服务 API key，请先设置 GAODE_API_KEY 环境变量。");
  }

  const provider = new GaodeProvider({ config: config.gaode });
  console.log(`[Gaode] keyword="${keyword}" city="${city}"`);

  const results = await provider.placeTextSearch({ keywords: keyword, city });
  console.log(JSON.stringify(results, null, 2));

  console.log(`共返回 ${results.length} 条 POI 数据。`);
}

main().catch((error) => {
  console.error("[Gaode] 调用失败：", error);
  process.exit(1);
});
