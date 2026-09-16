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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
