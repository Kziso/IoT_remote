import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const DEADZONE = 0.12;
const POLL_HZ = 60;

// WebSocket
const WS_HZ = 30;        // 制御送信レート
const DIFF_EPS = 0.02;   // 差分しきい値
const FORCE_MS = 100;    // 差分がなくても再送する間隔（出力維持のため）

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dz = v => (Math.abs(v) < DEADZONE ? 0 : v);

export default function DualMotorWS() {
  // 制御値（-1..+1）
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  // 視覚用のスムージング表示
  const [leftVis, setLeftVis] = useState(0);
  const [rightVis, setRightVis] = useState(0);

  // Gamepad 状態
  const [gamepadId, setGamepadId] = useState("(none)");
  const [gpConnected, setGpConnected] = useState(false);

  // WebSocket 状態
  const [wsUrl, setWsUrl] = useState("ws://192.168.32.66:81/"); // ← ArduinoのIPに合わせて
  const [wsState, setWsState] = useState("disconnected");       // disconnected|connecting|connected
  const wsRef = useRef(null);
  const lastSentRef = useRef({ L: 999, R: 999 });
  const lastForceAtRef = useRef(0);

  // ログ
  const [log, setLog] = useState([]);

  // キー入力（左 E↑/F↓、右 I↑/J↓、Space=全停止）
  const held = useRef({ E:false, F:false, I:false, J:false, space:false });
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "e") held.current.E = true;
      if (k === "f") held.current.F = true;
      if (k === "i") held.current.I = true;
      if (k === "j") held.current.J = true;
      if (k === " ") held.current.space = true;
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === "e") held.current.E = false;
      if (k === "f") held.current.F = false;
      if (k === "i") held.current.I = false;
      if (k === "j") held.current.J = false;
      if (k === " ") held.current.space = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Gamepad 接続検知
  useEffect(() => {
    const onConnect = (e) => { setGpConnected(true); setGamepadId(e.gamepad.id); };
    const onDisconnect = () => { setGpConnected(false); setGamepadId("(none)"); };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // 入力統合（60Hz）
  useEffect(() => {
    const iv = setInterval(() => {
      let L = 0, R = 0;

      // キー
      if (held.current.E) L += 1;
      if (held.current.F) L -= 1;
      if (held.current.I) R += 1;
      if (held.current.J) R -= 1;

      // Gamepad: 左Y→左、右Y→右（上が前進になるよう符号反転）
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (gp) {
        const ax = gp.axes.map(v => +dz(v).toFixed(3));
        const leftY  = (ax[1] ?? 0);
        const rightY = (ax[3] ?? 0);
        const L_gp = -leftY;
        const R_gp = -rightY;
        if (Math.abs(L_gp) > 0.05) L = L_gp;
        if (Math.abs(R_gp) > 0.05) R = R_gp;
      }

      // 全停止
      if (held.current.space) { L = 0; R = 0; }

      // クランプして反映
      L = clamp(L, -1, 1);
      R = clamp(R, -1, 1);
      setLeft(L);
      setRight(R);

      // 視覚用スムージング
      const alpha = 0.4;
      setLeftVis(prev => prev + (L - prev) * alpha);
      setRightVis(prev => prev + (R - prev) * alpha);
    }, 1000 / POLL_HZ);
    return () => clearInterval(iv);
  }, []);

  // 制御送信（30Hz）：差分 + 定期リフレッシュ（FORCE_MSごとに必ず送る）
  useEffect(() => {
    const iv = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const L = +left.toFixed(2);
      const R = +right.toFixed(2);
      const last = lastSentRef.current;

      const now = Date.now();
      const force = (now - (lastForceAtRef.current || 0)) > FORCE_MS;

      if (!force && Math.abs(L - last.L) < DIFF_EPS && Math.abs(R - last.R) < DIFF_EPS) return;

      lastSentRef.current = { L, R };
      if (force) lastForceAtRef.current = now;

      ws.send(JSON.stringify({ v:1, cmd:"drive", L, R }));
    }, 1000 / WS_HZ);
    return () => clearInterval(iv);
  }, [left, right]);

  // 心拍（1s）
  useEffect(() => {
    const iv = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ v:1, cmd:"ping", t: Date.now() }));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // 接続/切断
  function connectWS() {
    try {
      setWsState("connecting");
      const ws = new WebSocket(wsUrl); // 例: ws://192.168.1.50:81/
      ws.onopen = () => {
        wsRef.current = ws;
        setWsState("connected");
        appendLog("WS OPEN");
        ws.send(JSON.stringify({ v:1, cmd:"hello", token:"abc123" }));
      };
      ws.onclose = (ev) => {
        appendLog(`WS CLOSE code=${ev.code} reason=${ev.reason || "(none)"}`);
        wsRef.current = null;
        setWsState("disconnected");
      };
      ws.onerror = (ev) => {
        appendLog("WS ERROR (see DevTools console for details)");
        console.error("WS error", ev);
      };
      ws.onmessage = (ev) => {
        appendLog(ev.data);
      };
    } catch (e) {
      appendLog(`WS EXCEPTION: ${e.message}`);
      setWsState("disconnected");
    }
  }
  function disconnectWS() {
    wsRef.current?.close();
    wsRef.current = null;
    setWsState("disconnected");
  }
  function appendLog(s) {
    setLog(prev => {
      const next = [...prev, s];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }

  // E-Stop / Reset
  const eStop = () => {
    wsRef.current?.send(JSON.stringify({ v:1, cmd:"estop", on:true }));
    setLeft(0); setRight(0);
    // 送信直後にもdriveを送っておく（出力0を即共有）
    wsRef.current?.send(JSON.stringify({ v:1, cmd:"drive", L:0, R:0 }));
  };
  const reset = () => {
    wsRef.current?.send(JSON.stringify({ v:1, cmd:"reset" }));
    setLeft(0); setRight(0);
  };

  const serColor = wsState === "connected" ? "bg-emerald-400"
                  : wsState === "connecting" ? "bg-amber-400"
                  : "bg-rose-400";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 grid grid-cols-2 gap-6">
      <Header
        gpConnected={gpConnected}
        gamepadId={gamepadId}
        wsState={wsState}
        wsUrl={wsUrl}
        setWsUrl={setWsUrl}
        onConnectWS={connectWS}
        onDisconnectWS={disconnectWS}
        onEStop={eStop}
        onReset={reset}
        serColor={serColor}
      />

      {/* 左右スライダー */}
      <Panel title="Left Motor (E↑ / F↓)">
        <VerticalSlider value={leftVis} onChange={v => setLeft(v)} />
      </Panel>

      <Panel title="Right Motor (I↑ / J↓)">
        <VerticalSlider value={rightVis} onChange={v => setRight(v)} />
      </Panel>

      {/* WSログ */}
      <div className="col-span-2">
        <Panel title="WS Log">
          <div className="h-56 overflow-auto bg-black/40 rounded-lg p-2 font-mono text-xs leading-5">
            {log.length === 0 ? (
              <div className="opacity-60">（ArduinoからのACKやテレメトリが表示されます）</div>
            ) : (
              log.map((l,i)=>(<div key={i}>{l}</div>))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="col-span-1 bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-800">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Header({ gpConnected, gamepadId, wsState, wsUrl, setWsUrl, onConnectWS, onDisconnectWS, onEStop, onReset, serColor }) {
  const color = gpConnected ? "bg-emerald-400" : "bg-rose-400";
  return (
    <div className="col-span-2 flex items-center justify-between bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <div>
        <h1 className="text-xl font-bold">Dual Motor Controller (WebSocket)</h1>
        <p className="text-xs text-gray-400">
          Vertical sliders: -1..+1 (Up=Forward / Down=Reverse). Keyboard: Left(E/F), Right(I/J). Gamepad sticks supported.
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 pr-3 border-r border-gray-800">
          <span className={`w-3 h-3 rounded-full ${color}`} />
          <span className="hidden sm:inline">Gamepad:</span>
          <span className="truncate max-w-[180px] text-gray-300">{gamepadId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${serColor}`} />
          <input
            className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs w-56"
            value={wsUrl}
            onChange={(e)=>setWsUrl(e.target.value)}
            title="ws://<arduino-ip>:81/"
          />
          {wsState !== "connected" ? (
            <button onClick={onConnectWS} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500">Connect</button>
          ) : (
            <button onClick={onDisconnectWS} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600">Disconnect</button>
          )}
        </div>
        <button onClick={onReset} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600">Reset</button>
        <button onClick={onEStop} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500">E-Stop</button>
      </div>
    </div>
  );
}

function VerticalSlider({ value, onChange }) {
  // value: -1..+1
  const pct = Math.round(clamp((value + 1) / 2, 0, 1) * 100);
  return (
    <div className="flex items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="text-xs text-gray-400 mb-2">+100</div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          onChange={(e)=>onChange(Number(e.target.value) / 100)}
          // Edge/Chrome 縦スライダー
          style={{ WebkitAppearance: "slider-vertical", writingMode: "bt-lr", height: "260px" }}
          className="w-6 h-[260px] bg-gray-800 rounded-xl accent-cyan-400"
        />
        <div className="text-xs text-gray-400 mt-2">-100</div>
        <div className="mt-3 text-sm text-gray-300">{pct}%</div>
      </div>
    </div>
  );
}
