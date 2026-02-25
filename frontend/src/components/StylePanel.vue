<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  editable: {
    type: Boolean,
    default: false,
  },
  hint: {
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
  nodeEditable: {
    type: Boolean,
    default: false,
  },
  showGlobal: {
    type: Boolean,
    default: true,
  },
  showNode: {
    type: Boolean,
    default: true,
  },
  side: {
    type: String,
    default: "left",
  },
});

const emit = defineEmits(["update:modelValue", "reset", "update:nodeStyle", "resetNodeStyle"]);

const controls = [
  { key: "entityScale", label: "矩形大小", min: 0.7, max: 2.1, step: 0.05, id: "entityScaleInput" },
  { key: "relationScale", label: "菱形大小", min: 0.7, max: 2.1, step: 0.05, id: "relationScaleInput" },
  { key: "ellipseScale", label: "椭圆大小", min: 0.7, max: 2.3, step: 0.05, id: "ellipseScaleInput" },
  { key: "hGap", label: "横向间距", min: 120, max: 520, step: 10, id: "hGapInput" },
  { key: "vGap", label: "纵向间距", min: 80, max: 360, step: 10, id: "vGapInput" },
  { key: "lineWidth", label: "线条粗细", min: 1.2, max: 8, step: 0.2, id: "lineWidthInput" },
  { key: "fontScale", label: "字体大小", min: 0.7, max: 1.8, step: 0.05, id: "fontScaleInput" },
];

const nodeControls = [
  { key: "scale", label: "该节点大小", min: 0.6, max: 2.8, step: 0.05, id: "nodeScaleInput" },
  { key: "strokeWidth", label: "该节点线宽", min: 0, max: 10, step: 0.2, id: "nodeStrokeWidthInput" },
  { key: "offsetX", label: "节点横向偏移", min: -1000, max: 1000, step: 5, id: "nodeOffsetXInput" },
  { key: "offsetY", label: "节点纵向偏移", min: -1000, max: 1000, step: 5, id: "nodeOffsetYInput" },
];

const defaultNodeStyle = {
  scale: 1,
  strokeWidth: 0,
  offsetX: 0,
  offsetY: 0,
  fill: "#ffffff",
  textColor: "#111111",
};

const activeNodeStyle = computed(() => ({
  ...defaultNodeStyle,
  ...(props.selectedNodeStyle || {}),
}));

const activeNodeLabel = computed(() => {
  if (!props.selectedNode) {
    return "";
  }
  const typeName = props.selectedNode.type === "relationship" ? "菱形" : "矩形";
  return `${typeName}：${props.selectedNode.name || props.selectedNode.id}`;
});

function formatValue(key, value) {
  if (key === "hGap" || key === "vGap") {
    return `${Math.round(Number(value))}`;
  }
  if (key === "lineWidth") {
    return Number(value).toFixed(1);
  }
  return `${Number(value).toFixed(2)}x`;
}

function formatNodeValue(key, value) {
  if (key === "offsetX" || key === "offsetY") {
    return `${Math.round(Number(value))}`;
  }
  if (key === "strokeWidth") {
    return Number(value).toFixed(1);
  }
  return `${Number(value).toFixed(2)}x`;
}

function updateField(key, rawValue) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: Number(rawValue),
  });
}

function updateNodeField(key, rawValue) {
  emit("update:nodeStyle", {
    [key]: Number(rawValue),
  });
}

function updateNodeColor(key, rawValue) {
  emit("update:nodeStyle", {
    [key]: String(rawValue || "").trim(),
  });
}
</script>

<template>
  <aside :class="['viewer-settings', `viewer-settings-${side}`]">
    <template v-if="showGlobal">
      <h3 class="settings-title">全局调节</h3>
      <p class="viewer-hint">{{ hint }}</p>

      <div class="settings-grid">
        <div v-for="control in controls" :key="control.key" class="setting-item">
          <div class="setting-head">
            <label :for="control.id">{{ control.label }}</label>
            <span>{{ formatValue(control.key, modelValue[control.key]) }}</span>
          </div>
          <input
            :id="control.id"
            :value="modelValue[control.key]"
            :disabled="!editable"
            type="range"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="updateField(control.key, $event.target.value)"
          />
        </div>
      </div>

      <button id="resetStyleBtn" class="panel-action" type="button" :disabled="!editable" @click="$emit('reset')">
        恢复默认样式
      </button>
    </template>

    <template v-if="showNode">
      <hr v-if="showGlobal" class="settings-split" />

      <h3 class="settings-title">节点单独调节</h3>
      <p class="viewer-hint" v-if="!selectedNode">请点击大图中的矩形或菱形后再单独调节，支持拖拽改位置。</p>
      <p class="node-target" v-else>{{ activeNodeLabel }}</p>

      <div class="settings-grid">
        <div v-for="control in nodeControls" :key="control.key" class="setting-item">
          <div class="setting-head">
            <label :for="control.id">{{ control.label }}</label>
            <span>{{ formatNodeValue(control.key, activeNodeStyle[control.key]) }}</span>
          </div>
          <input
            :id="control.id"
            :value="activeNodeStyle[control.key]"
            :disabled="!nodeEditable || !selectedNode"
            type="range"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            @input="updateNodeField(control.key, $event.target.value)"
          />
        </div>

        <div class="setting-item color-setting">
          <div class="setting-head">
            <label for="nodeFillColorInput">该节点填充色</label>
            <span>{{ activeNodeStyle.fill }}</span>
          </div>
          <div class="color-row">
            <input
              id="nodeFillColorInput"
              :value="activeNodeStyle.fill"
              :disabled="!nodeEditable || !selectedNode"
              type="color"
              @input="updateNodeColor('fill', $event.target.value)"
            />
          </div>
        </div>

        <div class="setting-item color-setting">
          <div class="setting-head">
            <label for="nodeTextColorInput">该节点文字色</label>
            <span>{{ activeNodeStyle.textColor }}</span>
          </div>
          <div class="color-row">
            <input
              id="nodeTextColorInput"
              :value="activeNodeStyle.textColor"
              :disabled="!nodeEditable || !selectedNode"
              type="color"
              @input="updateNodeColor('textColor', $event.target.value)"
            />
          </div>
        </div>
      </div>

      <button class="panel-action" type="button" :disabled="!nodeEditable || !selectedNode" @click="$emit('resetNodeStyle')">
        恢复该节点默认样式
      </button>
    </template>
  </aside>
</template>
