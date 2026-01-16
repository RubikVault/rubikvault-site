const VALID_UIS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function resolveUi({ query, stored, defaultUi }) {
  const normalizedQuery = query ? String(query).toUpperCase() : "";
  if (VALID_UIS.includes(normalizedQuery)) return normalizedQuery;
  const normalizedStored = stored ? String(stored).toUpperCase() : "";
  if (VALID_UIS.includes(normalizedStored)) return normalizedStored;
  return VALID_UIS.includes(defaultUi) ? defaultUi : "A";
}

const resolved = resolveUi({ query: "H", stored: "C", defaultUi: "A" });
if (resolved !== "H") {
  console.error(`Expected ui H, got ${resolved}`);
  process.exit(1);
}

console.log("metrics-ui-selection ok");
