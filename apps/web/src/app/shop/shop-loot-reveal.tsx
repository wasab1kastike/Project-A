"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCosmeticSpriteStyle } from "@/lib/game/cosmetic-sprites";
import { unequipCosmeticAction } from "@/app/game-actions";
import styles from "../arcade/page.module.css";

type RevealSkin = {
  slot: "UNIT" | "FORTRESS";
  variant: string;
  name: string;
  rarity: string;
  description: string;
};

function getPreviewStyle(skin: RevealSkin) {
  const spriteStyle = getCosmeticSpriteStyle(skin.slot, skin.variant);

  return (
    spriteStyle ?? {
      backgroundImage:
        skin.slot === "FORTRESS"
          ? 'url("/assets/fortress-sprites-generated.png")'
          : 'url("/assets/unit-sprites.png")',
      backgroundSize: "contain",
      backgroundPosition: "center",
    }
  );
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
              Equip this skin
            </button>
            <form action={unequipCosmeticAction}>
              <input
                type="hidden"
                name="slot"
                value={skin.slot}
              />
              <button
                className={styles.secondaryButton}
                type="submit"
              >
                Keep default skin
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
