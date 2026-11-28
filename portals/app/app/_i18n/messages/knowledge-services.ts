export const knowledgeServices = {
 context:{"zh-CN":"\u4efb\u52a1\u4e0a\u4e0b\u6587\u7ec4\u88c5","en-US":"Task context assembly"},
  "title": {
    "zh-CN": "\u667a\u80fd\u4f53\u77e5\u8bc6\u670d\u52a1\u4e2d\u5fc3",
    "en-US": "Agent knowledge services"
  },
  "lead": {
    "zh-CN": "\u5c06\u77e5\u8bc6\u8303\u56f4\u548c\u6d88\u8d39\u7b56\u7565\u53d1\u5e03\u4e3a\u53ef\u8c03\u7528\u670d\u52a1\u3002\u914d\u7f6e\u4e0d\u6388\u4e88\u6743\u9650\uff0c\u6bcf\u6b21\u8c03\u7528\u590d\u6838\u5f53\u524d\u8eab\u4efd\u3001\u6302\u8f7d\u548c\u6765\u6e90\u3002",
    "en-US": "Publish knowledge scope and policies as callable services. Each call rechecks identity, attachments and sources."
  },
  "newService": {
    "zh-CN": "\u65b0\u5efa\u670d\u52a1",
    "en-US": "New service"
  },
  "name": {
    "zh-CN": "\u670d\u52a1\u540d\u79f0",
    "en-US": "Service name"
  },
  "description": {
    "zh-CN": "\u8bf4\u660e",
    "en-US": "Description"
  },
  "scope": {
    "zh-CN": "\u77e5\u8bc6\u5e93\u8303\u56f4\uff08\u5df2\u6302\u8f7d\u4e14\u5f53\u524d\u53ef\u8bfb\uff09",
    "en-US": "Library scope (attached and currently readable)"
  },
  "caps": {
    "zh-CN": "\u5f00\u653e\u80fd\u529b",
    "en-US": "Capabilities"
  },
  "facts": {
    "zh-CN": "\u5df2\u53d1\u5e03\u4e8b\u5b9e\u68c0\u7d22",
    "en-US": "Published fact search"
  },
  "topics": {
    "zh-CN": "\u4e3b\u9898\u77e5\u8bc6\u4e0e\u4eba\u5de5\u8ba4\u53ef\u6458\u8981",
    "en-US": "Topic knowledge and accepted summaries"
  },
  "source": {
    "zh-CN": "\u7cbe\u786e\u539f\u6587\u68c0\u7d22",
    "en-US": "Exact source search"
  },
  "package": {
    "zh-CN": "\u7ed3\u6784\u5316\u77e5\u8bc6\u5305",
    "en-US": "Structured knowledge package"
  },
  "fallback": {
    "zh-CN": "\u4e8b\u5b9e\u65e0\u547d\u4e2d\u65f6\u56de\u9000\u539f\u6587",
    "en-US": "Fall back to source on no fact matches"
  },
  "verification": {
    "zh-CN": "\u539f\u6587\u68c0\u7d22/\u56de\u9000\u6838\u9a8c\u7b49\u7ea7",
    "en-US": "Source search/fallback verification tier"
  },
  "verificationHint": {
    "zh-CN": "\u5df2\u53d1\u5e03\u4e8b\u5b9e\u3001\u4e3b\u9898\u548c\u77e5\u8bc6\u5305\u4f7f\u7528\u65e2\u6709\u5ba1\u6838\u4e0e\u6765\u6e90\u6821\u9a8c\uff0c\u4e0d\u652f\u6301\u6309\u6b64\u539f\u6587\u7b49\u7ea7\u989d\u5916\u8fc7\u6ee4\u3002",
    "en-US": "Facts, topics and packages use their existing review/source checks; this tier applies only to source retrieval."
  },
  "verified_only": {
    "zh-CN": "\u4ec5\u5df2\u6838\u9a8c\u539f\u6587",
    "en-US": "Verified sources only"
  },
  "verified_and_untracked": {
    "zh-CN": "\u5df2\u6838\u9a8c\u53ca\u672a\u8ddf\u8e2a\u539f\u6587",
    "en-US": "Verified and untracked sources"
  },
  "all": {
    "zh-CN": "\u5168\u90e8\u5f53\u524d\u539f\u6587",
    "en-US": "All current sources"
  },
  "topK": {
    "zh-CN": "\u68c0\u7d22\u7ed3\u679c/\u77e5\u8bc6\u5305\u5173\u7cfb\u6570\u91cf\u4e0a\u9650",
    "en-US": "Search results / package relation limit"
  },
  "contextBytes": {
    "zh-CN": "\u5b8c\u6574\u54cd\u5e94\u9884\u7b97\uff08UTF-8\u5b57\u8282\uff0c4096\u2013262144\uff09",
    "en-US": "Complete response budget (UTF-8 bytes, 4096-262144)"
  },
  "budgetHint": {
    "zh-CN": "\u8d85\u9650\u4f1a\u660e\u786e\u62d2\u7edd\uff0c\u4e0d\u622a\u65ad\u8bc1\u636e\u3002\u4e3b\u9898\u5f53\u524d\u6c47\u7f16\u53ef\u80fd\u8d85\u8fc7\u9884\u7b97\uff1b\u53ef\u589e\u52a0\u9884\u7b97\u6216\u6539\u7528\u6709\u754c\u4e8b\u5b9e/\u77e5\u8bc6\u5305\u3002",
    "en-US": "Oversized responses are refused without cutting evidence. Topic dossiers may need a larger budget or bounded facts/packages."
  },
  "note": {
    "zh-CN": "\u64cd\u4f5c\u539f\u56e0\uff08\u5fc5\u586b\uff09",
    "en-US": "Reason (required)"
  },
  "create": {
    "zh-CN": "\u521b\u5efa\u8349\u7a3f",
    "en-US": "Create draft"
  },
  "save": {
    "zh-CN": "\u4fdd\u5b58\u65b0\u8349\u7a3f\u4fee\u8ba2",
    "en-US": "Save draft revision"
  },
  "reload": {
    "zh-CN": "\u5237\u65b0",
    "en-US": "Refresh"
  },
  "choose": {
    "zh-CN": "\u6253\u5f00",
    "en-US": "Open"
  },
  "more": {
    "zh-CN": "\u4e0b\u4e00\u9875",
    "en-US": "Next page"
  },
  "draft": {
    "zh-CN": "\u8349\u7a3f",
    "en-US": "Draft"
  },
  "active": {
    "zh-CN": "\u5df2\u542f\u7528",
    "en-US": "Active"
  },
  "stopped": {
    "zh-CN": "\u5df2\u505c\u7528",
    "en-US": "Stopped"
  },
  "revision": {
    "zh-CN": "\u914d\u7f6e\u4fee\u8ba2",
    "en-US": "Configuration revision"
  },
  "activeVersion": {
    "zh-CN": "\u5f53\u524d\u53d1\u5e03\u7248\u672c",
    "en-US": "Active version"
  },
  "versions": {
    "zh-CN": "\u4e0d\u53ef\u53d8\u53d1\u5e03\u7248\u672c",
    "en-US": "Immutable published versions"
  },
  "compare": {
    "zh-CN": "\u5f53\u524d\u53d1\u5e03 / \u76ee\u6807\u914d\u7f6e\u5bf9\u6bd4",
    "en-US": "Active / target configuration comparison"
  },
  "target": {
    "zh-CN": "\u53d1\u5e03\u76ee\u6807",
    "en-US": "Release target"
  },
  "publishDraft": {
    "zh-CN": "\u53d1\u5e03\u5f53\u524d\u5df2\u4fdd\u5b58\u8349\u7a3f",
    "en-US": "Publish saved draft"
  },
  "stop": {
    "zh-CN": "\u505c\u7528\u670d\u52a1",
    "en-US": "Stop service"
  },
  "preview": {
    "zh-CN": "\u6821\u9a8c\u5e76\u9884\u89c8\u5f71\u54cd",
    "en-US": "Validate and preview impact"
  },
  "changed": {
    "zh-CN": "\u53d8\u5316\u5b57\u6bb5",
    "en-US": "Changed fields"
  },
  "runningCalls": {
    "zh-CN": "\u6267\u884c\u4e2d\u8c03\u7528\uff08\u53ef\u80fd\u542b\u4e2d\u65ad\u8bb0\u5f55\uff09",
    "en-US": "Running calls (may include interrupted records)"
  },
  "confirm": {
    "zh-CN": "\u786e\u8ba4\u5f53\u524d\u5f71\u54cd\u4e0e\u64cd\u4f5c\u539f\u56e0",
    "en-US": "Confirm current impact and reason"
  },
  "apply": {
    "zh-CN": "\u786e\u8ba4\u53d1\u5e03 / \u505c\u7528 / \u56de\u9000",
    "en-US": "Confirm publish / stop / rollback"
  },
  "publishHint": {
    "zh-CN": "\u9009\u62e9\u5386\u53f2\u7248\u672c\u4f1a\u590d\u5236\u4e3a\u65b0\u7684\u4e0d\u53ef\u53d8\u53d1\u5e03\u7248\u672c\uff1b\u4e0d\u4f1a\u4fee\u6539\u5386\u53f2\u3002\u672a\u4fdd\u5b58\u7684\u8868\u5355\u4e0d\u80fd\u53d1\u5e03\u3002",
    "en-US": "Selecting a historical version creates a new immutable release. Save form changes before publishing."
  },
  "history": {
    "zh-CN": "\u64cd\u4f5c\u5386\u53f2",
    "en-US": "Operation history"
  },
  "debug": {
    "zh-CN": "\u670d\u52a1\u8c03\u8bd5\u4e0e\u63a5\u5165",
    "en-US": "Debug and integrate"
  },
  "bench": {
    "zh-CN": "\u5728\u68c0\u9a8c\u53f0\u6253\u5f00",
    "en-US": "Open in bench"
  },
  "debugLead": {
    "zh-CN": "\u663e\u5f0f\u6267\u884c\u771f\u5b9e\u77e5\u8bc6\u8bfb\u53d6\uff1b\u4e8b\u5b9e/\u539f\u6587\u6cbf\u7528\u68c0\u7d22\u8ba1\u91cf\uff0c\u56de\u9000\u53ef\u80fd\u4ea7\u751f\u4e24\u6b21\u68c0\u7d22\u3002\u4e0d\u4f1a\u8c03\u7528\u751f\u6210\u6a21\u578b\u3002",
    "en-US": "Runs real knowledge reads. Facts/source use search metering; fallback can perform two searches. No generation model is called."
  },
  "draftDebug": {
    "zh-CN": "\u8c03\u8bd5\u5df2\u4fdd\u5b58\u8349\u7a3f\uff08\u4ec5\u914d\u7f6e\u7ba1\u7406\u8005\uff09",
    "en-US": "Debug saved draft (managers only)"
  },
  "capability": {
    "zh-CN": "\u8c03\u7528\u80fd\u529b",
    "en-US": "Capability"
  },
  "query": {
    "zh-CN": "\u67e5\u8be2",
    "en-US": "Query"
  },
  "kbId": {
    "zh-CN": "\u4e3b\u9898\u6240\u5c5e\u77e5\u8bc6\u5e93",
    "en-US": "Topic library"
  },
  "relationType": {
    "zh-CN": "\u5173\u7cfb\u7c7b\u578b\uff08\u7559\u7a7a\u5217\u51fa\u4e3b\u9898\uff09",
    "en-US": "Relation type (empty lists topics)"
  },
  "entityIds": {
    "zh-CN": "\u5b9e\u4f53ID\uff08\u9017\u53f7\u5206\u9694\uff0c\u7559\u7a7a\u8bfb\u76ee\u5f55\uff09",
    "en-US": "Entity IDs (comma-separated; empty reads directory)"
  },
  "cursor": {
    "zh-CN": "\u5206\u9875\u6e38\u6807\uff08\u539f\u6837\u7c98\u8d34\u4e0a\u4e00\u54cd\u5e94\u6e38\u6807\uff09",
    "en-US": "Page cursor (copy from previous response)"
  },
  "summaryId": {
    "zh-CN": "\u6458\u8981ID\uff08\u53ef\u9009\uff09",
    "en-US": "Summary ID (optional)"
  },
  "before": {
    "zh-CN": "\u6458\u8981\u7eed\u9875before\uff08\u53ef\u9009\uff09",
    "en-US": "Summary before cursor (optional)"
  },
  "run": {
    "zh-CN": "\u6267\u884c\u771f\u5b9e\u8c03\u7528",
    "en-US": "Execute real call"
  },
  "result": {
    "zh-CN": "\u771f\u5b9e\u54cd\u5e94\u4e0e\u8bc1\u636e",
    "en-US": "Response and evidence"
  },
  "resultHint": {
    "zh-CN": "\u5237\u65b0\u3001\u7f16\u8f91\u6216\u5931\u8d25\u5373\u6e05\u7a7a\u65e7\u7ed3\u679c\u3002\u4f7f\u7528\u524d\u91cd\u65b0\u8c03\u7528\u6838\u9a8c\uff0c\u5386\u53f2\u8ffd\u8e2a\u4e0d\u4fdd\u5b58\u95ee\u7b54\u6b63\u6587\u3002",
    "en-US": "Refresh, edits or failures clear old results. Revalidate before reuse; traces do not store question/answer bodies."
  },
  "examples": {
    "zh-CN": "OBO\u63a5\u5165\u793a\u4f8b\u4e0e\u53c2\u6570",
    "en-US": "OBO integration and parameters"
  },
  "exampleHint": {
    "zh-CN": "\u670d\u52a1\u6807\u8bc6\u4e0d\u662f\u8bbf\u95ee\u51ed\u636e\u3002\u4f7f\u7528\u65e2\u6709aud=karda\u3001scope=tool:karda\u7684\u4ee3\u7528\u6237\u4ee4\u724c\uff1b\u4e0d\u5bfc\u51fa\u4ee4\u724c\uff0c\u4e0d\u63d0\u4f9b\u670d\u52a1\u8eab\u4efd\u7ed5\u8fc7\u3002Runos\u672a\u5728\u672c\u6279\u6ce8\u518c\u3002",
    "en-US": "A service ID is not a credential. Use an existing OBO token with aud=karda and scope=tool:karda. Tokens are never exported; service identity cannot bypass user checks. Runos registration is separate."
  },
  "export": {
    "zh-CN": "\u5bfc\u51fa\u63a5\u5165\u914d\u7f6e",
    "en-US": "Export integration configuration"
  },
  "trace": {
    "zh-CN": "\u8c03\u7528\u8ffd\u8e2a",
    "en-US": "Call traces"
  },
  "traceHint": {
    "zh-CN": "\u53ea\u8bb0\u5f55\u5143\u6570\u636e\u3002\u76f8\u540crequestId\u62d2\u7edd\u518d\u6b21\u6267\u884c\uff1b\u4e2d\u65ad\u8bb0\u5f55\u4fdd\u7559running\uff0c\u4e0d\u80fd\u636e\u6b64\u8ba4\u5b9a\u6210\u529f\u6216\u81ea\u52a8\u91cd\u653e\u3002",
    "en-US": "Metadata only. Reused request IDs are refused. Interrupted calls stay running; this is not proof of success and does not trigger replay."
  },
  "state": {
    "zh-CN": "\u72b6\u6001",
    "en-US": "State"
  },
  "any": {
    "zh-CN": "\u5168\u90e8",
    "en-US": "All"
  },
  "running": {
    "zh-CN": "\u6267\u884c\u4e2d / \u672a\u5b8c\u6210",
    "en-US": "Running / unfinished"
  },
  "succeeded": {
    "zh-CN": "\u6210\u529f",
    "en-US": "Succeeded"
  },
  "failed": {
    "zh-CN": "\u5931\u8d25",
    "en-US": "Failed"
  },
  "requestId": {
    "zh-CN": "\u8bf7\u6c42\u6807\u8bc6",
    "en-US": "Request ID"
  },
  "filter": {
    "zh-CN": "\u7b5b\u9009",
    "en-US": "Filter"
  },
  "details": {
    "zh-CN": "\u5143\u6570\u636e\u8be6\u60c5",
    "en-US": "Metadata details"
  },
  "versionId": {
    "zh-CN": "\u5b9e\u9645\u7248\u672c",
    "en-US": "Actual version"
  },
  "latency": {
    "zh-CN": "\u8017\u65f6\uff08\u6beb\u79d2\uff09",
    "en-US": "Latency (ms)"
  },
  "usage": {
    "zh-CN": "\u7528\u91cf\u5173\u8054",
    "en-US": "Usage references"
  },
  "empty": {
    "zh-CN": "\u6682\u65e0\u8bb0\u5f55",
    "en-US": "No records"
  },
  "loading": {
    "zh-CN": "\u6b63\u5728\u52a0\u8f7d\u6216\u6267\u884c\u2026",
    "en-US": "Loading or executing..."
  },
  "saved": {
    "zh-CN": "\u64cd\u4f5c\u5df2\u4fdd\u5b58\uff0c\u5f53\u524d\u72b6\u6001\u5df2\u91cd\u65b0\u8bfb\u53d6",
    "en-US": "Saved; current state reloaded"
  },
  "denied": {
    "zh-CN": "\u5f53\u524d\u8eab\u4efd\u65e0\u6743\u8bbf\u95ee\u6b64\u8303\u56f4",
    "en-US": "Current identity cannot access this scope"
  },
  "unavailable": {
    "zh-CN": "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u67e5\u770b\u5206\u7c7b\u9519\u8bef\u540e\u91cd\u8bd5",
    "en-US": "Request failed; inspect the error before retrying"
  },
  "code": {
    "zh-CN": "\u5206\u7c7b\u9519\u8bef",
    "en-US": "Error code"
  },
  "retry": {
    "zh-CN": "\u6309\u539f\u547d\u4ee4\u91cd\u8bd5\uff08\u4e0d\u4f1a\u91cd\u653e\u8c03\u7528\uff09",
    "en-US": "Retry the same management command (calls are not replayed)"
  },
  "back": {
    "zh-CN": "\u8fd4\u56de\u670d\u52a1\u4e2d\u5fc3",
    "en-US": "Back to service center"
  },
  "params": {
    "zh-CN": "\u6bcf\u6b21\u8c03\u7528\u5fc5\u586bserviceId\u3001\u5168\u65b0requestId\u548ccapability\uff1bquery\u7528\u4e8efacts/source\uff1btopics\u53ef\u6307\u5b9akbId\u4e0erelationType\uff1bpackage\u4f20entityIds\uff0c\u7a7a\u6570\u7ec4\u4e3a\u76ee\u5f55\u3002\u5206\u9875\u4e0e\u6458\u8981\u53c2\u6570\u6cbf\u7528\u5f53\u524d\u54cd\u5e94\uff0c\u6539\u53d8\u670d\u52a1/\u8303\u56f4\u540e\u987b\u91cd\u65b0\u5f00\u59cb\u3002",
    "en-US": "Each call requires serviceId, a new requestId and capability. query is used by facts/source; topics accepts kbId/relationType; package requires entityIds (empty for directory). Keep paging context unchanged and restart after configuration/scope changes."
  },
  "noPublish": {
    "zh-CN": "\u5f53\u524d\u89d2\u8272\u7f3a\u5c11\u670d\u52a1\u53d1\u5e03\u6743\u9650\uff0c\u53ef\u4fdd\u5b58/\u8c03\u8bd5\u8349\u7a3f",
    "en-US": "Current role can save/debug drafts but cannot publish"
  },
  "dirty": {
    "zh-CN": "\u8868\u5355\u6709\u672a\u4fdd\u5b58\u4fee\u6539\uff0c\u8bf7\u5148\u4fdd\u5b58\u6216\u91cd\u65b0\u52a0\u8f7d",
    "en-US": "Unsaved changes: save or reload first"
  },
  "evidence": {
    "zh-CN": "\u539f\u6587\u8bc1\u636e\u4e0e\u7ef4\u62a4\u5165\u53e3",
    "en-US": "Source evidence and maintenance"
  },
  "statusConflict": {
    "zh-CN": "\u914d\u7f6e\u6216\u9884\u89c8\u5df2\u53d8\u5316\uff0c\u8bf7\u5237\u65b0\u5e76\u91cd\u65b0\u9884\u89c8",
    "en-US": "Configuration or preview changed; reload and preview again"
  }
} as const;
