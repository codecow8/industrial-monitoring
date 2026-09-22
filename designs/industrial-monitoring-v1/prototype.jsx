const { useEffect, useMemo, useRef, useState } = React;

function Icon({ name, size = 16 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const paths = {
    play: <><rect x="3" y="4" width="18" height="13" rx="1"></rect><path d="m10 8 5 2.5-5 2.5Z"></path><path d="M8 21h8"></path></>,
    save: <><path d="M5 3h12l2 2v16H5Z"></path><path d="M8 3v6h8V3"></path><path d="M8 15h8v6H8Z"></path></>,
    info: <><circle cx="12" cy="12" r="9"></circle><path d="M12 11v6"></path><path d="M12 7h.01"></path></>,
    chart: <><path d="M4 20V10"></path><path d="M10 20V5"></path><path d="M16 20V2"></path><path d="M22 20H2"></path></>,
    text: <><path d="M5 5h14"></path><path d="M12 5v14"></path><path d="M8 19h8"></path></>,
    line: <><path d="M3 18 9 11l4 3 8-9"></path><path d="M3 4v16h18"></path></>,
    device: <><rect x="3" y="4" width="18" height="7" rx="1"></rect><rect x="3" y="14" width="18" height="7" rx="1"></rect><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"></path></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="1"></rect><path d="M16 8V4H5v12h3"></path></>,
    cursor: <path d="m5 3 14 8-6 2-2 6Z"></path>,
    undo: <><path d="m9 7-4 4 4 4"></path><path d="M5 11h8a6 6 0 0 1 6 6"></path></>,
    redo: <><path d="m15 7 4 4-4 4"></path><path d="M19 11h-8a6 6 0 0 0-6 6"></path></>,
    trash: <><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 14h8l1-14"></path><path d="M10 11v6M14 11v6"></path></>,
    close: <><path d="m6 6 12 12"></path><path d="m18 6-12 12"></path></>,
    arrowLeft: <><path d="m15 18-6-6 6-6"></path><path d="M9 12h11"></path></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function MetricCard({ schema, value = 68.4, freshness = "fresh", ageSeconds = 0, draggable = false, onPointerDown }) {
  const waiting = freshness === "waiting" || value === null;
  const stale = freshness === "stale";
  const warning = !waiting && !stale && value >= schema.props.alarmThreshold;
  const stateText = waiting
    ? "等待设备数据"
    : stale
      ? `数据已过期 · ${ageSeconds}秒前`
      : warning
        ? "温度告警"
        : "运行正常";
  return (
    <div className="metric-card">
      <div className="metric-card-header" onPointerDown={draggable ? onPointerDown : undefined}>
        <span className="metric-device">{schema.props.deviceName}</span>
        <span className="metric-menu" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
      <div className="metric-body">
        <div className="metric-label">{schema.props.title}</div>
        <div className="metric-value-row">
          <span className={`metric-value ${stale ? "stale" : ""}`}>{waiting ? "--" : Number(value).toFixed(schema.props.precision)}</span>
          <span className="metric-unit">{schema.props.unit}</span>
        </div>
        <div className={`metric-state ${waiting ? "waiting" : stale ? "stale" : warning ? "warning" : ""}`}>
          {stateText}
        </div>
      </div>
    </div>
  );
}

const DEVICE_STATES = {
  0: { key: "stopped", name: "停止", description: "设备已停止运行" },
  1: { key: "running", name: "运行", description: "设备运行正常" },
  2: { key: "fault", name: "故障", description: "检测到设备故障" },
  3: { key: "maintenance", name: "维护", description: "设备处于维护模式" },
};

function DeviceStateCard({ node, stateCode = 1, freshness = "fresh", ageSeconds = 0, onPointerDown }) {
  const waiting = freshness === "waiting" || stateCode === null;
  const stale = freshness === "stale";
  const state = waiting
    ? { key: "waiting", name: "--", description: "等待设备状态" }
    : DEVICE_STATES[stateCode] ?? { key: "unknown", name: `未知状态 · ${stateCode}`, description: "未识别的状态码" };
  const updatedText = waiting ? "尚未收到状态数据" : stale ? `状态数据已过期 · ${ageSeconds}秒前` : "刚刚更新";
  return (
    <div className={`device-state-card ${state.key} ${stale ? "stale" : ""}`}>
      <header className="device-state-header" onPointerDown={onPointerDown}>
        <strong>{node.props.deviceName}</strong>
        <span className="metric-menu" aria-hidden="true"><span></span><span></span><span></span></span>
      </header>
      <div className="device-state-body">
        <div className="device-state-icon"><Icon name="device" size={26} /></div>
        <div className="device-state-copy">
          <span className="device-state-label">{node.props.title}</span>
          <strong className="device-state-name">{state.name}</strong>
          <span className="device-state-description">{state.description}</span>
          <span className="device-state-updated">{updatedText}</span>
        </div>
      </div>
    </div>
  );
}

function ComponentPalette({ showToast }) {
  const items = [
    { name: "指标卡", icon: "chart", active: true },
    { name: "文本", icon: "text" },
    { name: "折线图", icon: "line" },
    { name: "设备状态", icon: "device" },
    { name: "告警列表", icon: "bell" },
  ];

  return (
    <aside className="left-panel" aria-label="组件面板">
      <div className="panel-title">组件</div>
      <div className="component-list">
        {items.map((item) => (
          <button
            className={`component-row ${item.active ? "active" : "disabled"}`}
            key={item.name}
            onClick={() => !item.active && showToast(`${item.name}将在后续版本开放`)}
            type="button"
          >
            <span className="component-icon"><Icon name={item.icon} size={24} /></span>
            <span>{item.name}</span>
            {!item.active && <span className="lock"><Icon name="lock" size={14} /></span>}
          </button>
        ))}
      </div>
      <div className="component-footer">更多组件开发中</div>
    </aside>
  );
}

function Inspector({ schema, updateProp, copySchema, schemaText }) {
  const numberValue = (key, value) => updateProp(key, Number(value));
  return (
    <aside className="right-panel" aria-label="属性配置">
      <div className="panel-title">属性配置</div>
      <section className="inspector-section">
        <div className="panel-heading">
          <span className="section-title">基础属性</span>
          <span className="type-code">metric-card</span>
        </div>
        <div className="field-list">
          <div className="field">
            <label htmlFor="deviceName">设备名称</label>
            <input id="deviceName" value={schema.props.deviceName} onChange={(e) => updateProp("deviceName", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="title">指标标题</label>
            <input id="title" value={schema.props.title} onChange={(e) => updateProp("title", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dataKey">数据键</label>
            <input id="dataKey" value={schema.props.dataKey} onChange={(e) => updateProp("dataKey", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="unit">单位</label>
            <input id="unit" value={schema.props.unit} onChange={(e) => updateProp("unit", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="precision">小数位</label>
            <input id="precision" type="number" min="0" max="3" value={schema.props.precision} onChange={(e) => numberValue("precision", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="threshold">告警阈值</label>
            <input id="threshold" type="number" value={schema.props.alarmThreshold} onChange={(e) => numberValue("alarmThreshold", e.target.value)} />
          </div>
        </div>
      </section>
      <section className="inspector-section">
        <div className="schema-heading">
          <span className="section-title">Schema 预览</span>
          <button className="link-button" type="button" onClick={copySchema}><Icon name="copy" size={13} />复制</button>
        </div>
        <pre className="schema-code">{schemaText}</pre>
      </section>
    </aside>
  );
}

function DesignDrawer({ onClose }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="design-drawer" role="dialog" aria-modal="true" aria-labelledby="design-title">
        <header className="drawer-header">
          <div>
            <h2 id="design-title">实时遥测原型 v3</h2>
            <p>这份原型补充 Telemetry Snapshot、增量更新、Data Freshness、断线和自动重连状态。</p>
          </div>
          <button className="close-button" type="button" aria-label="关闭" onClick={onClose}><Icon name="close" /></button>
        </header>
        <section className="decision-block">
          <h3>本版验证什么</h3>
          <p>运行态首次连接先等待 Telemetry Snapshot，随后每秒合并 Telemetry Update，并独立判断连接和数据新鲜度。</p>
        </section>
        <section className="decision-block">
          <h3>核心操作</h3>
          <ul>
            <li>拖动指标卡调整画布位置。</li>
            <li>在属性栏修改设备、指标和阈值。</li>
            <li>固定温度序列稳定演示正常、告警和恢复。</li>
            <li>暂停上报 5 秒后展示数据过期。</li>
            <li>模拟断线后按退避节奏自动重连。</li>
          </ul>
        </section>
        <section className="decision-block">
          <h3>连接与数据状态</h3>
          <p>WebSocket 已连接不代表数据新鲜；卡片根据 Data Freshness 决定是否还能显示正常或告警。</p>
        </section>
        <section className="decision-block">
          <h3>下一阶段</h3>
          <p>本轮通过后，按相同状态模型确认测试 seam，再进入 WebSocket TDD。</p>
        </section>
      </aside>
    </div>
  );
}

function RuntimeView({ published, onBack }) {
  const schema = published?.schema;
  const values = [68.4, 72.0, 78.5, 81.2, 83.0, 79.0, 74.0];
  const valueIndex = useRef(0);
  const reconnectTimers = useRef([]);
  const [value, setValue] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [freshness, setFreshness] = useState("waiting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [paused, setPaused] = useState(false);
  const [reconnectStep, setReconnectStep] = useState(0);
  const [now, setNow] = useState(Date.now());

  const emitNext = () => {
    const nextValue = values[valueIndex.current % values.length];
    valueIndex.current += 1;
    setValue(nextValue);
    setLastUpdated(Date.now());
    setFreshness("fresh");
  };

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    if (schema) {
      const connectTimer = window.setTimeout(() => {
        setConnection("connected");
        emitNext();
      }, 700);
      reconnectTimers.current.push(connectTimer);
    }
    return () => {
      window.clearInterval(clock);
      reconnectTimers.current.forEach(window.clearTimeout);
    };
  }, [Boolean(schema)]);

  useEffect(() => {
    if (!schema || connection !== "connected" || paused) return undefined;
    const telemetryTimer = window.setInterval(emitNext, 1000);
    return () => window.clearInterval(telemetryTimer);
  }, [Boolean(schema), connection, paused]);

  useEffect(() => {
    if (value === null) {
      setFreshness("waiting");
    } else if (lastUpdated && now - lastUpdated >= 5000) {
      setFreshness("stale");
    }
  }, [now, lastUpdated, value]);

  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((now - lastUpdated) / 1000)) : 0;
  const connectionText = connection === "connecting"
    ? "连接中"
    : connection === "disconnected"
      ? "连接已断开"
      : connection === "reconnecting"
        ? `正在重连 · 第${reconnectStep}次`
        : freshness === "stale"
          ? "连接正常 · 数据已过期"
          : freshness === "waiting"
            ? "已连接 · 等待数据"
            : "实时数据已连接";

  const pauseTelemetry = () => setPaused((current) => !current);

  const recover = () => {
    reconnectTimers.current.forEach(window.clearTimeout);
    reconnectTimers.current = [];
    setReconnectStep(0);
    setPaused(false);
    setConnection("connected");
    valueIndex.current = 1;
    setValue(values[0]);
    setLastUpdated(Date.now());
    setFreshness("fresh");
  };

  const triggerAlarm = () => {
    setPaused(true);
    setConnection("connected");
    setValue(83.0);
    setLastUpdated(Date.now());
    setFreshness("fresh");
  };

  const disconnect = () => {
    reconnectTimers.current.forEach(window.clearTimeout);
    reconnectTimers.current = [];
    setConnection("disconnected");
    setReconnectStep(0);
    const stepOne = window.setTimeout(() => { setConnection("reconnecting"); setReconnectStep(1); }, 500);
    const stepTwo = window.setTimeout(() => setReconnectStep(2), 1500);
    const stepThree = window.setTimeout(() => setReconnectStep(3), 3500);
    const reconnected = window.setTimeout(recover, 7500);
    reconnectTimers.current.push(stepOne, stepTwo, stepThree, reconnected);
  };
  return (
    <main className="runtime" data-screen-label="运行态预览">
      <header className="runtime-topbar">
        <div className="runtime-title">
          <strong>{schema ? "冷却系统监控" : "运行态"}</strong>
          <span>{published ? `发布版本 · v${published.version}` : "尚未发布"}</span>
        </div>
        <div className="runtime-actions">
          <span className={`runtime-status ${connection} ${freshness}`}>{connectionText}</span>
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            <span className="button-content"><Icon name="arrowLeft" />返回编辑器</span>
          </button>
        </div>
      </header>
      <section className="runtime-canvas">
        {schema ? (
          <div className="runtime-card" style={{ left: schema.position.x, top: schema.position.y }}>
            <MetricCard schema={schema} value={value} freshness={freshness} ageSeconds={ageSeconds} />
          </div>
        ) : (
          <div className="runtime-empty" role="status">
            <strong>页面尚未发布</strong>
            <span>返回编辑器保存草稿并发布版本后，运行态才会显示页面内容。</span>
          </div>
        )}
        {schema && (
          <div className="prototype-controls" aria-label="原型演示控制">
            <strong>原型演示</strong>
            <button className={paused ? "active" : ""} type="button" onClick={pauseTelemetry}>{paused ? "恢复上报" : "暂停上报"}</button>
            <button type="button" onClick={triggerAlarm}>触发告警</button>
            <button type="button" onClick={disconnect}>模拟断线</button>
            <button type="button" onClick={recover}>恢复正常</button>
          </div>
        )}
        <div className="runtime-note">每秒接收一次确定性数据；暂停 5 秒可观察 Data Freshness 过期状态。</div>
      </section>
    </main>
  );
}

function EditorView({ schema, setSchema, onPreview, onPublish, publishedVersion }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedAt, setSavedAt] = useState("已自动保存");

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 1800);
  };

  const schemaText = useMemo(() => JSON.stringify({
    version: "1.0.0",
    canvas: { width: 1440, height: 900 },
    components: [schema],
  }, null, 2), [schema]);

  const updateProp = (key, value) => {
    setSchema((current) => ({
      ...current,
      props: { ...current.props, [key]: value },
    }));
    setSavedAt("有未保存修改");
  };

  const save = () => {
    setSavedAt(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    showToast("草稿已保存");
  };

  const publish = () => {
    const version = onPublish();
    setSavedAt(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    showToast(`已发布 v${version}`);
  };

  const copySchema = async () => {
    try {
      await navigator.clipboard.writeText(schemaText);
      showToast("Schema 已复制");
    } catch {
      showToast("当前浏览器未开放剪贴板权限");
    }
  };

  const onPointerDown = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left - schema.position.x,
      offsetY: event.clientY - rect.top - schema.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(16, Math.min(rect.width - 316, event.clientX - rect.left - dragRef.current.offsetX));
    const y = Math.max(16, Math.min(rect.height - 230, event.clientY - rect.top - dragRef.current.offsetY));
    setSchema((current) => ({ ...current, position: { x: Math.round(x), y: Math.round(y) } }));
    setSavedAt("有未保存修改");
  };

  const onPointerUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <main className="app" data-screen-label="监控画面编辑器">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand"><span className="brand-mark"></span><span className="brand-name">工业智控平台</span></div>
          <div className="page-name">监控画面编辑器</div>
          <div className="save-state"><span className="save-dot"></span>{savedAt}</div>
          {publishedVersion > 0 && <div className="published-state">已发布 v{publishedVersion}</div>}
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setDrawerOpen(true)}><span className="button-content"><Icon name="info" />设计说明</span></button>
          <button className="btn btn-secondary" type="button" onClick={onPreview}><span className="button-content"><Icon name="play" />预览运行态</span></button>
          <button className="btn btn-publish" type="button" onClick={publish}><span className="button-content"><Icon name="save" />发布版本</span></button>
          <button className="btn btn-primary" type="button" onClick={save}><span className="button-content"><Icon name="save" />保存草稿</span></button>
        </div>
      </header>
      <div className="workspace">
        <ComponentPalette showToast={showToast} />
        <section className="canvas-shell" ref={canvasRef} aria-label="编辑画布">
          <div className="canvas-tools">
            <button className="tool-button active" type="button" aria-label="选择"><Icon name="cursor" /></button>
            <button className="tool-button" type="button" aria-label="撤销" onClick={() => showToast("当前没有可撤销操作")}><Icon name="undo" /></button>
            <button className="tool-button" type="button" aria-label="重做" onClick={() => showToast("当前没有可重做操作")}><Icon name="redo" /></button>
          </div>
          <div
            className="metric-selection"
            style={{ left: schema.position.x, top: schema.position.y }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <MetricCard schema={schema} draggable onPointerDown={onPointerDown} />
            <span className="resize-handle tl"></span><span className="resize-handle tr"></span>
            <span className="resize-handle bl"></span><span className="resize-handle br"></span>
            <span className="resize-handle tm"></span><span className="resize-handle bm"></span>
          </div>
        </section>
        <Inspector schema={schema} updateProp={updateProp} copySchema={copySchema} schemaText={schemaText} />
        <footer className="statusbar">
          <div className="status-group"><span className="status-item">画布 <strong>1440 × 900</strong></span><span className="status-item">组件 <strong>1</strong></span></div>
          <div className="status-group"><span className="status-item">位置 <strong>X {schema.position.x} · Y {schema.position.y}</strong></span><span className="status-item">缩放 <strong>100%</strong></span></div>
        </footer>
      </div>
      <div className={`toast ${toast ? "visible" : ""}`} role="status"><span className="toast-check">✓</span>{toast}</div>
      {drawerOpen && <DesignDrawer onClose={() => setDrawerOpen(false)} />}
    </main>
  );
}

function App() {
  const [mode, setMode] = useState("editor");
  const [published, setPublished] = useState(null);
  const [schema, setSchema] = useState({
    id: "metric-pump-01",
    type: "metric-card",
    position: { x: 275, y: 250 },
    size: { width: 300, height: 214 },
    props: {
      deviceName: "1号冷却泵",
      title: "出口温度",
      dataKey: "pump1.outlet_temp",
      unit: "°C",
      precision: 1,
      alarmThreshold: 80,
    },
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && mode === "runtime") setMode("editor");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const publish = () => {
    const nextVersion = (published?.version ?? 0) + 1;
    setPublished({
      version: nextVersion,
      schema: JSON.parse(JSON.stringify(schema)),
    });
    return nextVersion;
  };

  if (mode === "runtime") return <RuntimeView published={published} onBack={() => setMode("editor")} />;
  return (
    <EditorView
      schema={schema}
      setSchema={setSchema}
      onPreview={() => setMode("runtime")}
      onPublish={publish}
      publishedVersion={published?.version ?? 0}
    />
  );
}

function trendTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function TrendChart({ node, samples, now, freshness = "fresh", ageSeconds = 0, onPointerDown }) {
  if (node.type === "device-state") {
    return <DeviceStateCard node={node} stateCode={1} freshness="fresh" ageSeconds={0} onPointerDown={onPointerDown} />;
  }
  const threshold = node.props.alarmThreshold;
  const visible = samples.filter((sample) => sample.time >= now - 60000);
  const numeric = visible.filter((sample) => typeof sample.value === "number");
  const latest = numeric.at(-1)?.value ?? null;
  const warning = freshness === "fresh" && latest !== null && latest >= threshold;
  const values = [...numeric.map((sample) => sample.value), threshold];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(2, (rawMax - rawMin) * 0.16);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const left = 48, right = 700, top = 16, bottom = 190;
  const x = (time) => left + ((time - (now - 60000)) / 60000) * (right - left);
  const y = (value) => bottom - ((value - min) / (max - min)) * (bottom - top);
  const yTicks = [0, 1, 2, 3].map((index) => min + ((max - min) * index) / 3);
  const xTicks = [60, 45, 30, 15, 0].map((seconds) => now - seconds * 1000);
  const segments = [];
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1], current = visible[index];
    if (previous.value === null || current.value === null || current.time - previous.time > 2200) continue;
    segments.push({ previous, current, warning: previous.value >= threshold || current.value >= threshold });
  }
  const stateText = freshness === "waiting" ? "等待数据" : freshness === "stale" ? "数据已过期" : warning ? "超过告警阈值" : "数据新鲜";
  return (
    <div className="trend-chart">
      <header className="trend-header" onPointerDown={onPointerDown}>
        <div className="trend-heading"><strong>{node.props.title}</strong><span>{node.props.dataKey} · 最近 60 秒</span></div>
        <div className="trend-summary"><div className={`trend-state ${freshness} ${warning ? "warning" : ""}`}>{stateText}</div><div className={`trend-current ${warning ? "warning" : ""}`}><strong>{latest === null ? "--" : latest.toFixed(node.props.precision)}</strong><span>{node.props.unit}</span></div></div>
      </header>
      <div className="trend-plot">
        <svg viewBox="0 0 720 220" role="img" aria-label={`${node.props.title}实时趋势`}>
          {yTicks.map((tick) => <g key={tick}><line className="trend-grid-line" x1={left} x2={right} y1={y(tick)} y2={y(tick)}></line><text className="trend-axis-label" x={left - 8} y={y(tick) + 3} textAnchor="end">{tick.toFixed(node.props.precision)}</text></g>)}
          {xTicks.map((tick, index) => <g key={tick}><line className="trend-grid-line" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom}></line><text className="trend-axis-label" x={x(tick)} y={bottom + 19} textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}>{trendTime(tick)}</text></g>)}
          <line className="trend-axis-line" x1={left} x2={right} y1={bottom} y2={bottom}></line>
          <line className="trend-threshold" x1={left} x2={right} y1={y(threshold)} y2={y(threshold)}></line>
          <text className="trend-threshold-label" x={right - 3} y={y(threshold) - 6} textAnchor="end">告警阈值 {threshold.toFixed(node.props.precision)} {node.props.unit}</text>
          {segments.map((segment, index) => <line key={index} className={`trend-line ${segment.warning ? "warning" : ""}`} x1={x(segment.previous.time)} y1={y(segment.previous.value)} x2={x(segment.current.time)} y2={y(segment.current.value)}></line>)}
          {numeric.map((sample) => <circle key={sample.time} className={`trend-point ${sample.value >= threshold ? "warning" : ""}`} cx={x(sample.time)} cy={y(sample.value)} r="3"></circle>)}
        </svg>
        {freshness === "waiting" && <div className="trend-empty"><strong>等待设备数据</strong><span>收到第一个 Trend Sample 后开始绘制</span></div>}
        {freshness === "stale" && <div className="trend-stale-overlay">数据已过期 · {ageSeconds}秒前</div>}
      </div>
    </div>
  );
}

function TrendPalette({ addTrend, addDeviceState, showToast }) {
  const items = [
    { name: "指标卡", icon: "chart", active: true, action: () => showToast("指标卡已在画布中") },
    { name: "文本", icon: "text" },
    { name: "折线图", icon: "line", active: true, action: addTrend },
    { name: "设备状态", icon: "device", active: true, action: () => window.__prototypeAddDeviceState?.() },
    { name: "告警列表", icon: "bell" },
  ];
  return <aside className="left-panel" aria-label="组件面板"><div className="panel-title">组件</div><div className="component-list">{items.map((item) => <button className={`component-row ${item.active ? "active" : "disabled"}`} key={item.name} onClick={() => item.active ? item.action() : showToast(`${item.name}将在后续版本开放`)} type="button"><span className="component-icon"><Icon name={item.icon} size={24} /></span><span>{item.name}</span>{!item.active && <span className="lock"><Icon name="lock" size={14} /></span>}</button>)}</div><div className="component-footer">更多组件开发中</div></aside>;
}

function TrendInspector({ node, updateProp, schemaText, copySchema }) {
  const isMetric = node.type === "metric-card";
  const isDeviceState = node.type === "device-state";
  const setNumber = (key, value) => updateProp(key, Number(value));
  return <aside className="right-panel" aria-label="属性配置"><div className="panel-title">属性配置</div><section className="inspector-section"><div className="panel-heading"><span className="section-title">基础属性</span><span className="type-code">{node.type}</span></div><div className="field-list">
    {(isMetric || isDeviceState) && <div className="field"><label htmlFor="deviceName">设备名称</label><input id="deviceName" value={node.props.deviceName} onChange={(event) => updateProp("deviceName", event.target.value)} /></div>}
    <div className="field"><label htmlFor="title">{isMetric ? "指标标题" : isDeviceState ? "组件标题" : "图表标题"}</label><input id="title" value={node.props.title} onChange={(event) => updateProp("title", event.target.value)} /></div>
    <div className="field"><label htmlFor="dataKey">数据键</label><input id="dataKey" value={node.props.dataKey} onChange={(event) => updateProp("dataKey", event.target.value)} /></div>
    {!isDeviceState && <><div className="field"><label htmlFor="unit">单位</label><input id="unit" value={node.props.unit} onChange={(event) => updateProp("unit", event.target.value)} /></div><div className="field"><label htmlFor="precision">小数位</label><input id="precision" type="number" min="0" max="3" value={node.props.precision} onChange={(event) => setNumber("precision", event.target.value)} /></div><div className="field"><label htmlFor="threshold">告警阈值</label><input id="threshold" type="number" value={node.props.alarmThreshold} onChange={(event) => setNumber("alarmThreshold", event.target.value)} /></div></>}
  </div></section><section className="inspector-section"><div className="schema-heading"><span className="section-title">Schema 预览</span><button className="link-button" type="button" onClick={copySchema}><Icon name="copy" size={13} />复制</button></div><pre className="schema-code">{schemaText}</pre></section></aside>;
}

function TrendDesignDrawer({ onClose }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="design-drawer" role="dialog" aria-modal="true" aria-labelledby="design-title"><header className="drawer-header"><div><h2 id="design-title">设备状态组件原型</h2><p>使用独立 Data Point 展示设备的 Device State，并与连接状态和 Data Freshness 保持区分。</p></div><button className="close-button" type="button" aria-label="关闭" onClick={onClose}><Icon name="close" /></button></header><section className="decision-block"><h3>本次验证什么</h3><p>设备状态组件复用 PageSchema、发布版本和页面级遥测通道，而不根据温度猜测设备是否运行。</p></section><section className="decision-block"><h3>状态码</h3><ul><li>0 停止 · 灰蓝</li><li>1 运行 · 绿色</li><li>2 故障 · 红色</li><li>3 维护 · 琥珀色</li><li>其他值 · 未知状态</li></ul></section><section className="decision-block"><h3>核心操作</h3><ul><li>从组件栏添加一个设备状态卡。</li><li>配置设备名称、组件标题和独立 dataKey。</li><li>在运行态切换全部 Device State。</li><li>暂停上报后查看状态数据过期。</li></ul></section><section className="decision-block"><h3>明确不做</h3><p>本次不做多实例、自定义状态码映射、设备控制或故障诊断。</p></section></aside></div>;
}

function TrendRuntime({ published, onBack }) {
  const sequence = [68.4, 72.0, 78.5, 81.2, 83.0, 79.0, 74.0];
  const stateSequence = [1, 3, 1, 2, 0, 1];
  const indexRef = useRef(0), stateIndexRef = useRef(0), timersRef = useRef([]);
  const [value, setValue] = useState(null), [samples, setSamples] = useState([]);
  const [deviceState, setDeviceState] = useState(null);
  const [connection, setConnection] = useState("connecting"), [freshness, setFreshness] = useState("waiting");
  const [lastUpdated, setLastUpdated] = useState(null), [paused, setPaused] = useState(false), [reconnectStep, setReconnectStep] = useState(0), [now, setNow] = useState(Date.now());
  const page = published?.schema;
  const appendValue = (nextValue) => { const timestamp = Date.now(); setValue(nextValue); setLastUpdated(timestamp); setFreshness("fresh"); setSamples((current) => { const next = [...current]; const previous = [...next].reverse().find((sample) => sample.value !== null); if (previous && timestamp - previous.time > 2200) next.push({ time: timestamp - 700, value: null }); next.push({ time: timestamp, value: nextValue }); return next.filter((sample) => sample.time >= timestamp - 60000).slice(-60); }); };
  const emitNext = () => { const nextValue = sequence[indexRef.current % sequence.length]; const nextState = stateSequence[stateIndexRef.current % stateSequence.length]; indexRef.current += 1; stateIndexRef.current += 1; setDeviceState(nextState); appendValue(nextValue); };
  const selectDeviceState = (stateCode) => { setPaused(true); setConnection("connected"); setDeviceState(stateCode); setLastUpdated(Date.now()); setFreshness("fresh"); };
  useEffect(() => { const clock = window.setInterval(() => setNow(Date.now()), 500); if (page) timersRef.current.push(window.setTimeout(() => { setConnection("connected"); emitNext(); }, 700)); return () => { window.clearInterval(clock); timersRef.current.forEach(window.clearTimeout); }; }, [Boolean(page)]);
  useEffect(() => { if (!page || connection !== "connected" || paused) return undefined; const timer = window.setInterval(emitNext, 1000); return () => window.clearInterval(timer); }, [Boolean(page), connection, paused]);
  useEffect(() => { if (value === null) setFreshness("waiting"); else if (lastUpdated && now - lastUpdated >= 5000) setFreshness("stale"); }, [now, lastUpdated, value]);
  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((now - lastUpdated) / 1000)) : 0;
  const recover = () => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; setReconnectStep(0); setPaused(false); setConnection("connected"); setDeviceState(1); appendValue(68.4); };
  const disconnect = () => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; setConnection("disconnected"); setPaused(true); setReconnectStep(0); timersRef.current.push(window.setTimeout(() => { setConnection("reconnecting"); setReconnectStep(1); }, 500), window.setTimeout(() => setReconnectStep(2), 1500), window.setTimeout(() => setReconnectStep(3), 3500), window.setTimeout(recover, 7500)); };
  const connectionText = connection === "connecting" ? "连接中" : connection === "disconnected" ? "连接已断开" : connection === "reconnecting" ? `正在重连 · 第${reconnectStep}次` : freshness === "stale" ? "连接正常 · 数据已过期" : freshness === "waiting" ? "已连接 · 等待数据" : "实时数据已连接";
  return <main className="runtime" data-screen-label="运行态趋势预览"><header className="runtime-topbar"><div className="runtime-title"><strong>{page?.name ?? "运行态"}</strong><span>{published ? `发布版本 · v${published.version}` : "尚未发布"}</span></div><div className="runtime-actions"><span className={`runtime-status ${connection} ${freshness}`}>{connectionText}</span><button className="btn btn-secondary" type="button" onClick={onBack}><span className="button-content"><Icon name="arrowLeft" />返回编辑器</span></button></div></header><section className="runtime-canvas">
    {page ? page.components.map((node) => <div key={node.id} className="runtime-component" style={{ left: node.position.x, top: node.position.y, width: node.size.width, height: node.size.height }}>{node.type === "metric-card" ? <MetricCard schema={node} value={value} freshness={freshness} ageSeconds={ageSeconds} /> : node.type === "device-state" ? <DeviceStateCard node={node} stateCode={deviceState} freshness={freshness} ageSeconds={ageSeconds} /> : <TrendChart node={node} samples={samples} now={now} freshness={freshness} ageSeconds={ageSeconds} />}</div>) : <div className="runtime-empty" role="status"><strong>页面尚未发布</strong><span>返回编辑器发布后才会显示页面内容。</span></div>}
    {page && <><div className="prototype-controls" aria-label="原型演示控制"><strong>遥测演示</strong><button className={paused ? "active" : ""} type="button" onClick={() => setPaused((current) => !current)}>{paused ? "恢复上报" : "暂停上报"}</button><button type="button" onClick={() => { setPaused(true); setConnection("connected"); appendValue(83.0); }}>触发告警</button><button type="button" onClick={disconnect}>模拟断线</button><button type="button" onClick={recover}>恢复正常</button></div><div className="prototype-controls device-controls" aria-label="Device State 演示控制"><strong>DEVICE STATE</strong><button type="button" onClick={() => selectDeviceState(1)}>运行</button><button type="button" onClick={() => selectDeviceState(3)}>维护</button><button type="button" onClick={() => selectDeviceState(2)}>故障</button><button type="button" onClick={() => selectDeviceState(0)}>停止</button><button type="button" onClick={() => selectDeviceState(9)}>未知</button></div></>}<div className="runtime-note">温度与 Device State 均通过实时遥测更新；暂停 5 秒后两者均进入数据过期。</div></section></main>;
}

function TrendEditor({ pageSchema, setPageSchema, onPreview, onPublish, publishedVersion }) {
  const canvasRef = useRef(null), pointerRef = useRef(null);
  const [selectedId, setSelectedId] = useState(pageSchema.components[0].id), [toast, setToast] = useState(""), [drawerOpen, setDrawerOpen] = useState(false), [savedAt, setSavedAt] = useState("已自动保存"), [contextMenu, setContextMenu] = useState(null), [lastDeleted, setLastDeleted] = useState(null);
  const selected = pageSchema.components.find((node) => node.id === selectedId) ?? pageSchema.components[0];
  const schemaText = useMemo(() => JSON.stringify(pageSchema, null, 2), [pageSchema]);
  const previewSamples = useMemo(() => { const end = Date.now(); return [68.4, 69.1, 70.8, 72.0, 74.3, 78.5, 81.2, 83.0, 79.0, 74.0].map((value, index, all) => ({ time: end - (all.length - 1 - index) * 4500, value })); }, []);
  const showToast = (message) => { setToast(message); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => setToast(""), 1800); };
  const updateNode = (id, updater) => setPageSchema((current) => ({ ...current, components: current.components.map((node) => node.id === id ? updater(node) : node) }));
  const updateProp = (key, value) => { updateNode(selectedId, (node) => ({ ...node, props: { ...node.props, [key]: value } })); setSavedAt("有未保存修改"); };
  const addTrend = () => { const existing = pageSchema.components.find((node) => node.type === "trend-chart"); if (existing) { setSelectedId(existing.id); showToast("趋势图已在画布中"); return; } const trend = { id: "trend-pump-01", type: "trend-chart", position: { x: 80, y: 405 }, size: { width: 720, height: 300 }, props: { title: "1号冷却泵出口温度趋势", dataKey: "pump1.outlet_temp", unit: "°C", precision: 1, alarmThreshold: 80 } }; setPageSchema((current) => ({ ...current, components: [...current.components, trend] })); setSelectedId(trend.id); setSavedAt("有未保存修改"); showToast("已添加折线图"); };
  const addDeviceState = () => { const existing = pageSchema.components.find((node) => node.type === "device-state"); if (existing) { setSelectedId(existing.id); showToast("设备状态已在画布中"); return; } const deviceState = { id: "device-state-pump-01", type: "device-state", position: { x: 610, y: 130 }, size: { width: 300, height: 180 }, props: { deviceName: "1号冷却泵", title: "设备运行状态", dataKey: "pump1.operating_state" } }; setPageSchema((current) => ({ ...current, components: [...current.components, deviceState] })); setSelectedId(deviceState.id); setSavedAt("有未保存修改"); showToast("已添加设备状态"); };
  window.__prototypeAddDeviceState = addDeviceState;
  const startPointer = (event, node, mode, direction = "") => {
    event.stopPropagation();
    setSelectedId(node.id);
    const rect = canvasRef.current.getBoundingClientRect();
    pointerRef.current = {
      mode, direction, id: node.id,
      startX: event.clientX, startY: event.clientY,
      x: node.position.x, y: node.position.y,
      width: node.size.width, height: node.size.height,
      offsetX: event.clientX - rect.left - node.position.x,
      offsetY: event.clientY - rect.top - node.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event) => {
    const state = pointerRef.current;
    if (!state) return;
    if (state.mode === "resize") {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      updateNode(state.id, (node) => {
        const minWidth = node.type === "trend-chart" ? 480 : 260;
        const minHeight = node.type === "trend-chart" ? 240 : node.type === "device-state" ? 160 : 200;
        let x = state.x, y = state.y, width = state.width, height = state.height;
        if (state.direction.includes("r")) width = Math.max(minWidth, state.width + dx);
        if (state.direction.includes("b")) height = Math.max(minHeight, state.height + dy);
        if (state.direction.includes("l")) {
          width = Math.max(minWidth, state.width - dx);
          x = state.x + state.width - width;
        }
        if (state.direction.includes("t")) {
          height = Math.max(minHeight, state.height - dy);
          y = state.y + state.height - height;
        }
        return { ...node, position: { x: Math.round(x), y: Math.round(y) }, size: { width: Math.round(width), height: Math.round(height) } };
      });
    } else {
      const rect = canvasRef.current.getBoundingClientRect();
      const node = pageSchema.components.find((item) => item.id === state.id);
      updateNode(state.id, (current) => ({ ...current, position: {
        x: Math.max(16, Math.round(Math.min(rect.width - node.size.width - 16, event.clientX - rect.left - state.offsetX))),
        y: Math.max(16, Math.round(Math.min(rect.height - node.size.height - 16, event.clientY - rect.top - state.offsetY))),
      } }));
    }
    setSavedAt("有未保存修改");
  };
  const endPointer = (event) => { pointerRef.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const copySchema = async () => { try { await navigator.clipboard.writeText(schemaText); showToast("Schema 已复制"); } catch { showToast("剪贴板权限不可用"); } };
  const publish = () => { const version = onPublish(); setSavedAt("已保存"); showToast(`已发布 v${version}`); };
  const openContextMenu = (event, node) => { event.preventDefault(); event.stopPropagation(); setSelectedId(node.id); setContextMenu({ componentId: node.id, x: Math.min(event.clientX, window.innerWidth - 124), y: Math.min(event.clientY, window.innerHeight - 38) }); };
  const closeContextMenu = () => setContextMenu(null);
  const deleteContextComponent = () => { if (!contextMenu) return; const index = pageSchema.components.findIndex((node) => node.id === contextMenu.componentId); const node = pageSchema.components[index]; if (!node) return; setLastDeleted({ node, index }); setPageSchema((current) => ({ ...current, components: current.components.filter((item) => item.id !== node.id) })); setSelectedId(pageSchema.components.find((item) => item.id !== node.id)?.id ?? null); setSavedAt("有未保存修改"); closeContextMenu(); showToast("组件已删除，可撤销恢复"); };
  const undoDelete = () => { if (!lastDeleted) { showToast("当前没有可撤销操作"); return; } setPageSchema((current) => { const components = [...current.components]; components.splice(lastDeleted.index, 0, lastDeleted.node); return { ...current, components }; }); setSelectedId(lastDeleted.node.id); setLastDeleted(null); setSavedAt("有未保存修改"); showToast("已恢复组件"); };
  return <main className="app" data-screen-label="实时趋势编辑器"><header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark"></span><span className="brand-name">工业智控平台</span></div><div className="page-name">监控画面编辑器</div><div className="save-state"><span className="save-dot"></span>{savedAt}</div>{publishedVersion > 0 && <div className="published-state">已发布 v{publishedVersion}</div>}</div><div className="topbar-actions"><button className="btn btn-ghost" type="button" onClick={() => setDrawerOpen(true)}><span className="button-content"><Icon name="info" />设计说明</span></button><button className="btn btn-secondary" type="button" onClick={onPreview}><span className="button-content"><Icon name="play" />预览运行态</span></button><button className="btn btn-publish" type="button" onClick={publish}><span className="button-content"><Icon name="save" />发布版本</span></button><button className="btn btn-primary" type="button" onClick={() => { setSavedAt("已保存"); showToast("草稿已保存"); }}><span className="button-content"><Icon name="save" />保存草稿</span></button></div></header><div className="workspace"><TrendPalette addTrend={addTrend} showToast={showToast} /><section className="canvas-shell" ref={canvasRef} aria-label="编辑画布"><div className="canvas-tools"><button className="tool-button active" type="button" aria-label="选择"><Icon name="cursor" /></button><button className="tool-button" type="button" aria-label="撤销"><Icon name="undo" /></button><button className="tool-button" type="button" aria-label="重做"><Icon name="redo" /></button></div>{pageSchema.components.map((node) => <div key={node.id} className={`component-frame ${node.type === "metric-card" ? "metric-frame" : "trend-frame"} ${selectedId === node.id ? "selected" : ""}`} style={{ left: node.position.x, top: node.position.y, width: node.size.width, height: node.size.height }} onClick={() => setSelectedId(node.id)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>{node.type === "metric-card" ? <MetricCard schema={node} draggable onPointerDown={(event) => startPointer(event, node, "drag")} /> : <TrendChart node={node} samples={previewSamples} now={Date.now()} onPointerDown={(event) => startPointer(event, node, "drag")} />}{selectedId === node.id && <><span className="resize-handle tl" onPointerDown={(event) => startPointer(event, node, "resize", "tl")}></span><span className="resize-handle tr" onPointerDown={(event) => startPointer(event, node, "resize", "tr")}></span><span className="resize-handle bl" onPointerDown={(event) => startPointer(event, node, "resize", "bl")}></span><span className="resize-handle tm" onPointerDown={(event) => startPointer(event, node, "resize", "t")}></span><span className="resize-handle bm" onPointerDown={(event) => startPointer(event, node, "resize", "b")}></span><span className="resize-handle br" onPointerDown={(event) => startPointer(event, node, "resize", "br")}></span></>}</div>)}</section><TrendInspector node={selected} updateProp={updateProp} copySchema={copySchema} schemaText={schemaText} /><footer className="statusbar"><div className="status-group"><span className="status-item">画布 <strong>1440 × 900</strong></span><span className="status-item">组件 <strong>{pageSchema.components.length}</strong></span></div><div className="status-group"><span className="status-item">选中 <strong>{selected.type}</strong></span><span className="status-item">位置 <strong>X {selected.position.x} · Y {selected.position.y}</strong></span><span className="status-item">缩放 <strong>100%</strong></span></div></footer></div><div className={`toast ${toast ? "visible" : ""}`} role="status"><span className="toast-check">✓</span>{toast}</div>{drawerOpen && <TrendDesignDrawer onClose={() => setDrawerOpen(false)} />}</main>;
}

function ContextMenuLayer({ pageSchema, setPageSchema }) {
  const [menu, setMenu] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);

  useEffect(() => {
    const onContextMenu = (event) => {
      const canvas = event.target.closest?.(".canvas-shell");
      if (!canvas) return;
      event.preventDefault();
      const frame = event.target.closest?.(".component-frame");
      const frameIndex = frame ? [...canvas.querySelectorAll(".component-frame")].indexOf(frame) : -1;
      const componentId = pageSchema.components[frameIndex]?.id;
      if (!componentId) {
        setMenu(null);
        return;
      }
      frame.click();
      setMenu({
        componentId,
        x: Math.min(event.clientX, window.innerWidth - 124),
        y: Math.min(event.clientY, window.innerHeight - 38),
      });
    };
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".prototype-context-menu")) setMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onClick = (event) => {
      if (!event.target.closest?.('button[aria-label="撤销"]') || !lastDeleted) return;
      setPageSchema((current) => {
        const components = [...current.components];
        components.splice(lastDeleted.index, 0, lastDeleted.node);
        return { ...current, components };
      });
      setLastDeleted(null);
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick, true);
    };
  }, [lastDeleted, pageSchema, setPageSchema]);

  const deleteComponent = () => {
    if (!menu) return;
    const index = pageSchema.components.findIndex((node) => node.id === menu.componentId);
    const node = pageSchema.components[index];
    if (!node) return;
    setLastDeleted({ node, index });
    setPageSchema((current) => ({
      ...current,
      components: current.components.filter((item) => item.id !== node.id),
    }));
    setMenu(null);
  };

  if (!menu) return null;
  return ReactDOM.createPortal(
    <div
      className="prototype-context-menu"
      role="menu"
      aria-label="组件操作"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={deleteComponent}>
        <Icon name="trash" size={13} />删除
      </button>
    </div>,
    document.body,
  );
}

