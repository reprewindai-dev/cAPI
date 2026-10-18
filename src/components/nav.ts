import {
  Bot,
  Boxes,
  FlaskConical,
  Plug,
  Radio,
  Scale,
  ScrollText,
  ShieldAlert,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

/** The sidebar. One entry per page: a test fails if an href or label repeats or a page is missing. */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: Radio, hint: "Live" },
  { href: "/connect", label: "Connect", icon: Plug, hint: "MCP" },
  { href: "/console", label: "Console", icon: TerminalSquare, hint: "Gate" },
  { href: "/registry", label: "Registry", icon: Boxes, hint: "Capabilities" },
  { href: "/agents", label: "Agents", icon: Bot, hint: "Trust & Risk" },
  { href: "/ledger", label: "Ledger", icon: ScrollText, hint: "Evidence" },
  { href: "/governance", label: "Governance", icon: Scale, hint: "Rules" },
  { href: "/safety", label: "Safety", icon: ShieldAlert, hint: "Quarantine" },
  { href: "/testbed", label: "Test Bed", icon: FlaskConical, hint: "MCP/API" },
];
