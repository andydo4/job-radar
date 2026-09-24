export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE = "primer-theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Browser only: switch the page theme right away and remember the choice for a year. */
export function applyTheme(next: Theme): void {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);
  document.cookie =
    next === "system"
      ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}
