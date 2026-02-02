export function getIn(obj, pathStr) {
    if (!obj) return undefined;
    const parts = pathStr.split('.');
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    return current;
}

export function inspect(payload, spec) {
    const presentPaths = {};
    const extractedValues = {};
    const violations = [];

    for (const [key, candidates] of Object.entries(spec)) {
        let found = false;
        for (const pathStr of candidates) {
            const val = getIn(payload, pathStr);
            if (val !== undefined && val !== null) {
                presentPaths[pathStr] = true;
                if (!found) {
                    extractedValues[key] = val;
                    found = true;
                }
            } else {
                presentPaths[pathStr] = false;
            }
        }
        if (!found) {
            violations.push(`Missing required key: ${key} (checked: ${candidates.join(', ')})`);
        }
    }

    return { presentPaths, extractedValues, violations };
}
