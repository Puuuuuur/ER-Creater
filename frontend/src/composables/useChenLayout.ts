export interface ChenStyle {
  entityScale: number;
  relationScale: number;
  ellipseScale: number;
  hGap: number;
  vGap: number;
  lineWidth: number;
  fontScale: number;
}

export interface ChenAttribute {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface ChenEntity {
  id: string;
  name: string;
  attributes: ChenAttribute[];
}

export interface ChenRelationshipEndpoint {
  entityId: string;
  cardinality: string;
}

export interface ChenRelationship {
  id: string;
  name: string;
  endpoints: ChenRelationshipEndpoint[];
  attributes: ChenAttribute[];
}

export interface ChenModel {
  entities: ChenEntity[];
  relationships: ChenRelationship[];
}

export interface ChenNodeStyle {
  scale: number;
  offsetX: number;
  offsetY: number;
  strokeWidth: number;
  fill: string;
  textColor: string;
}

export type ChenNodeStyleOverrides = Record<string, Partial<ChenNodeStyle>>;

export interface ChenRenderOptions {
  nodeOverrides?: ChenNodeStyleOverrides;
  selectedNodeId?: string | null;
}

type BackboneNode = {
  id: string;
  type: "entity" | "relationship";
  name: string;
  width: number;
  height: number;
  attributes: ChenAttribute[];
  endpoints?: ChenRelationshipEndpoint[];
  nodeStyle: ChenNodeStyle;
  x: number;
  y: number;
  orbitRadius: number;
  envelopeX: number;
  envelopeY: number;
};

type AttributeNode = {
  id: string;
  type: "attribute";
  parentId: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  label: string;
  isPrimary: boolean;
};

type EntityRelationshipEdge = {
  type: "entityRelationship";
  entityId: string;
  relationshipId: string;
  cardinality: string;
};

type AttributeLinkEdge = {
  type: "attributeLink";
  fromId: string;
  toId: string;
};

type SceneNode = BackboneNode | AttributeNode;

type Scene = {
  nodes: SceneNode[];
  nodeById: Map<string, SceneNode>;
  edges: Array<EntityRelationshipEdge | AttributeLinkEdge>;
  cardinalityLabels: Array<{ text: string; x: number; y: number }>;
  width: number;
  height: number;
};

export const DEFAULT_CHEN_STYLE: ChenStyle = {
  entityScale: 1,
  relationScale: 1.25,
  ellipseScale: 1,
  hGap: 200,
  vGap: 125,
  lineWidth: 2.8,
  fontScale: 1,
};

export const DEFAULT_CHEN_NODE_STYLE: ChenNodeStyle = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  strokeWidth: 0,
  fill: "#ffffff",
  textColor: "#111111",
};

function normalizeStyle(style: Partial<ChenStyle>): ChenStyle {
  return {
    entityScale: Number(style.entityScale ?? DEFAULT_CHEN_STYLE.entityScale),
    relationScale: Number(style.relationScale ?? DEFAULT_CHEN_STYLE.relationScale),
    ellipseScale: Number(style.ellipseScale ?? DEFAULT_CHEN_STYLE.ellipseScale),
    hGap: Number(style.hGap ?? DEFAULT_CHEN_STYLE.hGap),
    vGap: Number(style.vGap ?? DEFAULT_CHEN_STYLE.vGap),
    lineWidth: Number(style.lineWidth ?? DEFAULT_CHEN_STYLE.lineWidth),
    fontScale: Number(style.fontScale ?? DEFAULT_CHEN_STYLE.fontScale),
  };
}

function normalizeColor(rawColor: string, fallback: string): string {
  const color = String(rawColor || "").trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
    return color;
  }
  return fallback;
}

