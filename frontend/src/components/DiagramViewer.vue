<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import svgPanZoom from "svg-pan-zoom";

import StylePanel from "./StylePanel.vue";

const props = defineProps({
  svgMarkup: {
    type: String,
    default: "",
  },
  chenStyle: {
    type: Object,
    required: true,
  },
  styleEditable: {
    type: Boolean,
    default: false,
  },
  styleHint: {
    type: String,
    default: "",
  },
  selectedNode: {
    type: Object,
    default: null,
  },
  selectedNodeStyle: {
    type: Object,
    default: null,
  },
  nodeOverrides: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits([
  "update:chenStyle",
  "resetStyle",
  "selectNode",
  "clearSelection",
  "update:nodeStyle",
  "resetNodeStyle",
  "dragNode",
]);

const hasDiagram = computed(() => Boolean(props.svgMarkup));
const nodePanelVisible = computed(() => props.styleEditable && Boolean(props.selectedNode?.id));

const viewerOpen = ref(false);
const viewerSvgMarkup = ref("");
const viewerViewportRef = ref(null);
const viewerStageRef = ref(null);
const globalPanelOpen = ref(false);

let panzoomInstance = null;
let dragging = null;
let initialOpenViewState = null;
let viewerBaseBounds = null;
let resettingView = false;
let suppressClickUntil = 0;
const VIEWER_MIN_ZOOM = 0.02;
const VIEWER_MAX_ZOOM = 6;

function escapeSelectorValue(value) {
  const raw = String(value ?? "");
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, "\\$&");
}

function readLineCoords(lineEl) {
  return {
    x1: Number(lineEl.getAttribute("x1") || 0),
    y1: Number(lineEl.getAttribute("y1") || 0),
    x2: Number(lineEl.getAttribute("x2") || 0),
    y2: Number(lineEl.getAttribute("y2") || 0),
  };
}

function buildDragPreviewTargets(nodeMeta) {
  const svgEl = viewerStageRef.value?.querySelector("svg");
  if (!svgEl) {
    return null;
  }

  const nodeSelectorId = escapeSelectorValue(nodeMeta.id);
  const nodeSelectorType = escapeSelectorValue(nodeMeta.type);
  const nodeGroup = svgEl.querySelector(`[data-node-id="${nodeSelectorId}"][data-node-type="${nodeSelectorType}"]`);
  const attrGroups = Array.from(svgEl.querySelectorAll(`[data-parent-id="${nodeSelectorId}"]`));

  const erLines = Array.from(svgEl.querySelectorAll('line[data-edge-type="entityRelationship"]'))
    .map((lineEl) => {
      const entityId = lineEl.getAttribute("data-entity-id");
      const relationshipId = lineEl.getAttribute("data-relationship-id");
      if (entityId !== nodeMeta.id && relationshipId !== nodeMeta.id) {
        return null;
      }
      return {
        lineEl,
        moveStart: entityId === nodeMeta.id,
        base: readLineCoords(lineEl),
      };
    })
    .filter(Boolean);

  const attrLines = Array.from(svgEl.querySelectorAll(`line[data-edge-type="attributeLink"][data-from-id="${nodeSelectorId}"]`)).map(
    (lineEl) => ({
      lineEl,
      base: readLineCoords(lineEl),
    }),
  );

  return {
    nodeGroup,
    attrGroups,
    erLines,
    attrLines,
  };
}

function applyDragPreview(targets, deltaX, deltaY) {
  if (!targets) {
    return;
  }

  const translate = `translate(${deltaX} ${deltaY})`;
  if (targets.nodeGroup) {
    targets.nodeGroup.setAttribute("transform", translate);
  }
  for (const attrGroup of targets.attrGroups) {
    attrGroup.setAttribute("transform", translate);
  }

  for (const item of targets.erLines) {
    const { lineEl, moveStart, base } = item;
    if (moveStart) {
      lineEl.setAttribute("x1", String(base.x1 + deltaX));
      lineEl.setAttribute("y1", String(base.y1 + deltaY));
      lineEl.setAttribute("x2", String(base.x2));
      lineEl.setAttribute("y2", String(base.y2));
    } else {
      lineEl.setAttribute("x1", String(base.x1));
      lineEl.setAttribute("y1", String(base.y1));
      lineEl.setAttribute("x2", String(base.x2 + deltaX));
      lineEl.setAttribute("y2", String(base.y2 + deltaY));
    }
  }

  for (const item of targets.attrLines) {
    const { lineEl, base } = item;
    lineEl.setAttribute("x1", String(base.x1 + deltaX));
    lineEl.setAttribute("y1", String(base.y1 + deltaY));
    lineEl.setAttribute("x2", String(base.x2 + deltaX));
    lineEl.setAttribute("y2", String(base.y2 + deltaY));
  }
}

function resetDragPreview(targets) {
  if (!targets) {
    return;
  }

  if (targets.nodeGroup) {
    targets.nodeGroup.removeAttribute("transform");
  }
  for (const attrGroup of targets.attrGroups) {
    attrGroup.removeAttribute("transform");
  }

  for (const item of targets.erLines) {
    const { lineEl, base } = item;
    lineEl.setAttribute("x1", String(base.x1));
    lineEl.setAttribute("y1", String(base.y1));
    lineEl.setAttribute("x2", String(base.x2));
    lineEl.setAttribute("y2", String(base.y2));
  }

  for (const item of targets.attrLines) {
    const { lineEl, base } = item;
    lineEl.setAttribute("x1", String(base.x1));
    lineEl.setAttribute("y1", String(base.y1));
    lineEl.setAttribute("x2", String(base.x2));
    lineEl.setAttribute("y2", String(base.y2));
  }
}

function extractNodeMeta(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const wrapper = target.closest("[data-node-id][data-node-type]");
  if (!wrapper) {
    return null;
  }

  const nodeId = wrapper.getAttribute("data-node-id");
  const nodeType = wrapper.getAttribute("data-node-type");
  if (!nodeId || (nodeType !== "entity" && nodeType !== "relationship")) {
    return null;
  }

  const nodeName = wrapper.getAttribute("data-node-name") || nodeId;
  return {
    id: nodeId,
    type: nodeType,
    name: nodeName,
  };
}

function getNodeOffset(nodeId) {
  const nodeStyle = props.nodeOverrides?.[nodeId] || {};
  return {
    x: Number(nodeStyle.offsetX ?? 0),
    y: Number(nodeStyle.offsetY ?? 0),
  };
}

function stopDraggingListeners() {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
}

function clearDraggingState(options = {}) {
  const keepPreview = Boolean(options.keepPreview);
  stopDraggingListeners();

  if (panzoomInstance && panzoomInstance.enablePan) {
    panzoomInstance.enablePan();
  }

  if (dragging && !keepPreview) {
    resetDragPreview(dragging.previewTargets);
  }

  dragging = null;
}

function suppressNextClickBriefly() {
  suppressClickUntil = Date.now() + 420;
}

function onWindowPointerMove(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) {
    return;
  }

  const dx = event.clientX - dragging.startClientX;
  const dy = event.clientY - dragging.startClientY;
  if (!dragging.moved && Math.hypot(dx, dy) < 1.5) {
    return;
  }
  dragging.moved = true;

  const zoom = panzoomInstance && panzoomInstance.getZoom ? Number(panzoomInstance.getZoom()) : 1;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const deltaX = dx / safeZoom;
  const deltaY = dy / safeZoom;

  dragging.latestPayload = {
    id: dragging.node.id,
    type: dragging.node.type,
    name: dragging.node.name,
    offsetX: dragging.baseOffsetX + deltaX,
    offsetY: dragging.baseOffsetY + deltaY,
  };
  applyDragPreview(dragging.previewTargets, deltaX, deltaY);
}

