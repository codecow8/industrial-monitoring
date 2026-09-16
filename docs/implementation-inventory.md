# Task 1 implementation inventory

## Accepted design source

- `/Users/mymac/Documents/找工作/industrial-monitoring/designs/industrial-monitoring-v1/industrial-editor.html`
- `/Users/mymac/Documents/找工作/industrial-monitoring/designs/industrial-monitoring-v1/reference/editor-concept.png`

## Visible copy contract

- 工业智控平台
- 监控画面编辑器
- 已自动保存 / 有未保存修改
- 预览运行态
- 保存草稿
- 组件 / 指标卡 / 文本 / 折线图 / 设备状态 / 告警列表
- 属性配置 / 基础属性 / Schema 预览
- 设备名称 / 指标标题 / 数据键 / 单位 / 小数位 / 告警阈值
- 冷却系统监控 / 发布预览 / 模拟数据已连接 / 返回编辑器

## Visual system

- App chrome: deep graphite navy `#0e1d2b` and `#142739`.
- Canvas: `#0e1d2b` with 12px minor and 48px major engineering grids.
- Panels: neutral white/gray surfaces with precise 1px dividers.
- Interactive accent: blue `#1684e8`; data accent: cyan `#36d9dc`.
- Semantic colors: green `#19c993`, amber `#eaa73c`.
- Geometry: 2-4px radii, minimal shadows, no glass effects.
- Typography: system CJK stack; numeric values use condensed system fallbacks.

## Component ownership

- `@industrial/schema`: publishable PageSchema, validation, seed fixture.
- `@industrial/renderer-core`: Pinia-free DOM renderer and component registry contract.
- `@industrial/components-web`: MetricCard and the web component registry.
- `@industrial/web`: editor/runtime routes, UI chrome, local persistence and editor-only state.

## Core workflow

1. Edit metric-card props in the inspector.
2. Drag/resize the selected component through Moveable.
3. Validate and persist the PageSchema to localStorage.
4. Export/import Schema JSON.
5. Navigate to the runtime route and render through the same renderer and registry.

## Deliberate exclusions

- Backend, WebSocket, ECharts, Electron, mini-program and Agent code.
- Additional working component types.
- Rotation, multi-selection, grouping, alignment guides and collaboration.
