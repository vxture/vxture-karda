import type {Catalog} from '../catalog';
export const identityCenter={
  "matchName":{"zh-CN":"\u540d\u79f0\u6216\u522b\u540d\u4e00\u81f4","en-US":"Matching name or alias"},
  "matchExternal":{"zh-CN":"\u4e1a\u52a1\u6807\u8bc6\u4e00\u81f4","en-US":"Matching business identifier"},
  "views":{"zh-CN":"\u5173\u8054\u5c55\u793a\u89c6\u56fe","en-US":"Related presentation views"},
  "services":{"zh-CN":"\u5173\u8054\u77e5\u8bc6\u670d\u52a1","en-US":"Related knowledge services"},
  "unresolved":{"zh-CN":"\u672a\u89e3\u51b3\u51b2\u7a81","en-US":"Unresolved conflicts"},
  "before":{"zh-CN":"\u53d8\u66f4\u524d","en-US":"Before"},
  "after":{"zh-CN":"\u53d8\u66f4\u540e","en-US":"After"},
  "suppressed":{"zh-CN":"\u6682\u505c\u4ea4\u4ed8\u7684\u5173\u7cfb","en-US":"Withheld relations"},
  "retained":{"zh-CN":"\u539f\u59cb\u8bb0\u5f55\u4e0e\u8bc1\u636e\u4fdd\u7559\uff1b\u6062\u590d\u7248\u672c\u9700\u91cd\u65b0\u53d1\u5e03\u3002","en-US":"Original records and evidence are retained. Restored versions require publication."},
  "createEntity":{"zh-CN":"\u65b0\u5efa\u72ec\u7acb\u5b9e\u4f53","en-US":"Create distinct entity"},
  "title": {
    "zh-CN": "\u5b9e\u4f53\u8eab\u4efd\u4e0e\u77e5\u8bc6\u4e00\u81f4\u6027\u4e2d\u5fc3",
    "en-US": "Entity identity and consistency"
  },
  "hint": {
    "zh-CN": "\u5148\u4fdd\u5b58\u6cbb\u7406\u8349\u7a3f\uff0c\u518d\u9884\u89c8\u53d1\u5e03\u3002\u539f\u59cb\u5b9e\u4f53\u3001\u65ad\u8a00\u548c\u8bc1\u636e\u4fdd\u7559\uff0c\u5408\u5e76\u4e0e\u88c1\u51b3\u53ea\u901a\u8fc7\u5df2\u53d1\u5e03\u6cbb\u7406\u7248\u672c\u751f\u6548\u3002",
    "en-US": "Save governance drafts, then preview and publish. Original entities, assertions and evidence are preserved."
  },
  "refresh": {
    "zh-CN": "\u5237\u65b0",
    "en-US": "Refresh"
  },
  "graph": {
    "zh-CN": "\u56fe\u8c31\u5de5\u4f5c\u53f0",
    "en-US": "Graph studio"
  },
  "entities": {
    "zh-CN": "\u5b9e\u4f53\u8eab\u4efd\u6863\u6848",
    "en-US": "Entity profiles"
  },
  "select": {
    "zh-CN": "\u9009\u62e9\u5b9e\u4f53",
    "en-US": "Select entity"
  },
  "name": {
    "zh-CN": "\u6807\u51c6\u540d\u79f0",
    "en-US": "Canonical name"
  },
  "kind": {
    "zh-CN": "\u5b9e\u4f53\u7c7b\u578b",
    "en-US": "Entity type"
  },
  "aliases": {
    "zh-CN": "\u522b\u540d\uff08\u6bcf\u884c\u4e00\u4e2a\uff09",
    "en-US": "Aliases (one per line)"
  },
  "external": {
    "zh-CN": "\u4e1a\u52a1\u6807\u8bc6\uff08\u6bcf\u884c \u547d\u540d\u7a7a\u95f4=\u503c\uff09",
    "en-US": "Business identifiers (namespace=value per line)"
  },
  "save": {
    "zh-CN": "\u4fdd\u5b58\u8eab\u4efd\u8349\u7a3f",
    "en-US": "Save identity draft"
  },
  "note": {
    "zh-CN": "\u64cd\u4f5c\u7406\u7531\uff08\u5fc5\u586b\uff09",
    "en-US": "Reason (required)"
  },
  "duplicates": {
    "zh-CN": "\u7591\u4f3c\u91cd\u590d\u5b9e\u4f53",
    "en-US": "Duplicate candidates"
  },
  "reasons": {
    "zh-CN": "\u5339\u914d\u7406\u7531",
    "en-US": "Match reasons"
  },
  "merge": {
    "zh-CN": "\u5408\u5e76\u5de6\u4fa7\u5230\u53f3\u4fa7",
    "en-US": "Merge left into right"
  },
  "reject": {
    "zh-CN": "\u62d2\u7edd",
    "en-US": "Reject"
  },
  "defer": {
    "zh-CN": "\u6682\u7f13",
    "en-US": "Defer"
  },
  "reopen": {
    "zh-CN": "\u91cd\u65b0\u5904\u7406",
    "en-US": "Reopen"
  },
  "links": {
    "zh-CN": "\u5408\u5e76\u6620\u5c04\u4e0e\u62c6\u5206",
    "en-US": "Identity mappings and splits"
  },
  "split": {
    "zh-CN": "\u89e3\u9664\u6b64\u6620\u5c04\uff0f\u62c6\u5206",
    "en-US": "Remove mapping / split"
  },
  "from": {
    "zh-CN": "\u539f\u5b9e\u4f53",
    "en-US": "Original entity"
  },
  "to": {
    "zh-CN": "\u5f52\u5c5e\u5b9e\u4f53",
    "en-US": "Canonical entity"
  },
  "manualMerge": {
    "zh-CN": "\u9884\u89c8\u6240\u9009\u5b9e\u4f53\u5408\u5e76",
    "en-US": "Preview selected merge"
  },
  "constraints": {
    "zh-CN": "\u5355\u503c\u5173\u7cfb\u7ea6\u675f",
    "en-US": "Single-value relation constraints"
  },
  "constraintHint": {
    "zh-CN": "\u4ec5\u52fe\u9009\u4e1a\u52a1\u4e0a\u660e\u786e\u53ea\u80fd\u6709\u4e00\u4e2a\u503c\u7684\u5173\u7cfb\u7c7b\u578b\uff1b\u666e\u901a\u591a\u503c\u5173\u7cfb\u4e0d\u81ea\u52a8\u5224\u4e3a\u51b2\u7a81\u3002",
    "en-US": "Select only relation types that have one value by business definition."
  },
  "saveConstraints": {
    "zh-CN": "\u4fdd\u5b58\u7ea6\u675f\u8349\u7a3f",
    "en-US": "Save constraint draft"
  },
  "conflicts": {
    "zh-CN": "\u4e8b\u5b9e\u51b2\u7a81\u4e0e\u88c1\u51b3",
    "en-US": "Fact conflicts and decisions"
  },
  "facts": {
    "zh-CN": "\u5173\u7cfb\u4e8b\u5b9e\u4e0e\u6765\u6e90\u8bc1\u636e",
    "en-US": "Relations and source evidence"
  },
  "outcome": {
    "zh-CN": "\u88c1\u51b3\u7ed3\u679c",
    "en-US": "Decision"
  },
  "accept": {
    "zh-CN": "\u91c7\u7eb3\u9009\u4e2d\u9879",
    "en-US": "Accept selected winner"
  },
  "supersede": {
    "zh-CN": "\u9009\u4e2d\u9879\u66ff\u4ee3\u5176\u4ed6\u9879",
    "en-US": "Selected winner supersedes others"
  },
  "coexist": {
    "zh-CN": "\u5141\u8bb8\u5e76\u5b58",
    "en-US": "Allow coexistence"
  },
  "pending": {
    "zh-CN": "\u5f85\u6838\u5b9e\uff08\u6682\u505c\u4ea4\u4ed8\uff09",
    "en-US": "Pending verification (withhold)"
  },
  "winner": {
    "zh-CN": "\u91c7\u7eb3\uff0f\u66ff\u4ee3\u5173\u7cfb",
    "en-US": "Winning relation"
  },
  "scope": {
    "zh-CN": "\u9002\u7528\u8303\u56f4\uff1a\u5f53\u524d\u77e5\u8bc6\u5e93",
    "en-US": "Scope: current library"
  },
  "validFrom": {
    "zh-CN": "\u88c1\u51b3\u751f\u6548\u65f6\u95f4\uff08\u53ef\u9009\uff09",
    "en-US": "Decision effective from (optional)"
  },
  "validUntil": {
    "zh-CN": "\u88c1\u51b3\u5931\u6548\u65f6\u95f4\uff08\u53ef\u9009\uff09",
    "en-US": "Decision effective until (optional)"
  },
  "decide": {
    "zh-CN": "\u9884\u89c8\u88c1\u51b3",
    "en-US": "Preview decision"
  },
  "clearDecision": {
    "zh-CN": "\u79fb\u9664\u88c1\u51b3\u8349\u7a3f",
    "en-US": "Remove draft decision"
  },
  "versions": {
    "zh-CN": "\u6cbb\u7406\u7248\u672c\u4e0e\u751f\u6548\u72b6\u6001",
    "en-US": "Governance versions and state"
  },
  "publish": {
    "zh-CN": "\u9884\u89c8\u53d1\u5e03",
    "en-US": "Preview publication"
  },
  "stop": {
    "zh-CN": "\u9884\u89c8\u505c\u7528",
    "en-US": "Preview stop"
  },
  "restore": {
    "zh-CN": "\u6062\u590d\u6240\u9009\u7248\u672c\u5230\u8349\u7a3f",
    "en-US": "Restore selected version to draft"
  },
  "preview": {
    "zh-CN": "\u5f71\u54cd\u9884\u89c8",
    "en-US": "Impact preview"
  },
  "confirm": {
    "zh-CN": "\u6211\u5df2\u6838\u5bf9\u8eab\u4efd\u3001\u4e8b\u5b9e\u548c\u6765\u6e90\u5f71\u54cd",
    "en-US": "I reviewed identity, fact and source impacts"
  },
  "apply": {
    "zh-CN": "\u786e\u8ba4\u6267\u884c",
    "en-US": "Confirm operation"
  },
  "cancel": {
    "zh-CN": "\u53d6\u6d88\u9884\u89c8",
    "en-US": "Cancel preview"
  },
  "history": {
    "zh-CN": "\u64cd\u4f5c\u5386\u53f2",
    "en-US": "Operation history"
  },
  "empty": {
    "zh-CN": "\u6682\u65e0\u8bb0\u5f55",
    "en-US": "No records"
  },
  "failed": {
    "zh-CN": "\u64cd\u4f5c\u672a\u5b8c\u6210\u3002\u8bf7\u5237\u65b0\u540e\u68c0\u67e5\u6743\u9650\u3001\u7248\u672c\u6216\u8bc1\u636e\u53d8\u5316\uff0c\u518d\u91cd\u8bd5\u3002",
    "en-US": "Operation failed. Refresh and check access, versions or evidence changes."
  },
  "done": {
    "zh-CN": "\u64cd\u4f5c\u5df2\u5b8c\u6210",
    "en-US": "Operation completed"
  },
  "revision": {
    "zh-CN": "\u8349\u7a3f\u4fee\u8ba2",
    "en-US": "Draft revision"
  },
  "active": {
    "zh-CN": "\u751f\u6548\u7248\u672c",
    "en-US": "Active version"
  },
  "stale": {
    "zh-CN": "\u5b58\u5728\u5931\u6548\u88c1\u51b3\uff0c\u8bf7\u6e05\u9664\u6216\u91cd\u65b0\u88c1\u51b3\u540e\u518d\u53d1\u5e03\u3002",
    "en-US": "Some decisions are stale. Remove or review them before publishing."
  },
  "search": {
    "zh-CN": "\u6309\u540d\u79f0\u3001\u522b\u540d\u6216ID\u7b5b\u9009",
    "en-US": "Filter by name, alias or ID"
  },
  "assertions": {
    "zh-CN": "\u65ad\u8a00",
    "en-US": "Assertions"
  },
  "evidence": {
    "zh-CN": "\u8bc1\u636e",
    "en-US": "Evidence"
  },
  "current": {
    "zh-CN": "\u5f53\u524d\u72b6\u6001",
    "en-US": "Current state"
  },
  "draft": {
    "zh-CN": "\u8349\u7a3f",
    "en-US": "Draft"
  },
  "none": {
    "zh-CN": "\u672a\u542f\u7528",
    "en-US": "Inactive"
  },
  "indexes": {
    "zh-CN": "\u56fe\u7d22\u5f15\u66f4\u65b0\u72b6\u6001",
    "en-US": "Graph index update status"
  },
  "status_open": {
    "zh-CN": "\u5f85\u5904\u7406",
    "en-US": "Open"
  },
  "status_stale": {
    "zh-CN": "\u9700\u590d\u6838",
    "en-US": "Needs review"
  },
  "status_reject": {
    "zh-CN": "\u5df2\u62d2\u7edd",
    "en-US": "Rejected"
  },
  "status_defer": {
    "zh-CN": "\u5df2\u6682\u7f13",
    "en-US": "Deferred"
  },
  "status_accept": {
    "zh-CN": "\u5df2\u91c7\u7eb3",
    "en-US": "Accepted"
  },
  "status_supersede": {
    "zh-CN": "\u5df2\u66ff\u4ee3",
    "en-US": "Superseded"
  },
  "status_coexist": {
    "zh-CN": "\u5141\u8bb8\u5e76\u5b58",
    "en-US": "Coexisting"
  },
  "status_pending": {
    "zh-CN": "\u5f85\u6838\u5b9e",
    "en-US": "Pending verification"
  },
  "metadata": {
    "zh-CN": "\u5f71\u54cd\u8303\u56f4\u4e0e\u8bb0\u5f55",
    "en-US": "Impact and records"
  },
  "source": {
    "zh-CN": "\u6765\u6e90\u6587\u6863",
    "en-US": "Source document"
  },
  "manual": {
    "zh-CN": "\u624b\u52a8\u5408\u5e76\u4e0e\u8eab\u4efd\u6620\u5c04",
    "en-US": "Manual merge and mapping"
  },
  "relationSelection": {
    "zh-CN": "\u9009\u62e9\u9700\u8981\u88c1\u51b3\u7684\u5173\u7cfb\u4e8b\u5b9e",
    "en-US": "Select relations to adjudicate"
  },
  "diff": {
    "zh-CN": "\u4e0e\u5f53\u524d\u751f\u6548\u7248\u672c\u7684\u5dee\u5f02",
    "en-US": "Changes from active version"
  },
  "affected": {
    "zh-CN": "\u53d7\u5f71\u54cd\u5173\u7cfb\u6570",
    "en-US": "Affected relation count"
  }
} satisfies Catalog;
