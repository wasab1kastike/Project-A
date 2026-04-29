export const PATCH_NOTES_PAGE_HREF = "/patch-notes";
export const WIKI_PAGE_HREF = "/wiki";

export const PRIMARY_GAME_NAV_LINKS = [
  {
    href: "/history",
    label: "History",
  },
  {
    href: "/shop",
    label: "Shop",
  },
  {
    href: WIKI_PAGE_HREF,
    label: "Wiki",
  },
  {
    href: PATCH_NOTES_PAGE_HREF,
    label: "Patch notes",
  },
] as const;
