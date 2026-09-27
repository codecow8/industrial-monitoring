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
    history: <><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></>,
    spark: <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7Z"></path><path d="m19 17 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6Z"></path></>,
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

function deriveActiveAlarms(page, value, deviceState) {
  if (!page) return [];
  const alarms = [];
  const seen = new Set();
  const deviceStateNodes = page.components.filter((node) => node.type === "device-state");
  for (const node of deviceStateNodes) {
    if (deviceState !== 2) continue;
    const identity = `${node.props.dataKey}:device-state:2`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    alarms.push({
      id: identity,
      kind: "fault",
      title: "设备故障",
      deviceName: node.props.deviceName,
      detail: node.props.title,
      valueText: "状态码 2",
      thresholdText: "检测到设备故障",
    });
  }
  const thresholdNodes = page.components.filter((node) => node.type === "metric-card" || node.type === "trend-chart");
  for (const node of thresholdNodes) {
    if (value === null || value < node.props.alarmThreshold) continue;
    const identity = `${node.props.dataKey}:threshold:${node.props.alarmThreshold}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const metric = thresholdNodes.find((candidate) =>
      candidate.type === "metric-card" &&
      candidate.props.dataKey === node.props.dataKey &&
      candidate.props.alarmThreshold === node.props.alarmThreshold
    );
    const source = metric ?? node;
    alarms.push({
      id: identity,
      kind: "threshold",
      title: `${source.props.title}超过告警阈值`,
      deviceName: source.props.deviceName ?? page.name,
      detail: source.props.dataKey,
      valueText: `${Number(value).toFixed(source.props.precision)} ${source.props.unit}`,
      thresholdText: `阈值 ≥ ${Number(source.props.alarmThreshold).toFixed(source.props.precision)} ${source.props.unit}`,
    });
  }
  return alarms;
}

function AlarmList({ node, alarms = [], freshness = "fresh", ageSeconds = 0, example = false, onPointerDown, onAnalyze, onHistory }) {
  const waiting = freshness === "waiting";
  const stale = freshness === "stale";
  return (
    <div className="alarm-list-card">
      <header className="alarm-list-header" onPointerDown={onPointerDown}>
        <div className="alarm-list-heading">
          <strong>{node.props.title}</strong>
          {example && <span className="alarm-example-badge">示例数据</span>}
        </div>
        <div className="alarm-list-actions">
          {onHistory && <button className="alarm-history-button" type="button" onClick={onHistory}><Icon name="history" size={13} />历史</button>}
          <span className={`alarm-count ${alarms.length ? "active" : ""}`}>{alarms.length} 条</span>
        </div>
      </header>
      <div className="alarm-list-body">
        {waiting && alarms.length === 0 ? (
          <div className="alarm-empty waiting"><Icon name="bell" size={24} /><strong>等待设备数据</strong><span>收到相关 Data Point 后开始判断</span></div>
        ) : alarms.length === 0 ? (
          <div className="alarm-empty normal"><span className="alarm-empty-check">✓</span><strong>当前无活动告警</strong><span>所有已配置条件均处于正常状态</span></div>
        ) : (
          <div className="alarm-rows">
            {alarms.map((alarm) => (
              <article className={`alarm-row ${alarm.kind} ${stale ? "stale" : ""}`} key={alarm.id}>
                <span className="alarm-kind-icon"><Icon name={alarm.kind === "fault" ? "device" : "bell"} size={18} /></span>
                <div className="alarm-row-copy">
                  <strong>{alarm.title}</strong>
                  <span>{alarm.deviceName} · {alarm.detail}</span>
                  <small>{alarm.thresholdText}</small>
                </div>
                <div className="alarm-row-value">
                  <strong>{alarm.valueText}</strong>
                  <span className={stale ? "stale" : "fresh"}>{stale ? `数据已过期 · ${ageSeconds}秒前` : "数据新鲜"}</span>
                  {onAnalyze && <button className="alarm-analyze-button" type="button" onClick={() => onAnalyze(alarm)}><Icon name="spark" size={13} />智能分析</button>}
                </div>
              </article>
            ))}
          </div>
        )}
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

function TrendPalette({ addTrend, addDeviceState, addAlarmList, showToast }) {
  const items = [
    { name: "指标卡", icon: "chart", active: true, action: () => showToast("指标卡已在画布中") },
    { name: "文本", icon: "text" },
    { name: "折线图", icon: "line", active: true, action: addTrend },
    { name: "设备状态", icon: "device", active: true, action: addDeviceState },
    { name: "告警列表", icon: "bell", active: true, action: addAlarmList },
  ];
  return <aside className="left-panel" aria-label="组件面板"><div className="panel-title">组件</div><div className="component-list">{items.map((item) => <button className={`component-row ${item.active ? "active" : "disabled"}`} key={item.name} onClick={() => item.active ? item.action() : showToast(`${item.name}将在后续版本开放`)} type="button"><span className="component-icon"><Icon name={item.icon} size={24} /></span><span>{item.name}</span>{!item.active && <span className="lock"><Icon name="lock" size={14} /></span>}</button>)}</div><div className="component-footer">更多组件开发中</div></aside>;
}

function TrendInspector({ node, updateProp, schemaText, copySchema }) {
  const isMetric = node.type === "metric-card";
  const isDeviceState = node.type === "device-state";
  const isAlarmList = node.type === "alarm-list";
  const setNumber = (key, value) => updateProp(key, Number(value));
  return <aside className="right-panel" aria-label="属性配置"><div className="panel-title">属性配置</div><section className="inspector-section"><div className="panel-heading"><span className="section-title">基础属性</span><span className="type-code">{node.type}</span></div><div className="field-list">
    {(isMetric || isDeviceState) && <div className="field"><label htmlFor="deviceName">设备名称</label><input id="deviceName" value={node.props.deviceName} onChange={(event) => updateProp("deviceName", event.target.value)} /></div>}
    <div className="field"><label htmlFor="title">{isMetric ? "指标标题" : isAlarmList || isDeviceState ? "组件标题" : "图表标题"}</label><input id="title" value={node.props.title} onChange={(event) => updateProp("title", event.target.value)} /></div>
    {!isAlarmList && <div className="field"><label htmlFor="dataKey">数据键</label><input id="dataKey" value={node.props.dataKey} onChange={(event) => updateProp("dataKey", event.target.value)} /></div>}
    {!isDeviceState && !isAlarmList && <><div className="field"><label htmlFor="unit">单位</label><input id="unit" value={node.props.unit} onChange={(event) => updateProp("unit", event.target.value)} /></div><div className="field"><label htmlFor="precision">小数位</label><input id="precision" type="number" min="0" max="3" value={node.props.precision} onChange={(event) => setNumber("precision", event.target.value)} /></div><div className="field"><label htmlFor="threshold">告警阈值</label><input id="threshold" type="number" value={node.props.alarmThreshold} onChange={(event) => setNumber("alarmThreshold", event.target.value)} /></div></>}
  </div></section><section className="inspector-section"><div className="schema-heading"><span className="section-title">Schema 预览</span><button className="link-button" type="button" onClick={copySchema}><Icon name="copy" size={13} />复制</button></div><pre className="schema-code">{schemaText}</pre></section></aside>;
}

function TrendDesignDrawer({ onClose }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="design-drawer" role="dialog" aria-modal="true" aria-labelledby="design-title"><header className="drawer-header"><div><h2 id="design-title">智能分析原型</h2><p>从一条活动告警出发，把观测事实、可能原因和建议检查分开呈现。</p></div><button className="close-button" type="button" aria-label="关闭" onClick={onClose}><Icon name="close" /></button></header><section className="decision-block"><h3>本次验证什么</h3><p>操作员能看懂分析依赖了哪些观测与资料，哪些说法仍需现场核实。</p></section><section className="decision-block"><h3>评审路径</h3><ul><li>加入告警列表并发布，进入运行态。</li><li>触发温度告警，在告警行点击“智能分析”。</li><li>检查完整证据、证据不足、加载和失败四种状态。</li><li>触发设备故障，确认打开的是对应告警。</li></ul></section><section className="decision-block"><h3>边界</h3><p>本原型使用固定模拟案例，不调用真实模型或诊断接口，也不控制设备。</p></section></aside></div>;
}

function DiagnosisDrawer({ alarm, status, stale, resolved, onClose, onRetry, onSetStatus }) {
  const isFault = alarm.kind === "fault";
  const [manualOpen, setManualOpen] = useState(false);
  return (
    <div className="diagnosis-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="diagnosis-drawer" role="dialog" aria-modal="true" aria-labelledby="diagnosis-title" data-screen-label="告警智能分析" data-diagnosis-drawer>
        <header className="diagnosis-header">
          <div className="diagnosis-header-icon"><Icon name="spark" size={20} /></div>
          <div className="diagnosis-header-copy"><span>辅助判断 · 原型演示</span><h2 id="diagnosis-title">告警智能分析</h2></div>
          <button className="diagnosis-close" type="button" aria-label="关闭智能分析" onClick={onClose}><Icon name="close" size={17} /></button>
        </header>
        <div className="diagnosis-scroll">
          <section className="diagnosis-alarm-summary">
            <span className="diagnosis-eyebrow">当前告警 · 发布版本 v1</span>
            <strong>{alarm.title}</strong>
            <span>{alarm.deviceName} · {alarm.detail}</span>
            <div><b>{alarm.valueText}</b><small>{alarm.thresholdText}</small></div>
          </section>
          {resolved && <p className="diagnosis-notice">该告警已恢复。以下分析仅针对选中时的历史观测。</p>}
          {stale && <p className="diagnosis-notice diagnosis-notice--stale">实时数据已过期；历史观测仍可参考，请先核对设备现场状态。</p>}

          {status === "loading" && <div className="diagnosis-state"><span className="diagnosis-spinner"></span><h3>正在整理告警证据</h3><p>查询遥测观测、设备状态与模拟手册章节…</p><div className="diagnosis-progress"><span></span></div></div>}

          {status === "error" && <div className="diagnosis-state diagnosis-state--error"><span className="diagnosis-state-mark">!</span><h3>暂时无法获取分析</h3><p>本次没有生成结论。你可以重试，当前告警仍保留在运行态。</p><button type="button" onClick={onRetry}>重新分析</button></div>}

          {status === "insufficient" && <>
            <div className="diagnosis-result-status diagnosis-result-status--limited"><strong>证据不足</strong><span>当前值可确认，触发起点与根因尚无法判断</span></div>
            <section className="diagnosis-section"><h3>已观测事实</h3><p>当前告警值为 <strong>{alarm.valueText}</strong>。本次查询没有找到{isFault ? "故障码 2 前的运行状态" : "越界前的正常温度"}，因此不能确定告警何时开始。<span className="diagnosis-ref">{isFault ? "O-104" : "O-103"}</span></p></section>
            <section className="diagnosis-section"><h3>缺少的证据</h3><ul><li>{isFault ? "故障前的运行状态基线与连续时间窗" : "告警前的正常温度基线与连续时间窗"}</li><li>冷却水流量、过滤器压差和泵体振动数据</li></ul></section>
            <section className="diagnosis-section"><h3>建议检查</h3><p>先核对现场设备状态和最近一次有效测量，再补充流量与过滤器数据；不根据单个告警值判定根因。</p></section>
          </>}

          {status === "complete" && <>
            <div className="diagnosis-result-status"><strong>已整理可核对证据</strong><span>原因仍需现场排查，不代表自动诊断结论</span></div>
            <section className="diagnosis-section"><h3>已观测事实</h3>
              <div className="diagnosis-fact"><span>01</span><p>{isFault ? "14:03:12 首次在本案例中观测到设备故障码 2；14:02:05 曾观测到运行码 1。" : "14:03:10 出口温度为 83.0 °C，高于已发布页面配置的 80.0 °C 阈值。"}<small>来源：{isFault ? "O-100 · O-104" : "O-103 · 页面配置 v1"}</small></p></div>
              <div className="diagnosis-fact"><span>02</span><p>{isFault ? "同一时段出口温度升至 83.0 °C，超过 80.0 °C 阈值。" : "14:02:10 为 72.0 °C；14:02:40 为 78.5 °C，随后首次观测到越界。"}<small>来源：{isFault ? "O-103" : "O-101 · O-102 · O-103"}</small></p></div>
              {!isFault && <div className="diagnosis-fact"><span>03</span><p>14:03:12 曾观测到设备故障码 2；当前实时状态可能已变化。<small>来源：O-104</small></p></div>}
            </section>
            <section className="diagnosis-section"><h3>可能原因 <em>待核实</em></h3><div className="diagnosis-hypothesis"><strong>冷却回路供水或泵体运行异常</strong><p>温度上升与故障状态同时出现，符合手册建议排查的方向。当前没有流量、压差和振动观测，无法判断是否堵塞或确认具体故障点。</p><small>依据：O-103 · O-104 · PUMP-01 §3.2</small></div></section>
            <section className="diagnosis-section"><h3>建议现场检查</h3><ol><li>核对冷却水流量和供水压力。</li><li>检查过滤器压差、泵体运行与现场告警记录。</li><li>补充传感器读数后由值班人员判断下一步操作。</li></ol></section>
            <section className="diagnosis-section diagnosis-sources"><h3>证据来源</h3><div><strong>遥测观测</strong><span>O-100 / O-101 / O-102 / O-103 / O-104 · 14:02—14:03</span></div><div><strong>设备资料</strong><button className="diagnosis-source-button" type="button" aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "收起" : "查看"}模拟手册 PUMP-01 §3.2</button>{manualOpen && <p className="diagnosis-source-excerpt">出口温度达到告警阈值时，核对冷却水流量、供水压力、过滤器压差与泵体运行状态。单凭温度或故障码，不能确认过滤器堵塞或具体故障点。</p>}</div></section>
          </>}
        </div>
        <footer className="diagnosis-demo-controls"><span>原型演示状态</span><div><button type="button" className={status === "complete" ? "active" : ""} onClick={() => onSetStatus("complete")}>完整证据</button><button type="button" className={status === "insufficient" ? "active" : ""} onClick={() => onSetStatus("insufficient")}>证据不足</button><button type="button" className={status === "loading" ? "active" : ""} onClick={() => onSetStatus("loading")}>加载中</button><button type="button" className={status === "error" ? "active" : ""} onClick={() => onSetStatus("error")}>分析失败</button></div></footer>
      </aside>
    </div>
  );
}

function HistoryDrawer({ status, onClose, onRetry, onSetStatus }) {
  const records = [
    { id: "temp", kind: "threshold", title: "出口温度越界", device: "1号冷却泵", key: "pump1.outlet_temp", start: "14:03:10", end: "14:04:30", trigger: "78.5 → 83.0 °C", recovery: "83.0 → 79.0 °C", startSource: "O-102 → O-103", endSource: "O-103 → O-105" },
    { id: "fault", kind: "fault", title: "设备状态故障", device: "1号冷却泵", key: "pump1.operating_state", start: "14:03:12", end: "14:04:35", trigger: "运行码 1 → 故障码 2", recovery: "故障码 2 → 停止码 0", startSource: "O-100 → O-104", endSource: "O-104 → O-106" },
  ];
  return <div className="history-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title" data-screen-label="历史告警" data-history-drawer>
      <header className="history-header"><div className="history-header-icon"><Icon name="history" size={20} /></div><div className="history-header-copy"><span>运行态 · 原型演示数据</span><h2 id="history-title">历史告警</h2></div><button className="diagnosis-close" type="button" aria-label="关闭历史告警" onClick={onClose}><Icon name="close" size={17} /></button></header>
      <div className="history-scroll">
        <div className="history-scope"><strong>当前发布版本 · 最近 24 小时</strong><span>仅展示有前后观测可证实的触发与恢复；无基线时不推断开始时间。</span></div>
        {status === "loading" && <div className="diagnosis-state" role="status"><span className="diagnosis-spinner"></span><h3>正在查询历史告警</h3><p>按观测时间整理触发与恢复记录…</p></div>}
        {status === "error" && <div className="diagnosis-state diagnosis-state--error" role="alert"><span className="diagnosis-state-mark">!</span><h3>暂时无法加载历史告警</h3><p>记录未被清空；请稍后重试。</p><button type="button" onClick={onRetry}>重新加载</button></div>}
        {status === "empty" && <div className="diagnosis-state" role="status"><span className="history-empty-mark">✓</span><h3>暂无历史告警</h3><p>最近 24 小时内没有可由相邻观测确认的告警转折。</p></div>}
        {status === "ready" && <><div className="history-list-heading"><strong>告警记录</strong><span>{records.length} 条</span></div><div className="history-records">{records.map((record) => <article className="history-record" key={record.id}><div className="history-record-top"><span className={`history-kind ${record.kind}`}><Icon name={record.kind === "fault" ? "device" : "bell"} size={13} />{record.kind === "fault" ? "设备故障" : "阈值告警"}</span><span className="history-recovered">已恢复</span></div><strong>{record.title}</strong><span className="history-record-device">{record.device} · {record.key}</span><div className="history-times"><div><small>触发</small><b>{record.start}</b><span>{record.trigger}</span></div><div><small>恢复</small><b>{record.end}</b><span>{record.recovery}</span></div></div><details><summary>查看观测依据</summary><p>触发：{record.startSource}</p><p>恢复：{record.endSource}</p></details></article>)}</div></>}
      </div>
      <footer className="diagnosis-demo-controls"><span>原型演示状态</span><div><button type="button" className={status === "ready" ? "active" : ""} onClick={() => onSetStatus("ready")}>有记录</button><button type="button" className={status === "empty" ? "active" : ""} onClick={() => onSetStatus("empty")}>无记录</button><button type="button" className={status === "loading" ? "active" : ""} onClick={() => onSetStatus("loading")}>加载中</button><button type="button" className={status === "error" ? "active" : ""} onClick={() => onSetStatus("error")}>加载失败</button></div></footer>
    </aside>
  </div>;
}

function TrendRuntime({ published, onBack }) {
  const sequence = [68.4, 72.0, 78.5, 81.2, 83.0, 79.0, 74.0];
  const stateSequence = [1, 3, 1, 2, 0, 1];
  const indexRef = useRef(0), stateIndexRef = useRef(0), timersRef = useRef([]);
  const [value, setValue] = useState(null), [samples, setSamples] = useState([]);
  const [deviceState, setDeviceState] = useState(null);
  const [connection, setConnection] = useState("connecting"), [freshness, setFreshness] = useState("waiting");
  const [lastUpdated, setLastUpdated] = useState(null), [paused, setPaused] = useState(false), [reconnectStep, setReconnectStep] = useState(0), [now, setNow] = useState(Date.now());
  const [analysisAlarm, setAnalysisAlarm] = useState(null), [analysisStatus, setAnalysisStatus] = useState("loading");
  const analysisTimerRef = useRef(null);
  const [historyOpen, setHistoryOpen] = useState(false), [historyStatus, setHistoryStatus] = useState("loading");
  const historyTimerRef = useRef(null);
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
  const activeAlarms = deriveActiveAlarms(page, value, deviceState);
  const openAnalysis = (alarm) => {
    window.clearTimeout(analysisTimerRef.current);
    setAnalysisAlarm(alarm);
    setAnalysisStatus("loading");
    analysisTimerRef.current = window.setTimeout(() => setAnalysisStatus("complete"), 850);
  };
  const closeAnalysis = () => { window.clearTimeout(analysisTimerRef.current); setAnalysisAlarm(null); };
  const setAnalysisVariant = (nextStatus) => { window.clearTimeout(analysisTimerRef.current); setAnalysisStatus(nextStatus); };
  const openHistory = () => { window.clearTimeout(historyTimerRef.current); setHistoryOpen(true); setHistoryStatus("loading"); historyTimerRef.current = window.setTimeout(() => setHistoryStatus("ready"), 650); };
  const closeHistory = () => { window.clearTimeout(historyTimerRef.current); setHistoryOpen(false); };
  useEffect(() => {
    if (!analysisAlarm) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") closeAnalysis(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analysisAlarm]);
  useEffect(() => () => window.clearTimeout(analysisTimerRef.current), []);
  useEffect(() => { if (!historyOpen) return undefined; const onKeyDown = (event) => { if (event.key === "Escape") closeHistory(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [historyOpen]);
  useEffect(() => () => window.clearTimeout(historyTimerRef.current), []);
  return <main className="runtime" data-screen-label="运行态趋势预览"><header className="runtime-topbar"><div className="runtime-title"><strong>{page?.name ?? "运行态"}</strong><span>{published ? `发布版本 · v${published.version}` : "尚未发布"}</span></div><div className="runtime-actions"><span className={`runtime-status ${connection} ${freshness}`}>{connectionText}</span><button className="btn btn-secondary" type="button" onClick={onBack}><span className="button-content"><Icon name="arrowLeft" />返回编辑器</span></button></div></header><section className="runtime-canvas">
    {page ? page.components.map((node) => <div key={node.id} className="runtime-component" style={{ left: node.position.x, top: node.position.y, width: node.size.width, height: node.size.height }}>{node.type === "metric-card" ? <MetricCard schema={node} value={value} freshness={freshness} ageSeconds={ageSeconds} /> : node.type === "device-state" ? <DeviceStateCard node={node} stateCode={deviceState} freshness={freshness} ageSeconds={ageSeconds} /> : node.type === "alarm-list" ? <AlarmList node={node} alarms={activeAlarms} freshness={freshness} ageSeconds={ageSeconds} onAnalyze={openAnalysis} onHistory={openHistory} /> : <TrendChart node={node} samples={samples} now={now} freshness={freshness} ageSeconds={ageSeconds} />}</div>) : <div className="runtime-empty" role="status"><strong>页面尚未发布</strong><span>返回编辑器发布后才会显示页面内容。</span></div>}
    {page && <><div className="prototype-controls" aria-label="原型演示控制"><strong>遥测演示</strong><button className={paused ? "active" : ""} type="button" onClick={() => setPaused((current) => !current)}>{paused ? "恢复上报" : "暂停上报"}</button><button type="button" onClick={() => { setPaused(true); setConnection("connected"); appendValue(83.0); }}>触发告警</button><button type="button" onClick={disconnect}>模拟断线</button><button type="button" onClick={recover}>恢复正常</button></div><div className="prototype-controls device-controls" aria-label="Device State 演示控制"><strong>DEVICE STATE</strong><button type="button" onClick={() => selectDeviceState(1)}>运行</button><button type="button" onClick={() => selectDeviceState(3)}>维护</button><button type="button" onClick={() => selectDeviceState(2)}>故障</button><button type="button" onClick={() => selectDeviceState(0)}>停止</button><button type="button" onClick={() => selectDeviceState(9)}>未知</button></div></>}<div className="runtime-note">活动告警由当前页面的遥测与 Schema 实时计算；数据过期不会自动清除已有告警。</div>
    {analysisAlarm && <DiagnosisDrawer alarm={analysisAlarm} status={analysisStatus} stale={freshness === "stale"} resolved={!activeAlarms.some((item) => item.id === analysisAlarm.id)} onClose={closeAnalysis} onRetry={() => openAnalysis(analysisAlarm)} onSetStatus={setAnalysisVariant} />}
    {historyOpen && <HistoryDrawer status={historyStatus} onClose={closeHistory} onRetry={openHistory} onSetStatus={(nextStatus) => { window.clearTimeout(historyTimerRef.current); setHistoryStatus(nextStatus); }} />}
    </section></main>;
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
  const addAlarmList = () => { const existing = pageSchema.components.find((node) => node.type === "alarm-list"); if (existing) { setSelectedId(existing.id); showToast("告警列表已在画布中"); return; } const alarmList = { id: "alarm-list-main", type: "alarm-list", position: { x: 830, y: 370 }, size: { width: 520, height: 300 }, props: { title: "活动告警" } }; setPageSchema((current) => ({ ...current, components: [...current.components, alarmList] })); setSelectedId(alarmList.id); setSavedAt("有未保存修改"); showToast("已添加告警列表"); };
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
        const minWidth = node.type === "trend-chart" ? 480 : node.type === "alarm-list" ? 420 : 260;
        const minHeight = node.type === "trend-chart" ? 240 : node.type === "alarm-list" ? 220 : node.type === "device-state" ? 160 : 200;
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
  const previewAlarms = [
    { id: "example-fault", kind: "fault", title: "设备故障", deviceName: "1号冷却泵", detail: "设备运行状态", valueText: "状态码 2", thresholdText: "检测到设备故障" },
    { id: "example-threshold", kind: "threshold", title: "出口温度超过告警阈值", deviceName: "1号冷却泵", detail: "pump1.outlet_temp", valueText: "83.0 °C", thresholdText: "阈值 ≥ 80.0 °C" },
  ];
  return <main className="app" data-screen-label="活动告警列表编辑器"><header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark"></span><span className="brand-name">工业智控平台</span></div><div className="page-name">监控画面编辑器</div><div className="save-state"><span className="save-dot"></span>{savedAt}</div>{publishedVersion > 0 && <div className="published-state">已发布 v{publishedVersion}</div>}</div><div className="topbar-actions"><button className="btn btn-ghost" type="button" onClick={() => setDrawerOpen(true)}><span className="button-content"><Icon name="info" />设计说明</span></button><button className="btn btn-secondary" type="button" onClick={onPreview}><span className="button-content"><Icon name="play" />预览运行态</span></button><button className="btn btn-publish" type="button" onClick={publish}><span className="button-content"><Icon name="save" />发布版本</span></button><button className="btn btn-primary" type="button" onClick={() => { setSavedAt("已保存"); showToast("草稿已保存"); }}><span className="button-content"><Icon name="save" />保存草稿</span></button></div></header><div className="workspace"><TrendPalette addTrend={addTrend} addDeviceState={addDeviceState} addAlarmList={addAlarmList} showToast={showToast} /><section className="canvas-shell" ref={canvasRef} aria-label="编辑画布"><div className="canvas-tools"><button className="tool-button active" type="button" aria-label="选择"><Icon name="cursor" /></button><button className="tool-button" type="button" aria-label="撤销"><Icon name="undo" /></button><button className="tool-button" type="button" aria-label="重做"><Icon name="redo" /></button></div>{pageSchema.components.map((node) => <div key={node.id} className={`component-frame ${node.type === "metric-card" ? "metric-frame" : node.type === "device-state" ? "device-frame" : node.type === "alarm-list" ? "alarm-frame" : "trend-frame"} ${selectedId === node.id ? "selected" : ""}`} style={{ left: node.position.x, top: node.position.y, width: node.size.width, height: node.size.height }} onClick={() => setSelectedId(node.id)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>{node.type === "metric-card" ? <MetricCard schema={node} draggable onPointerDown={(event) => startPointer(event, node, "drag")} /> : node.type === "device-state" ? <DeviceStateCard node={node} onPointerDown={(event) => startPointer(event, node, "drag")} /> : node.type === "alarm-list" ? <AlarmList node={node} alarms={previewAlarms} example onPointerDown={(event) => startPointer(event, node, "drag")} /> : <TrendChart node={node} samples={previewSamples} now={Date.now()} onPointerDown={(event) => startPointer(event, node, "drag")} />}{selectedId === node.id && <><span className="resize-handle tl" onPointerDown={(event) => startPointer(event, node, "resize", "tl")}></span><span className="resize-handle tr" onPointerDown={(event) => startPointer(event, node, "resize", "tr")}></span><span className="resize-handle bl" onPointerDown={(event) => startPointer(event, node, "resize", "bl")}></span><span className="resize-handle tm" onPointerDown={(event) => startPointer(event, node, "resize", "t")}></span><span className="resize-handle bm" onPointerDown={(event) => startPointer(event, node, "resize", "b")}></span><span className="resize-handle br" onPointerDown={(event) => startPointer(event, node, "resize", "br")}></span></>}</div>)}</section><TrendInspector node={selected} updateProp={updateProp} copySchema={copySchema} schemaText={schemaText} /><footer className="statusbar"><div className="status-group"><span className="status-item">画布 <strong>1440 × 900</strong></span><span className="status-item">组件 <strong>{pageSchema.components.length}</strong></span></div><div className="status-group"><span className="status-item">选中 <strong>{selected.type}</strong></span><span className="status-item">位置 <strong>X {selected.position.x} · Y {selected.position.y}</strong></span><span className="status-item">缩放 <strong>100%</strong></span></div></footer></div><div className={`toast ${toast ? "visible" : ""}`} role="status"><span className="toast-check">✓</span>{toast}</div>{drawerOpen && <TrendDesignDrawer onClose={() => setDrawerOpen(false)} />}</main>;
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
    { id: "device-state-pump-01", type: "device-state", position: { x: 610, y: 130 }, size: { width: 300, height: 180 }, props: { deviceName: "1号冷却泵", title: "设备运行状态", dataKey: "pump1.operating_state" } },
    { id: "trend-pump-01", type: "trend-chart", position: { x: 80, y: 370 }, size: { width: 720, height: 300 }, props: { title: "1号冷却泵出口温度趋势", dataKey: "pump1.outlet_temp", unit: "°C", precision: 1, alarmThreshold: 80 } },
    { id: "alarm-list-main", type: "alarm-list", position: { x: 830, y: 370 }, size: { width: 520, height: 300 }, props: { title: "活动告警" } },
  ] });
  useEffect(() => { const handler = (event) => { if (event.key === "Escape" && mode === "runtime" && !document.querySelector("[data-diagnosis-drawer], [data-history-drawer]")) setMode("editor"); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [mode]);
  const publish = () => { const version = (published?.version ?? 0) + 1; setPublished({ version, schema: JSON.parse(JSON.stringify(pageSchema)) }); return version; };
  return mode === "runtime" ? <TrendRuntime published={published} onBack={() => setMode("editor")} /> : <TrendEditorV5 pageSchema={pageSchema} setPageSchema={setPageSchema} onPreview={() => setMode("runtime")} onPublish={publish} publishedVersion={published?.version ?? 0} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<TrendPrototypeApp />);
