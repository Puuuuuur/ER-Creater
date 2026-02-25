<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import mermaid from "mermaid";

import DiagramViewer from "./DiagramViewer.vue";
import { DEFAULT_CHEN_NODE_STYLE, DEFAULT_CHEN_STYLE, renderChenSvg } from "../composables/useChenLayout";

const examples = [
  {
    name: "电商系统（用户-订单-商品）",
    description: "基础一对多 + 多对多关系",
    sql: `CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE products (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_item_product FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO users (id, username, email, created_at) VALUES
(1, 'alice', 'alice@example.com', NOW()),
(2, 'bob', 'bob@example.com', NOW());

INSERT INTO products (id, name, price, stock) VALUES
(1, 'Keyboard', 299.00, 50),
(2, 'Mouse', 99.00, 120);`
  },
  {
    name: "公司组织（自引用）",
    description: "员工 manager_id 引用员工自身",
    sql: `CREATE TABLE departments (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE employees (
  id INT NOT NULL AUTO_INCREMENT,
  department_id INT NOT NULL,
  manager_id INT NULL,
  full_name VARCHAR(100) NOT NULL,
  hired_at DATE NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_emp_dept FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_emp_manager FOREIGN KEY (manager_id) REFERENCES employees(id)
);

INSERT INTO departments (id, name) VALUES (1, 'Engineering'), (2, 'Sales');
INSERT INTO employees (id, department_id, manager_id, full_name, hired_at) VALUES
(1, 1, NULL, 'CTO', '2022-01-01'),
(2, 1, 1, 'Backend Dev', '2023-04-01');`
  },
  {
    name: "教务系统（联合主键）",
    description: "学生选课中间表使用复合主键",
    sql: `CREATE TABLE students (
  id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  grade SMALLINT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE courses (
  id BIGINT NOT NULL,
  course_name VARCHAR(100) NOT NULL,
  credit TINYINT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE enrollments (
  student_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  enrolled_at DATETIME NOT NULL,
  PRIMARY KEY (student_id, course_id),
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_enroll_course FOREIGN KEY (course_id) REFERENCES courses(id)
);

INSERT INTO students (id, name, grade) VALUES
(1001, 'Tom', 2),
(1002, 'Jerry', 1);

INSERT INTO courses (id, course_name, credit) VALUES
(2001, 'Database', 3),
(2002, 'Networks', 2);`
  },
  {
    name: "博客系统（内联外键）",
    description: "列定义中直接 REFERENCES",
    sql: `CREATE TABLE authors (
  id BIGINT PRIMARY KEY,
  nickname VARCHAR(80) NOT NULL
);

CREATE TABLE posts (
  id BIGINT PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES authors(id),
  title VARCHAR(200) NOT NULL,
  published_at DATETIME NULL
);

CREATE TABLE comments (
  id BIGINT PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id),
  parent_comment_id BIGINT NULL REFERENCES comments(id),
  content TEXT NOT NULL
);

INSERT INTO authors (id, nickname) VALUES (1, 'writer_a');
INSERT INTO posts (id, author_id, title, published_at) VALUES
(10, 1, 'Hello SQL', NOW());`
  }
];

const sqlInput = ref("");
const selectedExample = ref(null);
const statusMessage = ref("");
const statusError = ref(false);
const generating = ref(false);

const diagrams = reactive({ chen: "" });
const chenModel = ref(null);
const currentSvgMarkup = ref("");
const chenStyle = ref({ ...DEFAULT_CHEN_STYLE });
const nodeOverrides = ref({});
const selectedNode = ref(null);

const hasDiagram = computed(() => Boolean(currentSvgMarkup.value));
const chenStyleEditable = computed(() => Boolean(chenModel.value));
const canGenerate = computed(() => Boolean(sqlInput.value.trim()) && !generating.value);
const canLoadExample = computed(
  () => Number.isInteger(Number(selectedExample.value)) && Number(selectedExample.value) >= 0,
);
const statusText = computed(() => statusMessage.value || "等待 SQL 输入并生成 ER 图。");
const selectedNodeStyle = computed(() => {
  if (!selectedNode.value) {
    return { ...DEFAULT_CHEN_NODE_STYLE };
  }
  const current = nodeOverrides.value[selectedNode.value.id] || {};
  return {
    ...DEFAULT_CHEN_NODE_STYLE,
    ...current,
  };
});
const viewerStyleHint = computed(() => {
  if (chenStyleEditable.value) {
    return "支持全局样式调节；点击矩形/菱形可单独调样式，拖拽可改位置。";
  }
  return "请先生成 ER 图，再调整样式。";
});

function setStatus(message, isError = false) {
  statusMessage.value = message;
  statusError.value = isError;
}

function activeMermaidText() {
  return diagrams.chen;
}

