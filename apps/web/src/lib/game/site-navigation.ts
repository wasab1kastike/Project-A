export const PATCH_NOTES_PAGE_HREF = "/patch-notes";

export const PRIMARY_GAME_NAV_LINKS = [
  {
    href: "/history",
    label: "History",
  },
  {
    href: "/arcade",
    label: "Arcade",
  },
  {
    href: PATCH_NOTES_PAGE_HREF,
    label: "Patch notes",
  },
] as const;