function normalizeNodeStyle(style: Partial<ChenNodeStyle> | undefined): ChenNodeStyle {
  return {
    scale: Math.max(0.6, Math.min(2.8, Number(style?.scale ?? DEFAULT_CHEN_NODE_STYLE.scale))),
    offsetX: Math.max(-1400, Math.min(1400, Number(style?.offsetX ?? DEFAULT_CHEN_NODE_STYLE.offsetX))),
    offsetY: Math.max(-1400, Math.min(1400, Number(style?.offsetY ?? DEFAULT_CHEN_NODE_STYLE.offsetY))),
    strokeWidth: Math.max(0, Math.min(12, Number(style?.strokeWidth ?? DEFAULT_CHEN_NODE_STYLE.strokeWidth))),
    fill: normalizeColor(String(style?.fill ?? DEFAULT_CHEN_NODE_STYLE.fill), DEFAULT_CHEN_NODE_STYLE.fill),
    textColor: normalizeColor(String(style?.textColor ?? DEFAULT_CHEN_NODE_STYLE.textColor), DEFAULT_CHEN_NODE_STYLE.textColor),
  };
}

function escapeXml(text: string): string {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function estimateTextWidth(text: string, fontSize = 16): number {
  let width = 0;
  for (const ch of String(text || "")) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      width += fontSize;
    } else if (/[A-Z]/.test(ch)) {
      width += fontSize * 0.66;
    } else if (/[a-z0-9_]/.test(ch)) {
      width += fontSize * 0.58;
    } else {
      width += fontSize * 0.5;
    }
  }
  return Math.max(width, fontSize * 1.2);
}

function nodeSizeForEntity(name: string, style: ChenStyle, nodeScale = 1): { width: number; height: number } {
  const scale = style.entityScale * nodeScale;
  const fontScale = style.fontScale;
  return {
    width: Math.max(120 * scale, Math.ceil((estimateTextWidth(name, 18 * fontScale) + 40) * scale)),
    height: Math.ceil(58 * scale),
  };
}

function nodeSizeForRelationship(name: string, style: ChenStyle, nodeScale = 1): { width: number; height: number } {
  const scale = style.relationScale * nodeScale;
  const fontScale = style.fontScale;
  const width = Math.max(96 * scale, Math.ceil((estimateTextWidth(name, 16 * fontScale) + 44) * scale));
  return {
    width,
    height: Math.max(64 * scale, Math.ceil(width * 0.58)),
  };
}

function nodeSizeForAttribute(name: string, isPrimary: boolean, style: ChenStyle): { rx: number; ry: number; label: string } {
  const label = isPrimary ? `${name} (PK)` : name;
  const ellipseScale = style.ellipseScale;
  const fontScale = style.fontScale;
  return {
    rx: Math.max(44 * ellipseScale, Math.ceil((estimateTextWidth(label, 15 * fontScale) / 2 + 18) * ellipseScale)),
    ry: Math.ceil(28 * ellipseScale),
    label,
  };
}

function normalizeAngle(angle: number): number {
  let value = angle % (Math.PI * 2);
  if (value < 0) {
    value += Math.PI * 2;
  }
  return value;
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, Math.PI * 2 - diff);
}

