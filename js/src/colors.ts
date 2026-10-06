import type { LinkState } from "./types";

/** VOODO theme variables, so the graph follows the App's light/dark mode. */
export const STATE_COLORS: Record<LinkState, string> = {
  right: "var(--color-content-icon-success)",
  wrong: "var(--color-content-icon-failure)",
  missed: "var(--color-content-icon-warning)",
  none: "var(--color-content-text-muted)",
};

export const STATE_LABELS: Record<LinkState, string> = {
  right: "Right link",
  wrong: "Wrong link",
  missed: "Missed original",
  none: "Not linked",
};

export const ACCENT = "var(--color-brand-accent)";
export const BORDER = "var(--color-content-border-default)";
export const BORDER_STRONG = "var(--color-content-border-strong)";
export const CARD = "var(--color-content-bg-card)";
export const TEXT_MUTED = "var(--color-content-text-muted)";
export const TEXT_PRIMARY = "var(--color-content-text-primary)";
