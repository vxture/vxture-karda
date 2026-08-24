"use client";

import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  ShellPanelContent,
  ShellPanelHeader,
  ShellPanelRow,
  ShellPanelSection,
  ShellScopeButton,
  StatusBadge,
} from "@vxture/design-system";
import type { SessionUser } from "../console/_lib/api";

// The header's "current scope" marker - karda's equivalent of the Console
// TenantPanel, built the same way: business content is ours (organization /
// workspace / role), the LAYOUT grammar is entirely DS (ShellScopeButton
// trigger + ShellPanel* rows), so this panel is pixel-identical in structure
// to every other portal's scope panel and only the words differ.

/** Short display form for an opaque id (workspaces/orgs have no name yet). */
function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function ScopePanel({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const workspaceLabel = user?.activeWorkspace ? `工作区 ${shortId(user.activeWorkspace)}` : "未选择工作区";
  const roleLabel = user?.isWorkspaceOwner ? "工作区属主" : user?.canManage ? "管理员" : "成员";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShellScopeButton icon="buildings" label={workspaceLabel} ariaLabel="当前范围" active={open} />
      </PopoverTrigger>
      <ShellPanelContent>
        <ShellPanelHeader
          icon="buildings"
          title={workspaceLabel}
          metaRows={[
            {
              key: "org",
              icon: "building",
              content: user?.activeOrg ? `组织 ${shortId(user.activeOrg)}` : "组织未知",
            },
          ]}
        />
        <ShellPanelSection divided={false}>
          <ShellPanelRow label="你的角色" value={<StatusBadge tone="brand">{roleLabel}</StatusBadge>} />
          <ShellPanelRow label="账号" value={user?.sub ?? "未登录"} />
        </ShellPanelSection>
        <ShellPanelSection>
          <ShellPanelRow label="知识库控制台" href="/console" />
          <ShellPanelRow label="检验台" href="/console/search" />
        </ShellPanelSection>
      </ShellPanelContent>
    </Popover>
  );
}
