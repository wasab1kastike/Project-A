"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "../arcade/page.module.css";

type RevealSkin = {
  slot: "UNIT" | "FORTRESS";
  variant: string;
  name: string;
  rarity: string;
  description: string;
};

const UNIT_SKIN_SHEETS: Array<{
  src: string;
  variants: string[];
  columns: number;
}> = [
  {
    src: "/assets/loot-box-set-1.png",
    columns: 4,
    variants: [
      "silver-knight",
      "lava-berserker",
      "forest-archer",
      "apprentice-mage",
      "shadow-rogue",
      "void-sorcerer",
      "dark-vanguard",
      "stone-berserker",
      "ranger-scout",
      "steam-engineer",
      "clockwork-smith",
      "purple-necromancer",
      "gold-prospector",
      "bone-reaver",
      "hooded-hexer",
      "crystal-warlock",
    ],
  },
  {
    src: "/assets/loot-box-units-set1.png",
    columns: 2,
    variants: [
      "samurai-knight",
      "plague-doctor-mage",
      "thunder-berserker",
      "cactus-ranger",
    ],
  },
  {
    src: "/assets/loot-box-units-set2.png",
    columns: 2,
    variants: [
      "vampire-rogue",
      "angel-paladin",
      "goblin-engineer",
      "sand-necromancer",
    ],
  },
  {
    src: "/assets/loot-box-units-set3.png",
    columns: 2,
    variants: [
      "mushroom-druid",
      "neon-assassin",
      "frost-giant-warrior",
      "lava-shaman",
    ],
  },
  {
    src: "/assets/loot-box-units-set4.png",
    columns: 2,
    variants: [
      "royal-musketeer",
      "beekeeper-lancer",
      "steam-mech-soldier",
      "shadow-monk",
    ],
  },
  {
    src: "/assets/loot-box-units--spacemurines-set1.png",
    columns: 2,
    variants: [
      "void-legionnaire",
      "crimson-vanguard",
      "iron-devastator",
      "high-marshal-aurex",
    ],
  },
  {
    src: "/assets/loot-box-units-tyranimips-set1.png",
    columns: 2,
    variants: [
      "brood-gaunt",
      "venom-shrieker",
      "tunnel-ravager",
      "hive-tyrant-prime",
    ],
  },
];

const FORTRESS_SKIN_SHEETS: Array<{
  src: string;
  variants: string[];
  columns: number;
}> = [
  {
    src: "/assets/loot-box-set-1.png",
    columns: 4,
    variants: [
      "ice-fortress",
      "lava-citadel",
      "forest-keep",
      "void-castle",
      "frosthold-bastion",
      "molten-stronghold",
      "golden-capital",
      "shadow-spire",
    ],
  },
  {
    src: "/assets/loot-box-fortress-set2.png",
    columns: 3,
    variants: [
      "desert-fortress",
      "crystal-citadel",
      "cyber-fortress",
      "swamp-keep",
      "mechanical-drill-fortress",
      "ancient-mire-temple",
    ],
  },
];

function getPreviewStyle(skin: RevealSkin) {
  const sheets =
    skin.slot === "FORTRESS" ? FORTRESS_SKIN_SHEETS : UNIT_SKIN_SHEETS;

  for (const sheet of sheets) {
    const index = sheet.variants.indexOf(skin.variant);

    if (index === -1) {
      continue;
    }

    const rows = Math.ceil(sheet.variants.length / sheet.columns);
    const column = index % sheet.columns;
    const row = Math.floor(index / sheet.columns);
    const x = sheet.columns === 1 ? 0 : (column / (sheet.columns - 1)) * 100;
    const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;

    return {
      backgroundImage: `url("${sheet.src}")`,
      backgroundSize: `${sheet.columns * 100}% ${rows * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    };
  }

  return {
    backgroundImage:
      skin.slot === "FORTRESS"
        ? 'url("/assets/fortress-sprites-generated.png")'
        : 'url("/assets/unit-sprites.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  };
}

export function ShopLootReveal({
  duplicate,
  skin,
}: {
  duplicate: boolean;
  skin: RevealSkin;
}) {
  const [visible, setVisible] = useState(true);
  const previewStyle = useMemo(() => getPreviewStyle(skin), [skin]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVisible(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.revealOverlay} role="dialog" aria-modal="true">
      <div className={styles.revealPanel}>
        <div className={styles.revealStage} aria-hidden="true">
          <span className={styles.revealGlow} />
          <span className={styles.revealCrate} data-slot={skin.slot} />
          <span className={styles.revealSkinPreview} style={previewStyle} />
        </div>
        <div className={styles.revealCopy}>
          <span className={styles.sectionLabel}>
            {duplicate ? "Duplicate skin" : "New skin unlocked"}
          </span>
          <h2>{skin.name}</h2>
          <div className={styles.skinBadges}>
            <span className={styles.rarityChip} data-rarity={skin.rarity}>
              {skin.rarity}
            </span>
            <span className={styles.marketPill}>
              {skin.slot === "FORTRESS" ? "Fortress skin" : "Unit skin"}
            </span>
          </div>
          <p>{skin.description}</p>
          {duplicate ? (
            <p className={styles.helperText}>
              You already own this one, so the duplicate refund was added to
              your wallet.
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => setVisible(false)}
            >
              Nice
            </button>
            <Link className={styles.secondaryButton} href="/shop">
              Clear reveal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