function resetDiagramState() {
  diagrams.chen = "";
  chenModel.value = null;
  currentSvgMarkup.value = "";
  nodeOverrides.value = {};
  selectedNode.value = null;
}

function renderChenDiagram() {
  if (!chenModel.value) {
    currentSvgMarkup.value = "";
    return;
  }
  currentSvgMarkup.value = renderChenSvg(chenModel.value, chenStyle.value, {
    nodeOverrides: nodeOverrides.value,
    selectedNodeId: selectedNode.value?.id || null,
  });
}

function loadExample(index) {
  if (index === null || index === undefined || index === "") {
    return;
  }

  const normalizedIndex = Number(index);
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
    return;
  }

  const selected = examples[normalizedIndex];
  if (!selected) {
    return;
  }

  selectedExample.value = normalizedIndex;
  sqlInput.value = selected.sql.trim();
  resetDiagramState();
}

async function renderMermaidSvg(mermaidText) {
  const renderId = `er-${Date.now()}`;
  const { svg } = await mermaid.render(renderId, mermaidText);
  return svg;
}

async function renderCurrentNotation() {
  if (!chenModel.value) {
    const fallback = diagrams.chen;
    if (!fallback) {
      currentSvgMarkup.value = "";
      return;
    }
    currentSvgMarkup.value = await renderMermaidSvg(fallback);
    return;
  }
  renderChenDiagram();
}

async function generateER() {
  const sql = sqlInput.value.trim();
  if (!sql) {
    setStatus("请先输入 SQL。", true);
    return;
  }

  setStatus("正在生成 ER 图...");
  generating.value = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "生成失败");
    }

    diagrams.chen = result.mermaidChen || result.mermaid || "";
    chenModel.value = result.chenModel || null;
    nodeOverrides.value = {};
    selectedNode.value = null;

    await renderCurrentNotation();

    let message = `已生成 ${result.tableCount} 张表的 ER 图`;
    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      message += `（有 ${result.warnings.length} 条解析提示）`;
    }
    setStatus(message);
  } catch (error) {
    setStatus(error.message || "生成失败，请检查 SQL", true);
  } finally {
    generating.value = false;
  }
}

function onChenStyleChange(nextStyle) {
  chenStyle.value = { ...nextStyle };
  if (chenModel.value) {
    renderChenDiagram();
  }
}

function onResetChenStyle() {
  chenStyle.value = { ...DEFAULT_CHEN_STYLE };
  if (chenModel.value) {
    renderChenDiagram();
  }
}

function onSelectNode(nodeMeta) {
  if (!chenStyleEditable.value || !nodeMeta?.id) {
    return;
  }

  selectedNode.value = {
    id: String(nodeMeta.id),
    type: String(nodeMeta.type || ""),
    name: String(nodeMeta.name || nodeMeta.id),
  };
  renderChenDiagram();
}

function onClearSelectedNode() {
  if (!selectedNode.value) {
    return;
  }
  selectedNode.value = null;
  if (chenModel.value) {
    renderChenDiagram();
  }
}

function onNodeStyleChange(nextNodeStyle) {
  if (!selectedNode.value?.id) {
    return;
  }
  const targetId = selectedNode.value.id;
  const existing = nodeOverrides.value[targetId] || {};
  nodeOverrides.value = {
    ...nodeOverrides.value,
    [targetId]: {
      ...existing,
      ...nextNodeStyle,
    },
  };
  if (chenModel.value) {
    renderChenDiagram();
  }
}

function onResetNodeStyle() {
  if (!selectedNode.value?.id) {
    return;
  }

  const targetId = selectedNode.value.id;
  const next = { ...nodeOverrides.value };
  delete next[targetId];
  nodeOverrides.value = next;

  if (chenModel.value) {
    renderChenDiagram();
  }
}

function onDragNode(payload) {
  if (!payload?.id) {
    return;
  }

  const targetId = String(payload.id);
  const offsetX = Number(payload.offsetX || 0);
  const offsetY = Number(payload.offsetY || 0);
  const existing = nodeOverrides.value[targetId] || {};
  nodeOverrides.value = {
    ...nodeOverrides.value,
    [targetId]: {
      ...existing,
      offsetX,
      offsetY,
    },
  };

  selectedNode.value = {
    id: targetId,
    type: String(payload.type || selectedNode.value?.type || ""),
    name: String(payload.name || selectedNode.value?.name || targetId),
  };

  if (chenModel.value) {
    renderChenDiagram();
  }
}