function TrendEditorV5(props) {
  return <><TrendEditor {...props} /><ContextMenuLayer pageSchema={props.pageSchema} setPageSchema={props.setPageSchema} /></>;
}

function TrendPrototypeApp() {
  const [mode, setMode] = useState("editor"), [published, setPublished] = useState(null);
  const [pageSchema, setPageSchema] = useState({ version: "1.0.0", id: "demo", name: "冷却系统监控", canvas: { width: 1440, height: 900, background: "#0e1d2b" }, components: [
    { id: "metric-pump-01", type: "metric-card", position: { x: 275, y: 130 }, size: { width: 300, height: 214 }, props: { deviceName: "1号冷却泵", title: "出口温度", dataKey: "pump1.outlet_temp", unit: "°C", precision: 1, alarmThreshold: 80 } },
    { id: "trend-pump-01", type: "trend-chart", position: { x: 80, y: 370 }, size: { width: 720, height: 300 }, props: { title: "1号冷却泵出口温度趋势", dataKey: "pump1.outlet_temp", unit: "°C", precision: 1, alarmThreshold: 80 } },
  ] });
  useEffect(() => { const handler = (event) => { if (event.key === "Escape" && mode === "runtime") setMode("editor"); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [mode]);
  const publish = () => { const version = (published?.version ?? 0) + 1; setPublished({ version, schema: JSON.parse(JSON.stringify(pageSchema)) }); return version; };
  return mode === "runtime" ? <TrendRuntime published={published} onBack={() => setMode("editor")} /> : <TrendEditorV5 pageSchema={pageSchema} setPageSchema={setPageSchema} onPreview={() => setMode("runtime")} onPublish={publish} publishedVersion={published?.version ?? 0} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<TrendPrototypeApp />);
