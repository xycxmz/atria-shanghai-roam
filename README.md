# 上海漫游

飞过上海，也读懂上海。

Atria Demo 共建作品 · 作者 **xyc**。主体开发 Qoder/Atria；Codex 独立评审、最终修复与提交整理。

![作品实际画面](docs/preview.png)

## 直接体验

下载或克隆本仓库，进入根目录：

```text
node serve-demo.mjs
```

打开 http://127.0.0.1:8000/ 。仅监听本机；不需要 API Key。需要 Node.js 24.21（实际测试版本）。仓库已含 dist，可不安装依赖直接运行。

## 从源码开发

```text
npm ci
node --experimental-strip-types test-flight-model.ts
node --experimental-strip-types probe-loader.mjs
npm run build
node serve-demo.mjs
```



## 功能与使用说明

见 [Demo说明.md](Demo说明.md)。飞行模型 28 项与导航 18 项断言通过；类型检查和生产构建通过。

当前优先桌面键盘体验；不承诺手机驾驶体验。运行在域名根路径，不支持直接部署到 GitHub Pages 项目子路径。地图字体、在线搜索或备用瓦片可能访问外部服务，未宣称完全离线。

公开的是本次提交快照，不包含私人开发仓库历史、凭据、node_modules 或无关项目。第三方库及数据遵循各自声明；本仓库公开不代表作者有权替第三方重新授权。