async function copyMermaidCode() {
  const mermaidText = activeMermaidText();
  if (!mermaidText) {
    setStatus("当前没有可复制的 Mermaid 文本。", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(mermaidText);
    setStatus("已复制 Mermaid 文本。");
  } catch {
    setStatus("复制失败，请检查浏览器剪贴板权限。", true);
  }
}

async function getDiagramPngBlob() {
  if (!currentSvgMarkup.value) {
    throw new Error("未找到 ER 图。");
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(currentSvgMarkup.value, "image/svg+xml");
  const svgEl = xml.documentElement;

  if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") {
    throw new Error("未找到 ER 图。");
  }

  let svgMarkup = new XMLSerializer().serializeToString(svgEl);
  if (!svgMarkup.includes("xmlns=")) {
    svgMarkup = svgMarkup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });

  const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
  const width = Math.max(1, Math.ceil((viewBox && viewBox.width) || Number(svgEl.getAttribute("width")) || 1200));
  const height = Math.max(1, Math.ceil((viewBox && viewBox.height) || Number(svgEl.getAttribute("height")) || 800));
  const basePixels = width * height;
  const preferredScale = Math.max(2, Number(window.devicePixelRatio) || 1);
  const maxPixels = 36_000_000;
  let exportScale = preferredScale;
  if (basePixels * exportScale * exportScale > maxPixels) {
    exportScale = Math.max(1, Math.sqrt(maxPixels / Math.max(1, basePixels)));
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * exportScale));
  canvas.height = Math.max(1, Math.round(height * exportScale));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("图片转换失败。");
  }

  ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  URL.revokeObjectURL(url);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function copyDiagramImage() {
  try {
    const blob = await getDiagramPngBlob();
    if (!blob) {
      throw new Error("图片转换失败。");
    }

    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("当前浏览器不支持图片剪贴板。请使用“下载 PNG”。");
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob
      })
    ]);

    setStatus("ER 图图片已复制到剪贴板。可直接粘贴到文档或 IM。", false);
  } catch (error) {
    setStatus(error.message || "复制图片失败", true);
  }
}

async function downloadDiagramImage() {
  try {
    const blob = await getDiagramPngBlob();
    if (!blob) {
      throw new Error("图片转换失败。");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `er-diagram-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(link.href);

    setStatus("PNG 已下载。", false);
  } catch (error) {
    setStatus(error.message || "下载失败", true);
  }
}

onMounted(() => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default",
    flowchart: { htmlLabels: true }
  });
});
</script>

<template>
  <main class="layout">
    <section class="panel input-panel">
      <header class="panel-header">
        <h1>MySQL 自动 ER 图</h1>
      </header>

      <div class="toolbar-grid">
        <div class="field-group example-tools">
          <label for="exampleSelect">测试示例</label>
          <div class="example-row">
            <select id="exampleSelect" v-model="selectedExample" aria-label="选择测试示例" @change="loadExample(selectedExample)">
              <option :value="null">请选择测试示例</option>
              <option v-for="(example, idx) in examples" :key="example.name" :value="idx">
                {{ idx + 1 }}. {{ example.name }}
              </option>
            </select>
            <button type="button" :disabled="!canLoadExample" @click="loadExample(selectedExample)">加载示例</button>
          </div>
        </div>
      </div>
      <div class="editor-wrap">
        <div class="editor-head">
          <label for="sqlInput">SQL 输入</label>
        </div>
        <textarea
          id="sqlInput"
          v-model="sqlInput"
          spellcheck="false"
          placeholder="CREATE TABLE users (&#10;  id BIGINT PRIMARY KEY,&#10;  name VARCHAR(100) NOT NULL&#10;);&#10;&#10;CREATE TABLE orders (&#10;  id BIGINT PRIMARY KEY,&#10;  user_id BIGINT NOT NULL,&#10;  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)&#10;);"
        />
      </div>

      <div class="actions">
        <button class="primary" :disabled="!canGenerate" :aria-busy="generating" @click="generateER">
          {{ generating ? "生成中..." : "生成 ER 图" }}
        </button>
        <button class="secondary" :disabled="!hasDiagram" @click="copyMermaidCode">复制 Mermaid 文本</button>
        <button class="secondary" :disabled="!hasDiagram" @click="copyDiagramImage">复制 ER 图图片</button>
        <button class="secondary" :disabled="!hasDiagram" @click="downloadDiagramImage">下载 PNG</button>
      </div>

      <div :class="['status', { error: statusError, success: !statusError && statusMessage }]" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ statusText }}</span>
      </div>
    </section>

    <DiagramViewer
      :svg-markup="currentSvgMarkup"
      :chen-style="chenStyle"
      :style-editable="chenStyleEditable"
      :style-hint="viewerStyleHint"
      :selected-node="selectedNode"
      :selected-node-style="selectedNodeStyle"
      :node-overrides="nodeOverrides"
      @update:chen-style="onChenStyleChange"
      @reset-style="onResetChenStyle"
      @select-node="onSelectNode"
      @clear-selection="onClearSelectedNode"
      @update:node-style="onNodeStyleChange"
      @reset-node-style="onResetNodeStyle"
      @drag-node="onDragNode"
    />
  </main>
</template>
