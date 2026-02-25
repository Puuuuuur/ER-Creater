# Vue Frontend

本目录是 ER 可视化前端（Vue 3 + Vite）。

## 本地开发

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5900`

> `vite.config.js` 已配置 `/api` 代理到 `http://127.0.0.1:5000`。

## 构建

```bash
npm run build
```

构建产物在 `frontend/dist`，由根目录 `app.py` 提供静态托管。
