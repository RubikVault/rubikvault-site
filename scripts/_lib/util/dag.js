export function buildGraph(registry) {
  const graph = new Map();
  const features = Array.isArray(registry?.features) ? registry.features : [];
  for (const feature of features) {
    const deps = Array.isArray(feature.dependencies) ? feature.dependencies : [];
    graph.set(feature.id, new Set(deps));
  }
  return graph;
}

export function topoSort(graph) {
  const inDegree = new Map();
  for (const [node, deps] of graph.entries()) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    }
  }
  const queue = [];
  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(node);
  }
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    const deps = graph.get(node) || new Set();
    for (const dep of deps) {
      inDegree.set(dep, inDegree.get(dep) - 1);
      if (inDegree.get(dep) === 0) queue.push(dep);
    }
  }
  return order;
}

export function findCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  const path = [];

  const dfs = (node) => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      return start >= 0 ? path.slice(start).concat(node) : [node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    path.push(node);
    const deps = graph.get(node) || new Set();
    for (const dep of deps) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    path.pop();
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}
