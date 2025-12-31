import { CONTINUOUS_BLOCKS } from "./blocks-registry-continuous.js";
import { EVENT_BLOCKS } from "./blocks-registry-event.js";
import { LIVE_BLOCKS } from "./blocks-registry-live.js";

export const BLOCK_REGISTRY = {
  ...CONTINUOUS_BLOCKS,
  ...EVENT_BLOCKS,
  ...LIVE_BLOCKS
};

export const MIRROR_IDS = Object.values(BLOCK_REGISTRY).flatMap((entry) => entry.mirrorFiles);
