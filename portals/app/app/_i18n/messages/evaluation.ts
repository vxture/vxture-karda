import type { Catalog } from "../catalog";

// Evaluation: the steward queue and the evaluation sets.
//
// Only the FAILURE wording is here so far. `Failure.fb` takes an unresolved
// message pair rather than a finished sentence, so every catch site in the app
// needs a catalog entry even when its own surface has not been swept yet -
// which is why this namespace exists ahead of its domain's sweep.
export const evaluation = {
  errQueue: { "zh-CN": "待复验队列加载失败。", "en-US": "Could not load the re-verification queue." },
  errVerify: { "zh-CN": "验证失败。", "en-US": "Verification failed." },
  errSweep: { "zh-CN": "续验扫描失败。", "en-US": "The re-verification sweep failed." },
  errSets: { "zh-CN": "评测集加载失败。", "en-US": "Could not load the evaluation sets." },
  errSetDetail: { "zh-CN": "评测集详情加载失败。", "en-US": "Could not load the evaluation set." },
  errCreateSet: { "zh-CN": "新建失败。", "en-US": "Could not create it." },
  errAdd: { "zh-CN": "添加失败。", "en-US": "Could not add it." },
  errRun: { "zh-CN": "运行失败。", "en-US": "The run failed." },
  errDetail: { "zh-CN": "明细加载失败。", "en-US": "Could not load the details." },
} satisfies Catalog;