function onWindowPointerUp(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) {
    return;
  }

  const moved = Boolean(dragging.moved);
  suppressNextClickBriefly();

  if (viewerStageRef.value?.releasePointerCapture) {
    try {
      viewerStageRef.value.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  if (dragging.latestPayload) {
    emit("dragNode", { ...dragging.latestPayload, commit: true });
    clearDraggingState({ keepPreview: true });
    return;
  }

  if (!moved) {
    emit("selectNode", dragging.node);
  }
  clearDraggingState();
}

function onViewerPointerDown(event) {
  if (!props.styleEditable) {
    return;
  }

  const nodeMeta = extractNodeMeta(event.target);
  if (!nodeMeta) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const offset = getNodeOffset(nodeMeta.id);
  const previewTargets = buildDragPreviewTargets(nodeMeta);
  dragging = {
    pointerId: event.pointerId,
    node: nodeMeta,
    startClientX: event.clientX,
    startClientY: event.clientY,
    baseOffsetX: offset.x,
    baseOffsetY: offset.y,
    moved: false,
    latestPayload: null,
    previewTargets,
  };

  if (panzoomInstance && panzoomInstance.disablePan) {
    panzoomInstance.disablePan();
  }

  if (viewerStageRef.value?.setPointerCapture) {
    try {
      viewerStageRef.value.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
}

function onViewerClick(event) {
  if (!props.styleEditable) {
    return;
  }

  if (Date.now() < suppressClickUntil) {
    return;
  }

  const nodeMeta = extractNodeMeta(event.target);
  if (nodeMeta) {
    emit("selectNode", nodeMeta);
  } else {
    emit("clearSelection");
  }
}

function snapshotViewState() {
  if (!panzoomInstance) {
    return null;
  }

  const zoom = Number(panzoomInstance.getZoom ? panzoomInstance.getZoom() : NaN);
  const pan = panzoomInstance.getPan ? panzoomInstance.getPan() : null;
  const panX = Number(pan?.x);
  const panY = Number(pan?.y);

  if (!Number.isFinite(zoom) || !Number.isFinite(panX) || !Number.isFinite(panY)) {
    return null;
  }

  return {
    zoom,
    pan: { x: panX, y: panY },
  };
}

function restoreViewState(state) {
  if (!panzoomInstance || !state) {
    return false;
  }

  const zoom = Number(state.zoom);
  const panX = Number(state.pan?.x);
  const panY = Number(state.pan?.y);
  if (!Number.isFinite(zoom) || !Number.isFinite(panX) || !Number.isFinite(panY)) {
    return false;
  }

  const targetZoom = Math.max(VIEWER_MIN_ZOOM, Math.min(VIEWER_MAX_ZOOM, zoom));
  panzoomInstance.resize();
  if (panzoomInstance.updateBBox) {
    panzoomInstance.updateBBox();
  }
  panzoomInstance.zoom(targetZoom);
  panzoomInstance.pan({ x: panX, y: panY });
  return true;
}

function readSvgBounds(svgEl) {
  try {
    const box = svgEl?.getBBox?.();
    if (box && Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0) {
      return {
        x: Number(box.x || 0),
        y: Number(box.y || 0),
        width: Number(box.width),
        height: Number(box.height),
      };
    }
  } catch {
    // Ignore getBBox failures on detached/incomplete SVG.
  }

  const viewBox = svgEl?.viewBox?.baseVal;
  if (viewBox && Number.isFinite(viewBox.width) && Number.isFinite(viewBox.height) && viewBox.width > 0 && viewBox.height > 0) {
    return {
      x: Number(viewBox.x || 0),
      y: Number(viewBox.y || 0),
      width: Number(viewBox.width),
      height: Number(viewBox.height),
    };
  }

  const widthAttr = Number.parseFloat(String(svgEl?.getAttribute("width") || ""));
  const heightAttr = Number.parseFloat(String(svgEl?.getAttribute("height") || ""));
  if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0 && heightAttr > 0) {
    return {
      x: 0,
      y: 0,
      width: widthAttr,
      height: heightAttr,
    };
  }

  return null;
}

function cleanupPanzoom() {
  clearDraggingState();

  if (panzoomInstance) {
    panzoomInstance.destroy();
    panzoomInstance = null;
  }
}

async function fitViewerContent() {
  if (!panzoomInstance) {
    return null;
  }

  await nextTick();
  const viewportEl = viewerViewportRef.value;
  const svgEl = viewerStageRef.value?.querySelector("svg");
  if (!viewportEl || !svgEl) {
    return null;
  }

  panzoomInstance.resize();
  if (panzoomInstance.updateBBox) {
    panzoomInstance.updateBBox();
  }

  const viewportRect = viewportEl.getBoundingClientRect();
  const viewportWidth = Number(viewportRect.width);
  const viewportHeight = Number(viewportRect.height);
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const bounds = viewerBaseBounds || readSvgBounds(svgEl);
  if (!bounds) {
    panzoomInstance.fit();
    panzoomInstance.center();
    return snapshotViewState();
  }

  const fitInset = 2;
  const usableWidth = Math.max(1, viewportWidth - fitInset * 2);
  const usableHeight = Math.max(1, viewportHeight - fitInset * 2);
  const zoomByWidth = usableWidth / bounds.width;
  const zoomByHeight = usableHeight / bounds.height;
  const rawZoom = Math.min(zoomByWidth, zoomByHeight);
  const targetZoom = Math.max(VIEWER_MIN_ZOOM, Math.min(VIEWER_MAX_ZOOM, rawZoom));
  const panX = (viewportWidth - bounds.width * targetZoom) / 2 - bounds.x * targetZoom;
  const panY = (viewportHeight - bounds.height * targetZoom) / 2 - bounds.y * targetZoom;

  panzoomInstance.zoom(targetZoom);
  panzoomInstance.pan({ x: panX, y: panY });
  return {
    zoom: targetZoom,
    pan: {
      x: panX,
      y: panY,
    },
  };
}

async function mountViewerSvg(stateToRestore = null) {
  if (!viewerOpen.value || !viewerSvgMarkup.value) {
    return null;
  }

  await nextTick();
  cleanupPanzoom();
  const svgEl = viewerStageRef.value?.querySelector("svg");
  if (!svgEl || !viewerViewportRef.value) {
    return null;
  }
  viewerBaseBounds = readSvgBounds(svgEl);

  panzoomInstance = svgPanZoom(svgEl, {
    zoomEnabled: true,
    panEnabled: true,
    controlIconsEnabled: false,
    fit: false,
    center: false,
    mouseWheelZoomEnabled: true,
    dblClickZoomEnabled: false,
    preventMouseEventsDefault: true,
    maxZoom: VIEWER_MAX_ZOOM,
    minZoom: VIEWER_MIN_ZOOM,
    zoomScaleSensitivity: 0.2,
  });

  if (restoreViewState(stateToRestore)) {
    return snapshotViewState();
  }

  const fittedState = await fitViewerContent();
  return fittedState || snapshotViewState();
}

async function openViewer() {
  if (!hasDiagram.value) {
    return;
  }

  globalPanelOpen.value = false;
  initialOpenViewState = null;
  viewerSvgMarkup.value = props.svgMarkup;
  viewerOpen.value = true;
  document.body.style.overflow = "hidden";
  const mountedState = await mountViewerSvg();
  initialOpenViewState = mountedState || snapshotViewState();
}

function closeViewer() {
  cleanupPanzoom();
  globalPanelOpen.value = false;
  initialOpenViewState = null;
  viewerBaseBounds = null;
  viewerOpen.value = false;
  viewerSvgMarkup.value = "";
  document.body.style.overflow = "";
}

function toggleGlobalPanel() {
  globalPanelOpen.value = !globalPanelOpen.value;
}

async function resetViewerZoom() {
  if (!viewerOpen.value || !viewerSvgMarkup.value || resettingView) {
    return;
  }

  resettingView = true;
  try {
    if (initialOpenViewState) {
      await mountViewerSvg(initialOpenViewState);
      return;
    }

    const mountedState = await mountViewerSvg();
    if (mountedState) {
      initialOpenViewState = mountedState;
    }
  } finally {
    resettingView = false;
  }
}

function onGlobalKeydown(event) {
  if (event.key === "Escape") {
    closeViewer();
  }
}

function onGlobalResize() {
  if (viewerOpen.value) {
    if (panzoomInstance) {
      panzoomInstance.resize();
      return;
    }
    fitViewerContent();
  }
}

watch(
  () => props.svgMarkup,
  async (value) => {
    if (!value) {
      if (viewerOpen.value) {
        closeViewer();
      }
      return;
    }

    if (viewerOpen.value) {
      const viewState = snapshotViewState();
      viewerSvgMarkup.value = value;
      await mountViewerSvg(viewState);
    }
    return;
  }
);

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("resize", onGlobalResize);
});

