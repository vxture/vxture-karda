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
import type { SessionUser } from "../_lib/api";
import { sessionRole } from "../_lib/session";
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";
import { ROLE_LABEL_KEY } from "./roles";

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
  const m = useMessages(shellMessages);
  const workspaceLabel = user?.activeWorkspace ? m.workspaceLabel(shortId(user.activeWorkspace)) : m.noWorkspace;
  const roleLabel = m[ROLE_LABEL_KEY[sessionRole(user)]];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShellScopeButton icon="buildings" label={workspaceLabel} ariaLabel={m.currentScope} active={open} />
      </PopoverTrigger>
      <ShellPanelContent>
        <ShellPanelHeader
          icon="buildings"
          title={workspaceLabel}
          metaRows={[
            {
              key: "org",
              icon: "building",
              content: user?.activeOrg ? m.orgLabel(shortId(user.activeOrg)) : m.orgUnknown,
            },
          ]}
        />
        <ShellPanelSection divided={false}>
          <ShellPanelRow label={m.yourRole} value={<StatusBadge tone="brand">{roleLabel}</StatusBadge>} />
          <ShellPanelRow label={m.accountId} value={user?.sub ?? m.signedOut} />
        </ShellPanelSection>
        <ShellPanelSection>
          <ShellPanelRow label={m.newAsset} href="/assets/new" />
          <ShellPanelRow label={m.subBench} href="/bench" />
        </ShellPanelSection>
      </ShellPanelContent>
    </Popover>
  );
}
