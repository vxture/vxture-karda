import type {Catalog} from '../catalog';
export const automaticConnectors={
  "title": {
    "zh-CN": "\u81ea\u52a8\u5316\u77e5\u8bc6\u6e90\u8fde\u63a5\u5668\u4e2d\u5fc3",
    "en-US": "Automatic knowledge source connectors"
  },
  "hint": {
    "zh-CN": "\u914d\u7f6e\u6765\u6e90\u5e76\u5b8c\u6210\u9996\u6b21\u91c7\u96c6\u9884\u89c8\uff0c\u786e\u8ba4\u540e\u542f\u7528\u6301\u7eed\u540c\u6b65\u3002\u6765\u6e90\u66f4\u65b0\u8fdb\u5165\u52a0\u5de5\u5ba1\u6838\u94fe\uff1b\u5220\u9664\u59cb\u7ec8\u9884\u89c8\u786e\u8ba4\u3002",
    "en-US": "Configure and preview the first scan, then approve continuous sync. Source changes enter processing and review. Deletions always require impact confirmation."
  },
  "new": {
    "zh-CN": "\u65b0\u5efa\u8fde\u63a5\u5668",
    "en-US": "New connector"
  },
  "refresh": {
    "zh-CN": "\u5237\u65b0\u72b6\u6001",
    "en-US": "Refresh"
  },
  "more": {
    "zh-CN": "\u4e0b\u4e00\u9875",
    "en-US": "Next page"
  },
  "empty": {
    "zh-CN": "\u6682\u65e0\u8bb0\u5f55",
    "en-US": "No records"
  },
  "name": {
    "zh-CN": "\u540d\u79f0",
    "en-US": "Name"
  },
  "kind": {
    "zh-CN": "\u6765\u6e90\u7c7b\u578b",
    "en-US": "Source type"
  },
  "page": {
    "zh-CN": "\u5355\u7f51\u9875",
    "en-US": "Single web page"
  },
  "site": {
    "zh-CN": "\u9650\u5b9a\u7ad9\u70b9",
    "en-US": "Scoped website"
  },
  "api": {
    "zh-CN": "JSON API",
    "en-US": "JSON API"
  },
  "url": {
    "zh-CN": "\u5165\u53e3URL\uff08HTTPS\uff09",
    "en-US": "Entry URL (HTTPS)"
  },
  "discovery": {
    "zh-CN": "\u7ad9\u70b9\u53d1\u73b0\u65b9\u5f0f",
    "en-US": "Site discovery"
  },
  "links": {
    "zh-CN": "\u9875\u9762\u94fe\u63a5",
    "en-US": "Page links"
  },
  "sitemap": {
    "zh-CN": "Sitemap",
    "en-US": "Sitemap"
  },
  "includePaths": {
    "zh-CN": "\u5141\u8bb8\u8def\u5f84\u524d\u7f00\uff08\u6bcf\u884c\u4e00\u4e2a\uff09",
    "en-US": "Allowed path prefixes (one per line)"
  },
  "excludePaths": {
    "zh-CN": "\u6392\u9664\u8def\u5f84\u524d\u7f00\uff08\u6bcf\u884c\u4e00\u4e2a\uff09",
    "en-US": "Excluded path prefixes (one per line)"
  },
  "maxPages": {
    "zh-CN": "\u5355\u8f6e\u6700\u5927\u8bf7\u6c42\u9875\u6570",
    "en-US": "Maximum pages per run"
  },
  "interval": {
    "zh-CN": "\u540c\u6b65\u95f4\u9694\uff08\u5206\u949f\uff0c0\u4e3a\u624b\u52a8\uff09",
    "en-US": "Sync interval (minutes; 0 is manual)"
  },
  "reconcile": {
    "zh-CN": "\u5b8c\u6574\u626b\u63cf\u540e\u751f\u6210\u7f3a\u5931\u5220\u9664\u5019\u9009",
    "en-US": "Propose missing-source deletions after complete scans"
  },
  "auth": {
    "zh-CN": "\u8ba4\u8bc1\u65b9\u5f0f",
    "en-US": "Authentication"
  },
  "none": {
    "zh-CN": "\u65e0\u8ba4\u8bc1",
    "en-US": "No authentication"
  },
  "bearer": {
    "zh-CN": "Bearer\u4ee4\u724c",
    "en-US": "Bearer token"
  },
  "basic": {
    "zh-CN": "Basic\u8d26\u53f7\u5bc6\u7801",
    "en-US": "Basic credentials"
  },
  "header": {
    "zh-CN": "\u81ea\u5b9a\u4e49\u8bf7\u6c42\u5934",
    "en-US": "Custom header"
  },
  "headerName": {
    "zh-CN": "\u8bf7\u6c42\u5934\u540d\u79f0",
    "en-US": "Header name"
  },
  "secret": {
    "zh-CN": "\u51ed\u636e\uff08\u7559\u7a7a\u4fdd\u7559\uff0cBasic\u586b\u5199\u7528\u6237\u540d:\u5bc6\u7801\uff09",
    "en-US": "Credential (blank preserves; Basic uses username:password)"
  },
  "hasSecret": {
    "zh-CN": "\u5df2\u4fdd\u5b58\u52a0\u5bc6\u51ed\u636e\uff0c\u5185\u5bb9\u4e0d\u53ef\u8bfb\u53d6",
    "en-US": "Encrypted credential saved; value is not readable"
  },
  "save": {
    "zh-CN": "\u4fdd\u5b58\u914d\u7f6e\u7248\u672c",
    "en-US": "Save configuration version"
  },
  "note": {
    "zh-CN": "\u64cd\u4f5c\u7406\u7531\uff08\u5fc5\u586b\uff09",
    "en-US": "Reason (required)"
  },
  "confirm": {
    "zh-CN": "\u6211\u5df2\u6838\u5bf9\u8303\u56f4\u3001\u53d8\u66f4\u548c\u64cd\u4f5c\u5f71\u54cd",
    "en-US": "I reviewed scope, changes and operation impacts"
  },
  "preview": {
    "zh-CN": "\u8fde\u63a5\u6d4b\u8bd5\u4e0e\u91c7\u96c6\u9884\u89c8",
    "en-US": "Test connection and preview scan"
  },
  "sync": {
    "zh-CN": "\u7acb\u5373\u5b8c\u6574\u540c\u6b65",
    "en-US": "Run full sync now"
  },
  "incremental": {
    "zh-CN": "\u7acb\u5373\u589e\u91cf\u540c\u6b65",
    "en-US": "Run incremental sync now"
  },
  "approve": {
    "zh-CN": "\u786e\u8ba4\u9996\u6b21\u5bfc\u5165\u5e76\u542f\u7528",
    "en-US": "Approve first import and enable"
  },
  "pause": {
    "zh-CN": "\u6682\u505c\u8fde\u63a5\u5668",
    "en-US": "Pause connector"
  },
  "resume": {
    "zh-CN": "\u6062\u590d\u8fde\u63a5\u5668",
    "en-US": "Resume connector"
  },
  "retry": {
    "zh-CN": "\u6062\u590d\uff0f\u91cd\u8bd5\u6b64\u8fd0\u884c",
    "en-US": "Resume / retry run"
  },
  "cancel": {
    "zh-CN": "\u53d6\u6d88\u8fd0\u884c",
    "en-US": "Cancel run"
  },
  "state": {
    "zh-CN": "\u72b6\u6001",
    "en-US": "State"
  },
  "revision": {
    "zh-CN": "\u914d\u7f6e\u4fee\u8ba2",
    "en-US": "Configuration revision"
  },
  "versions": {
    "zh-CN": "\u914d\u7f6e\u7248\u672c",
    "en-US": "Configuration versions"
  },
  "runs": {
    "zh-CN": "\u540c\u6b65\u8fd0\u884c",
    "en-US": "Sync runs"
  },
  "history": {
    "zh-CN": "\u64cd\u4f5c\u5386\u53f2",
    "en-US": "Control history"
  },
  "records": {
    "zh-CN": "\u6765\u6e90\u9010\u9879\u7ed3\u679c\u4e0e\u5185\u5bb9\u9884\u89c8",
    "en-US": "Per-source results and content preview"
  },
  "errors": {
    "zh-CN": "\u5931\u8d25\u660e\u7ec6",
    "en-US": "Failure details"
  },
  "heads": {
    "zh-CN": "\u5f53\u524d\u6765\u6e90\u4e0e\u77e5\u8bc6\u8ffd\u8e2a",
    "en-US": "Current sources and knowledge lineage"
  },
  "deletions": {
    "zh-CN": "\u5220\u9664\u5bf9\u8d26\u4e0e\u5f71\u54cd",
    "en-US": "Deletion reconciliation and impact"
  },
  "deletePreview": {
    "zh-CN": "\u9884\u89c8\u5220\u9664\u5f71\u54cd",
    "en-US": "Preview deletion impact"
  },
  "deleteConfirm": {
    "zh-CN": "\u786e\u8ba4\u64a4\u56de\u5019\u9009\u6765\u6e90",
    "en-US": "Confirm source withdrawal"
  },
  "documents": {
    "zh-CN": "\u5f71\u54cd\u6587\u6863\u6570",
    "en-US": "Affected documents"
  },
  "assertions": {
    "zh-CN": "\u5173\u8054\u65ad\u8a00\u6570",
    "en-US": "Related assertions"
  },
  "reason": {
    "zh-CN": "\u5220\u9664\u539f\u56e0",
    "en-US": "Deletion reason"
  },
  "truncated": {
    "zh-CN": "\u626b\u63cf\u8fbe\u5230\u8303\u56f4\u9650\u5236\uff0c\u672c\u8f6e\u4e0d\u80fd\u8fdb\u884c\u7f3a\u5931\u5220\u9664\u3002",
    "en-US": "Scan reached its scope limit; absence-based deletion is unavailable."
  },
  "partialHint": {
    "zh-CN": "\u626b\u63cf\u4e0d\u5b8c\u6574\u6216\u5b58\u5728\u5931\u8d25\uff0c\u4ec5\u5904\u7406\u6210\u529f\u9879\uff0c\u4e0d\u5c06\u7f3a\u5931\u5f53\u4f5c\u5220\u9664\u3002",
    "en-US": "Scan is incomplete or has errors. Successful items may sync; missing items are not treated as deleted."
  },
  "scopeHint": {
    "zh-CN": "\u4ec5\u8bbf\u95ee\u5165\u53e3\u540c\u6e90\u3001\u5141\u8bb8\u8def\u5f84\u5185\u7684\u516c\u5171HTTPS\u5730\u5740\uff1b\u4e0d\u6267\u884c\u811a\u672c\u3002robots\u9650\u5236\u548c\u5931\u8d25\u4f1a\u663e\u793a\u5728\u8fd0\u884c\u8bb0\u5f55\u4e2d\u3002",
    "en-US": "Only public HTTPS addresses within the entry origin and allowed paths are fetched. Scripts are not executed. Robots restrictions and failures appear in run history."
  },
  "map": {
    "zh-CN": "API\u5b57\u6bb5\u6620\u5c04\u4e0e\u5206\u9875",
    "en-US": "API mapping and pagination"
  },
  "itemsPath": {
    "zh-CN": "\u8bb0\u5f55\u6570\u7ec4\u8def\u5f84\uff08\u7a7a\u503c\u8868\u793a\u6839\u6570\u7ec4\uff09",
    "en-US": "Items array path (blank means root array)"
  },
  "idPath": {
    "zh-CN": "\u7a33\u5b9a\u8bb0\u5f55ID\u5b57\u6bb5",
    "en-US": "Stable record ID field"
  },
  "titlePath": {
    "zh-CN": "\u6807\u9898\u5b57\u6bb5",
    "en-US": "Title field"
  },
  "contentPath": {
    "zh-CN": "\u6b63\u6587\u5b57\u7b26\u4e32\u5b57\u6bb5",
    "en-US": "Content string field"
  },
  "deletedPath": {
    "zh-CN": "\u5220\u9664\u5e03\u5c14\u5b57\u6bb5\uff08\u53ef\u9009\uff09",
    "en-US": "Deleted boolean field (optional)"
  },
  "nextPath": {
    "zh-CN": "\u4e0b\u4e00\u9875URL\u6216\u6e38\u6807\u5b57\u6bb5",
    "en-US": "Next URL or cursor field"
  },
  "pagination": {
    "zh-CN": "\u5206\u9875\u65b9\u5f0f",
    "en-US": "Pagination mode"
  },
  "next": {
    "zh-CN": "\u4e0b\u4e00\u9875URL",
    "en-US": "Next URL"
  },
  "offset": {
    "zh-CN": "\u504f\u79fb\u91cf",
    "en-US": "Offset"
  },
  "cursor": {
    "zh-CN": "\u6e38\u6807",
    "en-US": "Cursor"
  },
  "pageNumber": {
    "zh-CN": "\u9875\u7801",
    "en-US": "Page number"
  },
  "parameter": {
    "zh-CN": "\u5206\u9875\u53c2\u6570\u540d\u79f0",
    "en-US": "Pagination parameter"
  },
  "start": {
    "zh-CN": "\u8d77\u59cb\u9875\u7801\u6216\u504f\u79fb",
    "en-US": "Starting page or offset"
  },
  "pageSize": {
    "zh-CN": "\u6bcf\u9875\u8bb0\u5f55\u6570",
    "en-US": "Records per page"
  },
  "cursorPath": {
    "zh-CN": "\u6301\u4e45\u589e\u91cf\u6e38\u6807\u5b57\u6bb5\uff08\u53ef\u9009\uff09",
    "en-US": "Persistent incremental cursor field (optional)"
  },
  "cursorParameter": {
    "zh-CN": "\u589e\u91cf\u6e38\u6807\u8bf7\u6c42\u53c2\u6570",
    "en-US": "Incremental cursor parameter"
  },
  "source": {
    "zh-CN": "\u6765\u6e90\u7ba1\u7406\u4e0e\u52a0\u5de5\u6062\u590d",
    "en-US": "Source management and processing recovery"
  },
  "graph": {
    "zh-CN": "\u77e5\u8bc6\u56fe\u8c31",
    "en-US": "Knowledge graph"
  },
  "production": {
    "zh-CN": "\u751f\u4ea7\u5ba1\u6838\u4e2d\u5fc3",
    "en-US": "Production review center"
  },
  "failed": {
    "zh-CN": "\u64cd\u4f5c\u672a\u5b8c\u6210\uff0c\u8bf7\u5237\u65b0\u5e76\u68c0\u67e5\u6743\u9650\u3001\u914d\u7f6e\u548c\u8fd0\u884c\u72b6\u6001\u3002",
    "en-US": "Operation failed. Refresh and check access, configuration and run state."
  },
  "done": {
    "zh-CN": "\u64cd\u4f5c\u5df2\u5b8c\u6210",
    "en-US": "Operation completed"
  },
  "paused": {
    "zh-CN": "\u5df2\u6682\u505c",
    "en-US": "Paused"
  },
  "active": {
    "zh-CN": "\u5df2\u542f\u7528",
    "en-US": "Active"
  },
  "scanning": {
    "zh-CN": "\u91c7\u96c6\u4e2d",
    "en-US": "Scanning"
  },
  "review": {
    "zh-CN": "\u7b49\u5f85\u9884\u89c8\u786e\u8ba4",
    "en-US": "Awaiting preview approval"
  },
  "applying": {
    "zh-CN": "\u6b63\u5728\u540c\u6b65\u5165\u5e93",
    "en-US": "Applying sources"
  },
  "partial": {
    "zh-CN": "\u90e8\u5206\u5b8c\u6210",
    "en-US": "Partially completed"
  },
  "cancelled": {
    "zh-CN": "\u5df2\u53d6\u6d88",
    "en-US": "Cancelled"
  },
  "failedState": {
    "zh-CN": "\u5931\u8d25",
    "en-US": "Failed"
  },
  "unchanged": {
    "zh-CN": "\u5185\u5bb9\u672a\u53d8\u5316",
    "en-US": "Unchanged content"
  },
  "deleted": {
    "zh-CN": "\u5df2\u64a4\u56de",
    "en-US": "Withdrawn"
  },
  "full": {
    "zh-CN": "\u5b8c\u6574\u626b\u63cf",
    "en-US": "Full scan"
  },
  "testMode": {
    "zh-CN": "\u9884\u89c8\u8fd0\u884c",
    "en-US": "Preview run"
  },
  "syncMode": {
    "zh-CN": "\u540c\u6b65\u8fd0\u884c",
    "en-US": "Sync run"
  },
  "deletePending": {
    "zh-CN": "\u5019\u9009\u5220\u9664\u4e0d\u4f1a\u81ea\u52a8\u6267\u884c\uff0c\u8bf7\u9884\u89c8\u5e76\u786e\u8ba4\u3002",
    "en-US": "Deletion candidates are not applied automatically. Preview and confirm them."
  },
  "errorCode": {
    "zh-CN": "\u9519\u8bef\u4ee3\u7801",
    "en-US": "Error code"
  },
  "excerpts": {
    "zh-CN": "\u91c7\u96c6\u6b63\u6587\u9884\u89c8",
    "en-US": "Extracted content preview"
  },
  "credentialHint": {
    "zh-CN": "\u51ed\u636e\u4ec5\u4fdd\u5b58\u5728\u670d\u52a1\u7aef\uff1b\u4e0d\u8981\u5c06\u4ee4\u724c\u653e\u5165URL\u3002",
    "en-US": "Credentials stay on the server. Do not put tokens in URLs."
  }
} satisfies Catalog;