onUnmounted(() => {
  cleanupPanzoom();
  viewerBaseBounds = null;
  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("resize", onGlobalResize);
  document.body.style.overflow = "";
});
</script>

<template>
  <section class="panel output-panel">
    <div class="output-header">
      <div class="output-title-group">
        <h2>ER 图输出</h2>
      </div>
      <p class="output-tip">点击缩略图进入大图编辑模式</p>
    </div>

    <div :class="['diagram-container', { empty: !hasDiagram, 'has-diagram': hasDiagram }]" @click="hasDiagram && openViewer()">
      <p v-if="!hasDiagram" class="empty-state">
        <strong>等待生成结果</strong>
        <span>生成后会在这里显示缩略图，点击可放大查看。</span>
      </p>
      <div v-else class="diagram-thumb" v-html="svgMarkup"></div>
    </div>
  </section>

  <div :class="['viewer-modal', { open: viewerOpen }]" :aria-hidden="!viewerOpen" @click.self="closeViewer">
    <div class="viewer-dialog" role="dialog" aria-modal="true" aria-label="ER 图放大查看">
      <div class="viewer-toolbar">
        <div class="viewer-toolbar-title">
          <strong>ER 图工作台</strong>
          <p>滚轮缩放，拖拽平移，选中节点后可做局部样式调整。</p>
        </div>
        <div class="viewer-actions">
          <button type="button" @click="resetViewerZoom">重置视图</button>
          <button type="button" class="ghost" @click="closeViewer">关闭</button>
        </div>
      </div>

      <div class="viewer-body">
        <button
          type="button"
          :class="['global-panel-toggle', { open: globalPanelOpen }]"
          :aria-expanded="globalPanelOpen"
          :aria-label="globalPanelOpen ? '收起全局调节' : '打开全局调节'"
          @click="toggleGlobalPanel"
        >
          {{ globalPanelOpen ? "收起全局调节" : "展开全局调节" }}
        </button>

        <div :class="['global-panel-shell', { open: globalPanelOpen }]">
          <StylePanel
            side="left"
            :show-global="true"
            :show-node="false"
            :model-value="chenStyle"
            :editable="styleEditable"
            :hint="styleHint"
            @update:model-value="emit('update:chenStyle', $event)"
            @reset="emit('resetStyle')"
          />
        </div>

        <div ref="viewerViewportRef" class="viewer-viewport">
          <div
            ref="viewerStageRef"
            class="viewer-stage"
            v-html="viewerSvgMarkup"
            @pointerdown.capture="onViewerPointerDown"
            @click="onViewerClick"
          />
        </div>

        <div :class="['node-panel-shell', { open: nodePanelVisible }]">
          <StylePanel
            side="right"
            :show-global="false"
            :show-node="true"
            :model-value="chenStyle"
            :editable="styleEditable"
            :hint="styleHint"
            :selected-node="selectedNode"
            :selected-node-style="selectedNodeStyle"
            :node-editable="styleEditable"
            @update:model-value="emit('update:chenStyle', $event)"
            @reset="emit('resetStyle')"
            @update:node-style="emit('update:nodeStyle', $event)"
            @reset-node-style="emit('resetNodeStyle')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
