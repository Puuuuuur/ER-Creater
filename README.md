# 对话客服 + MySQL ER 图工具（Flask + Vue）

一个本地运行的小工具：
- `/`：对话客服页面（DeepSeek via DashScope 兼容接口）
- `/er`：MySQL `CREATE TABLE` 自动生成 ER 图工具

## 架构

- 后端：Flask（`/api/chat` + `/api/generate`）
- 前端：Vue 3 + Vite（客服对话、ER 图交互、弹窗缩放、样式调参）

## 功能

- 对话客服（默认首页）
- 客服页按钮进入 ER 工具页
- 支持粘贴 MySQL 建表 DDL
- 自动识别主键 / 外键关系
- ER 图采用 `Chen 教学 ER`
- Chen 图支持属性环绕分布与防重叠
- 输出区缩略图 + 点击放大查看
- 放大弹窗支持拖拽、滚轮缩放、重置
- 放大弹窗支持实时调参：矩形/菱形/椭圆大小、横纵间距、线宽、字体大小
- 一键复制 Mermaid 文本
- 一键复制 ER 图图片（PNG 到剪贴板）
- 下载 ER 图 PNG

## 开发模式

终端 1（启动 Flask API）：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

在项目根目录 `.env` 配置模型 Key（至少配置一个）：

```bash
DASHSCOPE_API_KEY=sk-xxx
# 或
OPENAI_API_KEY=sk-xxx
```

终端 2（启动 Vue 前端）：

```bash
cd frontend
npm install
npm run dev
```

访问：`http://127.0.0.1:5900`（默认是客服页）

> Vite 已配置代理，前端请求 `/api` 会转发到 `http://127.0.0.1:5000`。

## 生产/本地单服务模式

先构建前端：

```bash
cd frontend
npm install
npm run build
```

再启动 Flask：

```bash
cd ..
source .venv/bin/activate
python app.py
```

访问：
- `http://127.0.0.1:5000/` 客服页
- `http://127.0.0.1:5000/er` ER 图工具页

## ER 输入建议

优先使用标准 MySQL DDL，例如：

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 注意

- 客服接口通过 DashScope OpenAI 兼容模式调用 `deepseek-v3.2`。
- 当前 ER 解析主要面向 MySQL `CREATE TABLE` 语句。
- 页面中的“复制图片”依赖浏览器剪贴板图片能力，若浏览器不支持可使用“下载 PNG”。
