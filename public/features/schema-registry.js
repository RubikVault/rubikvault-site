export const BLOCK_SCHEMAS = {
  "*": [
    {
      path: "/meta/status",
      required: true
    },
    {
      path: "/meta/updatedAt",
      required: false
    }
  ]
};

export const VALIDATORS = {
  isoDate(value) {
    if (typeof value !== "string") return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed);
  }
};