function chooseAttributeAngles(count: number, blockedAngles: number[]): number[] {
  if (count <= 0) {
    return [];
  }

  const totalCandidates = Math.max(24, count * 6);
  const candidates: Array<{ angle: number; score: number }> = [];

  for (let i = 0; i < totalCandidates; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / totalCandidates;
    let score = blockedAngles.length > 0 ? Math.PI : Math.PI * 0.7;
    for (const blocked of blockedAngles) {
      score = Math.min(score, angularDistance(angle, blocked));
    }
    candidates.push({ angle, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected: number[] = [];
  const minGap = Math.min(Math.PI * 0.95, Math.max(0.52, ((Math.PI * 2) / (count + 2)) * 0.92));

  for (const candidate of candidates) {
    if (selected.every((picked) => angularDistance(picked, candidate.angle) >= minGap)) {
      selected.push(candidate.angle);
    }
    if (selected.length === count) {
      break;
    }
  }

  if (selected.length < count) {
    const fallbackStep = (Math.PI * 2) / count;
    for (let i = selected.length; i < count; i += 1) {
      selected.push(-Math.PI / 2 + i * fallbackStep);
    }
  }

  return selected;
}

function computeNodeEnvelope(node: BackboneNode, style: ChenStyle): { orbitRadius: number; envelopeX: number; envelopeY: number } {
  const attrs = node.attributes || [];
  let maxAttrRx = 0;
  let maxAttrRy = 0;

  for (const attr of attrs) {
    const size = nodeSizeForAttribute(attr.name, Boolean(attr.isPrimary), style);
    maxAttrRx = Math.max(maxAttrRx, size.rx);
    maxAttrRy = Math.max(maxAttrRy, size.ry);
  }

  let orbitRadius = Math.max(node.width, node.height) * 0.62 + 88 * style.ellipseScale;
  if (attrs.length > 0) {
    orbitRadius += Math.min(100, attrs.length * 8) * style.ellipseScale;
  } else {
    orbitRadius = Math.max(node.width, node.height) * 0.5 + 26;
  }

  const envelopeX = Math.max(node.width / 2 + 24, orbitRadius + maxAttrRx + 16);
  const envelopeY = Math.max(node.height / 2 + 24, orbitRadius + maxAttrRy + 16);

  return { orbitRadius, envelopeX, envelopeY };
}

function connectedComponents(nodes: BackboneNode[], adjacency: Map<string, Set<string>>): BackboneNode[][] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const components: BackboneNode[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }

    const queue = [node.id];
    const component: BackboneNode[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        continue;
      }
      const current = byId.get(id);
      if (current) {
        component.push(current);
      }

      for (const neighbor of adjacency.get(id) || []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  return components;
}

function buildBackboneLayout(model: ChenModel, style: ChenStyle, nodeOverrides: ChenNodeStyleOverrides): {
  nodes: BackboneNode[];
  nodeById: Map<string, BackboneNode>;
  edges: EntityRelationshipEdge[];
} {
  const backboneNodes: BackboneNode[] = [];
  const adjacency = new Map<string, Set<string>>();
  const nodeById = new Map<string, BackboneNode>();
  const edges: EntityRelationshipEdge[] = [];

  for (const entity of model.entities || []) {
    const nodeStyle = normalizeNodeStyle(nodeOverrides[entity.id]);
    const size = nodeSizeForEntity(entity.name, style, nodeStyle.scale);
    const node: BackboneNode = {
      id: entity.id,
      type: "entity",
      name: entity.name,
      width: size.width,
      height: size.height,
      attributes: entity.attributes || [],
      nodeStyle,
      x: 0,
      y: 0,
      orbitRadius: 0,
      envelopeX: 0,
      envelopeY: 0,
    };
    Object.assign(node, computeNodeEnvelope(node, style));
    backboneNodes.push(node);
    nodeById.set(node.id, node);
    adjacency.set(node.id, new Set());
  }

  for (const relationship of model.relationships || []) {
    const nodeStyle = normalizeNodeStyle(nodeOverrides[relationship.id]);
    const size = nodeSizeForRelationship(relationship.name, style, nodeStyle.scale);
    const node: BackboneNode = {
      id: relationship.id,
      type: "relationship",
      name: relationship.name,
      width: size.width,
      height: size.height,
      attributes: relationship.attributes || [],
      endpoints: relationship.endpoints || [],
      nodeStyle,
      x: 0,
      y: 0,
      orbitRadius: 0,
      envelopeX: 0,
      envelopeY: 0,
    };
    Object.assign(node, computeNodeEnvelope(node, style));
    backboneNodes.push(node);
    nodeById.set(node.id, node);
    adjacency.set(node.id, new Set());
  }

  for (const relationship of model.relationships || []) {
    const relNode = nodeById.get(relationship.id);
    if (!relNode) {
      continue;
    }

    for (const endpoint of relationship.endpoints || []) {
      const entityNode = nodeById.get(endpoint.entityId);
      if (!entityNode) {
        continue;
      }
      adjacency.get(relNode.id)?.add(entityNode.id);
      adjacency.get(entityNode.id)?.add(relNode.id);
      edges.push({
        type: "entityRelationship",
        entityId: entityNode.id,
        relationshipId: relNode.id,
        cardinality: endpoint.cardinality || "N",
      });
    }
  }

  const components = connectedComponents(backboneNodes, adjacency);
  const H_MARGIN = Number(style.hGap) || 260;
  const V_MARGIN = Number(style.vGap) || 170;
  const COMPONENT_GAP = Math.round(H_MARGIN * 1.3);
  let offsetX = 0;

  for (const component of components) {
    const root = component.find((node) => node.type === "relationship") || component[0];
    if (!root) {
      continue;
    }

    const depth = new Map<string, number>();
    const queue = [root.id];
    depth.set(root.id, 0);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      const currentDepth = depth.get(currentId) || 0;
      for (const neighbor of adjacency.get(currentId) || []) {
        if (depth.has(neighbor)) {
          continue;
        }
        depth.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }

    const levels = new Map<number, BackboneNode[]>();
    for (const node of component) {
      const d = depth.get(node.id) || 0;
      if (!levels.has(d)) {
        levels.set(d, []);
      }
      levels.get(d)?.push(node);
    }

    const orderedDepths = [...levels.keys()].sort((a, b) => a - b);
    const xByDepth = new Map<number, number>();
    let prevDepth: number | null = null;

    for (const d of orderedDepths) {
      if (prevDepth === null) {
        xByDepth.set(d, 0);
        prevDepth = d;
        continue;
      }

      const prevNodes = levels.get(prevDepth) || [];
      const currentNodes = levels.get(d) || [];
      const prevMaxEnvelopeX = Math.max(...prevNodes.map((node) => node.envelopeX));
      const currMaxEnvelopeX = Math.max(...currentNodes.map((node) => node.envelopeX));
      const x = (xByDepth.get(prevDepth) || 0) + prevMaxEnvelopeX + currMaxEnvelopeX + H_MARGIN;
      xByDepth.set(d, x);
      prevDepth = d;
    }

    for (const d of orderedDepths) {
      const levelNodes = (levels.get(d) || []).sort((a, b) => a.id.localeCompare(b.id, "zh-Hans-CN"));
      if (levelNodes.length === 0) {
        continue;
      }

      let yCursor = 0;
      levelNodes[0].y = 0;

      for (let i = 1; i < levelNodes.length; i += 1) {
        const prevNode = levelNodes[i - 1];
        const currNode = levelNodes[i];
        yCursor += prevNode.envelopeY + currNode.envelopeY + V_MARGIN;
        currNode.y = yCursor;
      }

      const minY = Math.min(...levelNodes.map((node) => node.y - node.envelopeY));
      const maxY = Math.max(...levelNodes.map((node) => node.y + node.envelopeY));
      const centerY = (minY + maxY) / 2;

      levelNodes.forEach((node) => {
        node.x = offsetX + (xByDepth.get(d) || 0);
        node.y -= centerY;
      });
    }

    const compMinX = Math.min(...component.map((node) => node.x - node.envelopeX));
    const compMaxX = Math.max(...component.map((node) => node.x + node.envelopeX));
    offsetX += compMaxX - compMinX + COMPONENT_GAP;
  }

  for (const node of backboneNodes) {
    node.x += node.nodeStyle.offsetX;
    node.y += node.nodeStyle.offsetY;
  }

  return { nodes: backboneNodes, nodeById, edges };
}

function attributesOverlap(cx: number, cy: number, rx: number, ry: number, other: AttributeNode): boolean {
  return Math.abs(cx - other.x) < rx + other.rx + 16 && Math.abs(cy - other.y) < ry + other.ry + 16;
}

function overlapsBackboneNode(cx: number, cy: number, rx: number, ry: number, node: BackboneNode): boolean {
  const xPad = node.width / 2 + rx + 24;
  const yPad = node.height / 2 + ry + 24;
  return Math.abs(cx - node.x) < xPad && Math.abs(cy - node.y) < yPad;
}

function placeAttributeNodes(
  layout: { nodes: BackboneNode[]; nodeById: Map<string, BackboneNode>; edges: EntityRelationshipEdge[] },
  style: ChenStyle,
): { attributeNodes: AttributeNode[]; attributeEdges: AttributeLinkEdge[] } {
  const attributeNodes: AttributeNode[] = [];
  const attributeEdges: AttributeLinkEdge[] = [];
  const neighborAnglesByNode = new Map<string, number[]>();

  for (const node of layout.nodes) {
    neighborAnglesByNode.set(node.id, []);
  }

  for (const edge of layout.edges) {
    const entityNode = layout.nodeById.get(edge.entityId);
    const relationNode = layout.nodeById.get(edge.relationshipId);
    if (!entityNode || !relationNode) {
      continue;
    }

    const entityAngle = Math.atan2(relationNode.y - entityNode.y, relationNode.x - entityNode.x);
    const relationAngle = Math.atan2(entityNode.y - relationNode.y, entityNode.x - relationNode.x);
    neighborAnglesByNode.get(entityNode.id)?.push(entityAngle);
    neighborAnglesByNode.get(relationNode.id)?.push(relationAngle);
  }

  for (const node of layout.nodes) {
    const attrs = node.attributes || [];
    if (attrs.length === 0) {
      continue;
    }

    const blockedAngles = neighborAnglesByNode.get(node.id) || [];
    const plannedAngles = chooseAttributeAngles(attrs.length, blockedAngles);

    attrs.forEach((attr, idx) => {
      const size = nodeSizeForAttribute(attr.name, Boolean(attr.isPrimary), style);
      let angle = plannedAngles[idx] ?? (-Math.PI / 2 + (idx * Math.PI * 2) / attrs.length);
      let dist = node.orbitRadius + size.rx * 0.16;
      let x = node.x + Math.cos(angle) * dist;
      let y = node.y + Math.sin(angle) * dist;

      for (let step = 0; step < 18; step += 1) {
        let hit = false;

        for (const otherNode of layout.nodes) {
          if (otherNode.id === node.id) {
            continue;
          }
          if (overlapsBackboneNode(x, y, size.rx, size.ry, otherNode)) {
            hit = true;
            break;
          }
        }

        if (!hit) {
          for (const placed of attributeNodes) {
            if (attributesOverlap(x, y, size.rx, size.ry, placed)) {
              hit = true;
              break;
            }
          }
        }

        if (!hit) {
          break;
        }

        dist += 28 * style.ellipseScale;
        angle += step % 2 === 0 ? 0.08 : -0.08;
        x = node.x + Math.cos(angle) * dist;
        y = node.y + Math.sin(angle) * dist;
      }

      attributeNodes.push({
        id: attr.id,
        type: "attribute",
        parentId: node.id,
        x,
        y,
        rx: size.rx,
        ry: size.ry,
        label: size.label,
        isPrimary: Boolean(attr.isPrimary),
      });
      attributeEdges.push({
        type: "attributeLink",
        fromId: node.id,
        toId: attr.id,
      });
    });
  }

  return { attributeNodes, attributeEdges };
}

function computeScene(model: ChenModel, style: ChenStyle, nodeOverrides: ChenNodeStyleOverrides): Scene {
  const backbone = buildBackboneLayout(model, style, nodeOverrides);
  const attrs = placeAttributeNodes(backbone, style);
  const allNodes: SceneNode[] = [...backbone.nodes, ...attrs.attributeNodes];
  const allEdges: Array<EntityRelationshipEdge | AttributeLinkEdge> = [...backbone.edges, ...attrs.attributeEdges];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of allNodes) {
    let left = node.x;
    let right = node.x;
    let top = node.y;
    let bottom = node.y;

    if (node.type === "entity" || node.type === "relationship") {
      left -= node.width / 2;
      right += node.width / 2;
      top -= node.height / 2;
      bottom += node.height / 2;
    } else {
      left -= node.rx;
      right += node.rx;
      top -= node.ry;
      bottom += node.ry;
    }

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 900;
    maxY = 500;
  }

  const padding = 90;
  const shiftX = padding - minX;
  const shiftY = padding - minY;

  for (const node of allNodes) {
    node.x += shiftX;
    node.y += shiftY;
  }

  const nodeById = new Map<string, SceneNode>(allNodes.map((node) => [node.id, node]));

  const cardinalityLabels: Array<{ text: string; x: number; y: number }> = [];
  for (const edge of allEdges) {
    if (edge.type !== "entityRelationship") {
      continue;
    }
    const entity = nodeById.get(edge.entityId);
    const relation = nodeById.get(edge.relationshipId);
    if (!entity || !relation) {
      continue;
    }
    const t = 0.62;
    cardinalityLabels.push({
      text: edge.cardinality,
      x: entity.x * (1 - t) + relation.x * t,
      y: entity.y * (1 - t) + relation.y * t,
    });
  }

  return {
    nodes: allNodes,
    nodeById,
    edges: allEdges,
    cardinalityLabels,
    width: Math.ceil(maxX - minX + padding * 2),
    height: Math.ceil(maxY - minY + padding * 2),
  };
}

export function renderChenSvg(model: ChenModel, styleInput: Partial<ChenStyle>, options: ChenRenderOptions = {}): string {
  const style = normalizeStyle(styleInput);
  const nodeOverrides = options.nodeOverrides || {};
  const selectedNodeId = options.selectedNodeId || null;
  const scene = computeScene(model, style, nodeOverrides);

  const lineWidth = Number(style.lineWidth) || 2.8;
  const entityStroke = Math.max(1.8, lineWidth * 1.35);
  const relationStroke = Math.max(1.8, lineWidth * 1.35);
  const attrStroke = Math.max(1.2, lineWidth * 1.05);
  const labelFont = Math.max(12, Math.round(22 * style.fontScale));
  const attrFont = Math.max(11, Math.round(20 * style.fontScale));
  const cardFont = Math.max(11, Math.round(22 * style.fontScale));

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="Chen ER Diagram">`,
  );
  lines.push("<style>");
  lines.push(
    `.line{stroke:#111;stroke-width:${lineWidth.toFixed(2)};fill:none;stroke-linecap:round;stroke-linejoin:round;shape-rendering:geometricPrecision;}`,
  );
  lines.push(`.entity{stroke:#111;stroke-width:${entityStroke.toFixed(2)};shape-rendering:geometricPrecision;}`);
  lines.push(
    `.relation{stroke:#111;stroke-width:${relationStroke.toFixed(2)};stroke-linejoin:round;shape-rendering:geometricPrecision;}`,
  );
  lines.push(`.attr{fill:#fff;stroke:#111;stroke-width:${attrStroke.toFixed(2)};shape-rendering:geometricPrecision;}`);
  lines.push(".node-shape{cursor:grab;}");
  lines.push(".node-hit{fill:#000;fill-opacity:0;stroke:none;pointer-events:all;cursor:grab;}");
  lines.push(".selected-node .node-shape{stroke:#0f766e !important;filter:drop-shadow(0 0 1px #0f766e);}");
  lines.push(
    `.label{font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:${labelFont}px;text-anchor:middle;dominant-baseline:middle;pointer-events:none;text-rendering:geometricPrecision;}`,
  );
  lines.push(
    `.attrLabel{fill:#111;font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:${attrFont}px;text-anchor:middle;dominant-baseline:middle;pointer-events:none;text-rendering:geometricPrecision;}`,
  );
  lines.push(".pk{text-decoration:underline;}");
  lines.push(
    `.card{fill:#111;font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:${cardFont}px;font-weight:600;text-anchor:middle;dominant-baseline:middle;pointer-events:none;text-rendering:geometricPrecision;}`,
  );
  lines.push("</style>");

  for (const edge of scene.edges) {
    if (edge.type === "entityRelationship") {
      const entity = scene.nodeById.get(edge.entityId);
      const relation = scene.nodeById.get(edge.relationshipId);
      if (entity && relation) {
        lines.push(
          `<line class="line edge-er" data-edge-type="entityRelationship" data-entity-id="${escapeXml(edge.entityId)}" data-relationship-id="${escapeXml(edge.relationshipId)}" x1="${entity.x}" y1="${entity.y}" x2="${relation.x}" y2="${relation.y}" />`,
        );
      }
    }

    if (edge.type === "attributeLink") {
      const from = scene.nodeById.get(edge.fromId);
      const to = scene.nodeById.get(edge.toId);
      if (from && to) {
        lines.push(
          `<line class="line edge-attr" data-edge-type="attributeLink" data-from-id="${escapeXml(edge.fromId)}" data-to-id="${escapeXml(edge.toId)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`,
        );
      }
    }
  }

  for (const label of scene.cardinalityLabels) {
    const boxW = Math.ceil(estimateTextWidth(label.text, cardFont) + 16);
    lines.push(`<rect x="${label.x - boxW / 2}" y="${label.y - 14}" width="${boxW}" height="28" fill="#fff" />`);
    lines.push(`<text class="card" x="${label.x}" y="${label.y}">${escapeXml(label.text)}</text>`);
  }

  for (const node of scene.nodes) {
    if (node.type === "entity") {
      const HIT_PAD = 12;
      const isSelected = selectedNodeId === node.id;
      const strokeWidth = node.nodeStyle.strokeWidth > 0 ? node.nodeStyle.strokeWidth : entityStroke;
      const strokeColor = isSelected ? "#0f766e" : "#111111";
      const fillColor = escapeXml(node.nodeStyle.fill);
      const textColor = escapeXml(node.nodeStyle.textColor);
      const entityClass = isSelected ? "entity node-shape selected-shape" : "entity node-shape";
      const groupClass = isSelected ? "selected-node" : "normal-node";
      const nodeId = escapeXml(node.id);
      const nodeName = escapeXml(node.name);
      lines.push(`<g class="${groupClass}" data-node-id="${nodeId}" data-node-type="entity" data-node-name="${nodeName}">`);
      lines.push(
        `<rect class="node-hit" x="${node.x - node.width / 2 - HIT_PAD}" y="${node.y - node.height / 2 - HIT_PAD}" width="${node.width + HIT_PAD * 2}" height="${node.height + HIT_PAD * 2}" />`,
      );
      lines.push(
        `<rect class="${entityClass}" x="${node.x - node.width / 2}" y="${node.y - node.height / 2}" width="${node.width}" height="${node.height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(2)}" />`,
      );
      lines.push(`<text class="label" x="${node.x}" y="${node.y}" fill="${textColor}">${nodeName}</text>`);
      lines.push("</g>");
    } else if (node.type === "relationship") {
      const HIT_PAD = 12;
      const isSelected = selectedNodeId === node.id;
      const strokeWidth = node.nodeStyle.strokeWidth > 0 ? node.nodeStyle.strokeWidth : relationStroke;
      const strokeColor = isSelected ? "#0f766e" : "#111111";
      const fillColor = escapeXml(node.nodeStyle.fill);
      const textColor = escapeXml(node.nodeStyle.textColor);
      const relationClass = isSelected ? "relation node-shape selected-shape" : "relation node-shape";
      const groupClass = isSelected ? "selected-node" : "normal-node";
      const nodeId = escapeXml(node.id);
      const nodeName = escapeXml(node.name);
      const points = [
        `${node.x},${node.y - node.height / 2}`,
        `${node.x + node.width / 2},${node.y}`,
        `${node.x},${node.y + node.height / 2}`,
        `${node.x - node.width / 2},${node.y}`,
      ].join(" ");
      const hitPoints = [
        `${node.x},${node.y - node.height / 2 - HIT_PAD}`,
        `${node.x + node.width / 2 + HIT_PAD},${node.y}`,
        `${node.x},${node.y + node.height / 2 + HIT_PAD}`,
        `${node.x - node.width / 2 - HIT_PAD},${node.y}`,
      ].join(" ");
      lines.push(`<g class="${groupClass}" data-node-id="${nodeId}" data-node-type="relationship" data-node-name="${nodeName}">`);
      lines.push(`<polygon class="node-hit" points="${hitPoints}" />`);
      lines.push(`<polygon class="${relationClass}" points="${points}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(2)}" />`);
      lines.push(`<text class="label" x="${node.x}" y="${node.y}" fill="${textColor}">${nodeName}</text>`);
      lines.push("</g>");
    } else if (node.type === "attribute") {
      const attrId = escapeXml(node.id);
      const parentId = escapeXml(node.parentId);
      lines.push(`<g data-node-id="${attrId}" data-node-type="attribute" data-parent-id="${parentId}">`);
      lines.push(`<ellipse class="attr" cx="${node.x}" cy="${node.y}" rx="${node.rx}" ry="${node.ry}" />`);
      const pkClass = node.isPrimary ? "attrLabel pk" : "attrLabel";
      lines.push(`<text class="${pkClass}" x="${node.x}" y="${node.y}">${escapeXml(node.label)}</text>`);
      lines.push("</g>");
    }
  }

  lines.push("</svg>");
  return lines.join("\n");
}
