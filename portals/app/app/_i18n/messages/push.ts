export const pushMessages = {
  "title": {
    "zh-CN": "\u77e5\u8bc6\u53d8\u66f4\u4e8b\u4ef6\u4e0e\u5916\u90e8\u63a8\u9001\u4e2d\u5fc3",
    "en-US": "Knowledge events and external delivery"
  },
  "lead": {
    "zh-CN": "\u4ee5\u7b7e\u540d\u5143\u6570\u636e\u901a\u77e5\u5916\u90e8\u6d88\u8d39\u8005\u91cd\u65b0\u8bfb\u53d6\u5f53\u524d\u77e5\u8bc6\u3002\u914d\u7f6e\u4e0d\u6388\u4e88\u77e5\u8bc6\u8bbf\u95ee\u6743\uff1b\u4e8b\u4ef6\u53ef\u80fd\u91cd\u590d\u6216\u4e71\u5e8f\uff0c\u63a5\u6536\u7aef\u987b\u6309\u4e8b\u4ef6ID\u5e42\u7b49\u3002",
    "en-US": "Signed metadata asks external consumers to re-read current knowledge. Configuration grants no knowledge access. Events can repeat or arrive out of order; deduplicate by event ID."
  },
  "newConsumer": {
    "zh-CN": "\u65b0\u5efa\u6d88\u8d39\u8005",
    "en-US": "New consumer"
  },
  "name": {
    "zh-CN": "\u6d88\u8d39\u8005\u540d\u79f0",
    "en-US": "Consumer name"
  },
  "url": {
    "zh-CN": "\u516c\u7f51HTTPS\u63a5\u6536\u5730\u5740\uff08\u4ec5443\uff09",
    "en-US": "Public HTTPS receiver (port443 only)"
  },
  "urlHint": {
    "zh-CN": "\u62d2\u7edd\u672c\u673a/\u5185\u7f51\u53ca\u7279\u6b8a\u5730\u5740\uff0cDNS\u89e3\u6790\u7ed3\u679c\u987b\u5168\u90e8\u4e3a\u516c\u7f51\uff0c\u8fde\u63a5\u56fa\u5b9a\u672c\u6b21\u89e3\u6790\u5730\u5740\uff0c\u4e0d\u8ddf\u968f\u91cd\u5b9a\u5411\u3002",
    "en-US": "Local/private/special addresses are refused. Every DNS result must be public; connections pin resolution and never follow redirects."
  },
  "service": {
    "zh-CN": "\u8ba2\u9605\u672c\u4eba\u7684\u5df2\u53d1\u5e03\u77e5\u8bc6\u670d\u52a1",
    "en-US": "Subscribe to your published knowledge service"
  },
  "types": {
    "zh-CN": "\u8ba2\u9605\u4e8b\u4ef6\u7c7b\u578b",
    "en-US": "Event types"
  },
  "published": {
    "zh-CN": "\u77e5\u8bc6\u53d1\u5e03",
    "en-US": "Knowledge published"
  },
  "invalidated": {
    "zh-CN": "\u6765\u6e90\u5931\u6548/\u7248\u672c\u53d8\u5316",
    "en-US": "Source invalidated/version changed"
  },
  "visibility": {
    "zh-CN": "\u5e93\u5171\u4eab\u72b6\u6001\u53d8\u5316",
    "en-US": "Library visibility changed"
  },
  "serviceChanged": {
    "zh-CN": "\u670d\u52a1\u7248\u672c/\u72b6\u6001\u53d8\u5316",
    "en-US": "Service version/state changed"
  },
  "create": {
    "zh-CN": "\u521b\u5efa\u6d88\u8d39\u8005\u5e76\u751f\u6210\u5bc6\u94a5",
    "en-US": "Create consumer and signing key"
  },
  "configure": {
    "zh-CN": "\u4fdd\u5b58\u914d\u7f6e\u5e76\u91cd\u65b0\u9a8c\u8bc1",
    "en-US": "Save configuration and reverify"
  },
  "configHint": {
    "zh-CN": "\u5148\u6682\u505c\u518d\u4fee\u6539\u5730\u5740/\u8303\u56f4\u6216\u8f6e\u6362\u5bc6\u94a5\u3002\u4fee\u6539\u5c06\u53d6\u6d88\u65e7\u672a\u5b8c\u6210\u4ea4\u4ed8\uff0c\u91cd\u7f6e\u9a8c\u8bc1\u548c\u4e8b\u4ef6\u8d77\u70b9\uff1b\u5386\u53f2\u4fdd\u7559\u3002\u5bc6\u94a5\u65e0\u65e7\u7248\u672c\u5bbd\u9650\uff0c\u987b\u5148\u5b89\u88c5\u65b0\u5bc6\u94a5\u518d\u9a8c\u8bc1\u3002",
    "en-US": "Pause before changing endpoint/scope or rotating keys. Changes cancel unfinished deliveries and reset verification/event start; history remains. There is no old-key grace: install the new key before verifying."
  },
  "reason": {
    "zh-CN": "\u64cd\u4f5c\u539f\u56e0\uff08\u5fc5\u586b\uff09",
    "en-US": "Reason (required)"
  },
  "confirm": {
    "zh-CN": "\u786e\u8ba4\u8303\u56f4\u3001\u6240\u9009\u6570\u91cf\u53ca\u672c\u6b21\u64cd\u4f5c\uff1b\u6d4b\u8bd5/\u542f\u7528\u4f1a\u5411\u63a5\u6536\u5730\u5740\u53d1\u9001\u8bf7\u6c42",
    "en-US": "Confirm scope, selection count and action; verification/enable can send requests to the receiver"
  },
  "verify": {
    "zh-CN": "\u6392\u961f\u7aef\u70b9\u9a8c\u8bc1",
    "en-US": "Queue endpoint verification"
  },
  "test": {
    "zh-CN": "\u53d1\u9001\u660e\u786e\u6807\u8bc6\u7684\u6d4b\u8bd5\u4e8b\u4ef6",
    "en-US": "Send explicitly marked test event"
  },
  "enable": {
    "zh-CN": "\u542f\u7528\u81ea\u52a8\u63a8\u9001",
    "en-US": "Enable automatic push"
  },
  "pause": {
    "zh-CN": "\u6682\u505c\u65b0\u6295\u9012",
    "en-US": "Pause delivery"
  },
  "disable": {
    "zh-CN": "\u6c38\u4e45\u505c\u7528\u5e76\u53d6\u6d88\u672a\u5b8c\u6210\u9879",
    "en-US": "Disable permanently and cancel pending"
  },
  "rotate": {
    "zh-CN": "\u8f6e\u6362\u7b7e\u540d\u5bc6\u94a5",
    "en-US": "Rotate signing key"
  },
  "secret": {
    "zh-CN": "\u672c\u6b21\u7b7e\u540d\u5bc6\u94a5\uff08\u53ea\u5c55\u793a\u4e00\u6b21\uff09",
    "en-US": "Signing secret (shown once)"
  },
  "secretHint": {
    "zh-CN": "\u8bf7\u5b89\u5168\u4fdd\u5b58\u5230\u63a5\u6536\u7aef\u3002\u5237\u65b0\u3001\u79bb\u5f00\u6216\u5176\u4ed6\u8bf7\u6c42\u540e\u4e0d\u518d\u663e\u793a\uff1b\u4e22\u5931\u9700\u6682\u505c\u540e\u91cd\u65b0\u8f6e\u6362\u3002\u5bc6\u94a5\u4e0d\u5199\u6d4f\u89c8\u5668\u5b58\u50a8\u6216\u914d\u7f6e\u5bfc\u51fa\u3002",
    "en-US": "Install securely at the receiver. Refresh/navigation/another request clears it; if lost, pause and rotate. Never written to browser storage or exports."
  },
  "secretUnavailable": {
    "zh-CN": "\u540c\u4e00\u547d\u4ee4\u5df2\u6267\u884c\uff0c\u5bc6\u94a5\u4e0d\u80fd\u518d\u6b21\u663e\u793a\uff1b\u8bf7\u6682\u505c\u5e76\u8f6e\u6362",
    "en-US": "Command already executed; secret cannot be redisplayed. Pause and rotate."
  },
  "refresh": {
    "zh-CN": "\u5237\u65b0",
    "en-US": "Refresh"
  },
  "open": {
    "zh-CN": "\u6253\u5f00",
    "en-US": "Open"
  },
  "more": {
    "zh-CN": "\u4e0b\u4e00\u9875",
    "en-US": "Next page"
  },
  "state": {
    "zh-CN": "\u72b6\u6001",
    "en-US": "State"
  },
  "draft": {
    "zh-CN": "\u5f85\u9a8c\u8bc1",
    "en-US": "Unverified"
  },
  "active": {
    "zh-CN": "\u81ea\u52a8\u63a8\u9001\u4e2d",
    "en-US": "Active"
  },
  "paused": {
    "zh-CN": "\u5df2\u6682\u505c",
    "en-US": "Paused"
  },
  "disabled": {
    "zh-CN": "\u5df2\u6c38\u4e45\u505c\u7528",
    "en-US": "Disabled"
  },
  "verified": {
    "zh-CN": "\u7aef\u70b9\u9a8c\u8bc1\u65f6\u95f4",
    "en-US": "Endpoint verified at"
  },
  "revision": {
    "zh-CN": "\u7ba1\u7406\u4fee\u8ba2",
    "en-US": "Control revision"
  },
  "configRevision": {
    "zh-CN": "\u914d\u7f6e\u7248\u672c",
    "en-US": "Configuration revision"
  },
  "keyId": {
    "zh-CN": "\u5f53\u524d\u5bc6\u94a5\u6807\u8bc6",
    "en-US": "Current key ID"
  },
  "scope": {
    "zh-CN": "\u51bb\u7ed3\u77e5\u8bc6\u5e93\u8303\u56f4",
    "en-US": "Frozen library scope"
  },
  "scopeError": {
    "zh-CN": "\u5f53\u524d\u8bb8\u53ef\u6216\u670d\u52a1\u8303\u56f4\u53d8\u5316\uff0c\u76f8\u5173\u901a\u77e5\u4f1a\u88ab\u6291\u5236\uff1b\u4fee\u590d\u540e\u91cd\u8bd5\u6216\u91cd\u65b0\u914d\u7f6e",
    "en-US": "Current authority or service scope changed; notifications are suppressed. Repair then retry or reconfigure."
  },
  "events": {
    "zh-CN": "\u4e8b\u52a1\u5185\u53d8\u66f4\u4e8b\u4ef6\u8d26\u672c",
    "en-US": "Transactional change events"
  },
  "eventHint": {
    "zh-CN": "\u53ea\u8986\u76d6\u4e0a\u7ebf\u540e\u7684\u5b9e\u9645\u884c\u53d8\u66f4\uff0c\u4e0d\u8865\u9020\u5386\u53f2\uff1b\u6ca1\u6709\u884c\u5199\u5165\u7684\u81ea\u7136\u8fc7\u671f\u4e0d\u662f\u4e8b\u4ef6\u3002\u901a\u77e5\u4e0d\u643a\u5e26\u539f\u6587\uff0c\u4e0d\u80fd\u4f5c\u4e3a\u79bb\u7ebf\u8bbf\u95ee\u51ed\u636e\u3002",
    "en-US": "Only actual row changes after rollout are captured, without invented history. Natural expiry without a write is not an event. Notifications contain no source body or offline access grant."
  },
  "replay": {
    "zh-CN": "\u91cd\u653e\u9009\u4e2d\u4e8b\u4ef6",
    "en-US": "Replay selected events"
  },
  "retry": {
    "zh-CN": "\u91cd\u8bd5\u9009\u4e2d\u4ea4\u4ed8",
    "en-US": "Retry selected deliveries"
  },
  "replayHint": {
    "zh-CN": "\u91cd\u653e\u4fdd\u7559\u539f\u4e8b\u4ef6ID\uff0c\u65b0\u589e\u5c1d\u8bd5\u8bb0\u5f55\u3002\u6700\u591a50\u9879\uff0c\u4ec5\u5f53\u524d\u914d\u7f6e\u8d77\u70b9\u540e\u7684\u5339\u914d\u4e8b\u4ef6\uff1b\u5df2\u6392\u961f/\u6267\u884c\u4e2d\u4e0d\u80fd\u91cd\u590d\u6392\u961f\u3002\u5df2\u5b8c\u6210\u4e8b\u4ef6\u53ef\u518d\u6b21\u901a\u77e5\uff0c\u6d88\u8d39\u8005\u5fc5\u987b\u53bb\u91cd\u3002",
    "en-US": "Replay keeps original event IDs and adds attempts. Up to50 matching events since current configuration start. Queued/in-flight events cannot be queued twice; consumers must deduplicate completed replays."
  },
  "deliveries": {
    "zh-CN": "\u771f\u5b9e\u4ea4\u4ed8\u72b6\u6001",
    "en-US": "Delivery states"
  },
  "queued": {
    "zh-CN": "\u5f85\u6295\u9012",
    "en-US": "Queued"
  },
  "leased": {
    "zh-CN": "\u5df2\u9886\u53d6/\u6267\u884c\u4e2d",
    "en-US": "Leased/in progress"
  },
  "retryState": {
    "zh-CN": "\u7b49\u5f85\u9000\u907f\u91cd\u8bd5",
    "en-US": "Waiting for retry"
  },
  "done": {
    "zh-CN": "\u5df2\u786e\u8ba4",
    "en-US": "Acknowledged"
  },
  "dead": {
    "zh-CN": "\u6b7b\u4fe1\u5f85\u5904\u7f6e",
    "en-US": "Dead letter"
  },
  "suppressed": {
    "zh-CN": "\u56e0\u5f53\u524d\u6761\u4ef6\u6291\u5236",
    "en-US": "Suppressed"
  },
  "cancelled": {
    "zh-CN": "\u5df2\u53d6\u6d88",
    "en-US": "Cancelled"
  },
  "any": {
    "zh-CN": "\u5168\u90e8",
    "en-US": "All"
  },
  "filter": {
    "zh-CN": "\u7b5b\u9009",
    "en-US": "Filter"
  },
  "deliveryId": {
    "zh-CN": "\u4ea4\u4ed8ID\uff08\u53ef\u9009\u7cbe\u786e\u67e5\u8be2\uff09",
    "en-US": "Delivery ID (optional exact lookup)"
  },
  "attempts": {
    "zh-CN": "\u5c1d\u8bd5\u8bb0\u5f55\uff08\u6700\u8fd150\u6761\uff09",
    "en-US": "Attempts (latest50)"
  },
  "attempt": {
    "zh-CN": "\u672c\u8f6e/\u7d2f\u8ba1\u5c1d\u8bd5",
    "en-US": "Cycle/total attempts"
  },
  "history": {
    "zh-CN": "\u4e0d\u53ef\u53d8\u64cd\u4f5c\u8bb0\u5f55",
    "en-US": "Immutable controls"
  },
  "details": {
    "zh-CN": "\u5143\u6570\u636e\u8be6\u60c5",
    "en-US": "Metadata details"
  },
  "count": {
    "zh-CN": "\u9009\u4e2d\u6570\u91cf",
    "en-US": "Selected count"
  },
  "integration": {
    "zh-CN": "\u63a5\u5165\u4e0e\u9a8c\u8bc1\u5de5\u5177",
    "en-US": "Integration and verification"
  },
  "export": {
    "zh-CN": "\u5bfc\u51fa\u65e0\u5bc6\u94a5\u63a5\u5165\u914d\u7f6e",
    "en-US": "Export configuration without secrets"
  },
  "receiver": {
    "zh-CN": "\u4e0b\u8f7d\u63a5\u6536\u7aef\u6837\u4f8b",
    "en-US": "Download receiver example"
  },
  "signing": {
    "zh-CN": "\u6309\u539f\u59cb\u5b57\u8282\u7b7e\u540d\uff1aHMAC-SHA256(secret, timestamp + \".\" + deliveryId + \".\" + rawBody)\uff0cX-Karda-Signature\u4e3av1=\u5341\u516d\u8fdb\u5236\u6458\u8981\u3002\u65f6\u95f4\u504f\u5dee\u2264300\u79d2\uff0c\u5148\u6821\u9a8ckeyId/consumerId\u53ca\u5934\u4f53ID\u4e00\u81f4\u518d\u5904\u7406\uff1b\u54cd\u5e94\u5fc5\u987b2xx\u4e14JSON {eventId, accepted:true}\u3002",
    "en-US": "Sign raw bytes: HMAC-SHA256(secret, timestamp + \".\" + deliveryId + \".\" + rawBody), X-Karda-Signature=v1=hex digest. Allow at most300seconds clock skew; check key/consumer identity and matching header/body IDs. ACK must be2xx JSON {eventId, accepted:true}."
  },
  "semantics": {
    "zh-CN": "\u6bcf\u8f6e\u6700\u591a3\u6b21\uff0c\u9000\u907f30/60\u79d2\uff1b\u8d85\u65f6\u548c\u7ed3\u679c\u4e0d\u660e\u53ef\u518d\u6b21\u6295\u9012\uff0c\u76f8\u540c\u4e8b\u4ef6ID\u5fc5\u987b\u5e42\u7b49\u3002\u6682\u505c/\u64a4\u6743\u4e0d\u6536\u56de\u5df2\u7ecf\u5728\u9014\u6216\u5df2\u786e\u8ba4\u7684\u901a\u77e5\uff1b\u6d88\u8d39\u8005\u6bcf\u6b21\u4f7f\u7528\u77e5\u8bc6\u4ecd\u987b\u91cd\u65b0\u9274\u6743\u3002",
    "en-US": "Up to3attempts per cycle with30/60second backoff. Timeouts/unknown outcomes may redeliver the same event ID. Pause/revocation cannot recall in-flight or acknowledged notices. Reauthenticate whenever using knowledge."
  },
  "encryption": {
    "zh-CN": "\u5bc6\u94a5\u52a0\u5bc6\u4fdd\u5b58\uff1b\u5c01\u88c5\u4f9d\u8d56\u65e2\u6709OIDC\u5ba2\u6237\u7aef\u673a\u5bc6\u3002\u5e94\u7528\u673a\u5bc6\u8f6e\u6362\u540e\u65e7\u5bc6\u94a5\u89e3\u5bc6\u5931\u8d25\u5c06\u505c\u6b62\u4ea4\u4ed8\uff0c\u9700\u8981\u9010\u4e2a\u6d88\u8d39\u8005\u91cd\u65b0\u8f6e\u6362/\u9a8c\u8bc1\u3002",
    "en-US": "Keys are encrypted using the existing OIDC client secret. Rotating that application secret makes old envelopes fail closed; rotate/reverify each consumer."
  },
  "loading": {
    "zh-CN": "\u6b63\u5728\u8bfb\u53d6\u6216\u63d0\u4ea4\u2026",
    "en-US": "Loading or submitting..."
  },
  "saved": {
    "zh-CN": "\u5df2\u4fdd\u5b58\uff0c\u5f53\u524d\u72b6\u6001\u5df2\u91cd\u65b0\u8bfb\u53d6",
    "en-US": "Saved; current state reloaded"
  },
  "denied": {
    "zh-CN": "\u5f53\u524d\u65e0\u6743\u7ba1\u7406\u6b64\u8303\u56f4",
    "en-US": "Current identity cannot manage this scope"
  },
  "unavailable": {
    "zh-CN": "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u67e5\u770b\u5206\u7c7b\u9519\u8bef",
    "en-US": "Request failed; inspect the error code"
  },
  "changed": {
    "zh-CN": "\u72b6\u6001\u6216\u914d\u7f6e\u5df2\u53d8\u5316\uff0c\u8bf7\u5237\u65b0",
    "en-US": "State/configuration changed; refresh"
  },
  "code": {
    "zh-CN": "\u5206\u7c7b\u9519\u8bef",
    "en-US": "Error code"
  },
  "retrySame": {
    "zh-CN": "\u6309\u539f\u7ba1\u7406\u547d\u4ee4\u91cd\u8bd5",
    "en-US": "Retry same management command"
  },
  "testEvent": {
    "zh-CN": "\u6d4b\u8bd5\u4e8b\u4ef6",
    "en-US": "Test event"
  },
  "empty": {
    "zh-CN": "\u6682\u65e0\u8bb0\u5f55",
    "en-US": "No records"
  },
  "requestId": {
    "zh-CN": "\u8bf7\u6c42\u6807\u8bc6",
    "en-US": "Request ID"
  },
  "latency": {
    "zh-CN": "\u8017\u65f6\uff08\u6beb\u79d2\uff09",
    "en-US": "Latency (ms)"
  }
} as const;
