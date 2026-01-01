import { CONTINUOUS_BLOCKS } from "./blocks-registry-continuous.js";
import { EVENT_BLOCKS } from "./blocks-registry-event.js";
import { LIVE_BLOCKS } from "./blocks-registry-live.js";

const mergedRegistry = {
  ...CONTINUOUS_BLOCKS,
  ...EVENT_BLOCKS,
  ...LIVE_BLOCKS
};

Object.values(mergedRegistry).forEach((entry) => {
  if (!entry) return;
  if (!entry.emptyPolicy) {
    entry.emptyPolicy =
      entry.blockType === "CONTINUOUS"
        ? "NEVER_EMPTY"
        : entry.blockType === "LIVE"
          ? "STALE_OK"
          : "EMPTY_OK_WITH_CONTEXT";
  }
});

export const BLOCK_REGISTRY = mergedRegistry;

export const MIRROR_IDS = Object.values(BLOCK_REGISTRY).flatMap((entry) => entry.mirrorFiles);
