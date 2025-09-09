import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const DEADZONE = 0.12;
const POLL_HZ = 60;

// Web Serial
const SERIAL_HZ = 30;
const BAUD = 115200;
const CHANGE_EPS = 0.02;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dz = v => (Math.abs(v) < DEADZONE ? 0 : v);

export default function MotorDualSliders() {
  // 左右モーターの目標値（-1..+1）: 上＝正転、下＝逆転の想定
  const [left, setLeft]   = useState(0);
  const [right, setRight] = useState(0);

  // 表示用のスムージング（視覚の揺れを減らす）
  const [leftVis, setLeftVis]   = useState(0);
  const [rightVis, setRightVis] = useState(0);

  // Gamepad / Keyboard 状態
  const [gamepadId, setGamepadId] = useState("(none)");
  const [gpConnected, setGpConnected] = useState(false);
  const held = useRef({ E:false, F:false, I:false, J:false, space:false });

  // Web Serial 状態
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialLog, setSerialLog] = useState([]);
  const serialPortRef = useRef(null);
  const serialWriterRef = useRef(null);
  const readerRef = useRef(null);
  const decoderRef = useRef(null);
  const pipeDoneRef = useRef(null);
  const lastSentRef = useRef({ L:999, R:999 });

  // ===== キーボード（左：E/F、右：I/J、Space=ブレーキ） =====
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'e') held.current.E = true;
      if (k === 'f') held.current.F = true;
      if (k === 'i') held.current.I = true;
      if (k === 'j') held.current.J = true;
      if (k === ' ') held.current.space = true;
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'e') held.current.E = false;
      if (k === 'f') held.current.F = false;
      if (k === 'i') held.current.I = false;
      if (k === 'j') held.current.J = false;
      if (k === ' ') held.current.space = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // ===== Gamepad 接続検知 =====
  useEffect(() => {
    const onConnect = (e) => { setGpConnected(true); setGamepadId(e.gamepad.id); };
    const onDisconnect = () => { setGpConnected(false); setGamepadId('(none)'); };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  // ===== 入力統合（60Hz）: キー(E/F/I/J) + ゲームパッド 左右スティックY =====
  useEffect(() => {
    const iv = setInterval(() => {
      let L = 0, R = 0;

      // キー（E=左+、F=左-、I=右+、J=右-）
      if (held.current.E) L += 1;
      if (held.current.F) L -= 1;
      if (held.current.I) R += 1;
      if (held.current.J) R -= 1;

      // Gamepad: 左スティックY → 左、右スティックY → 右
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (gp) {
        const ax = gp.axes.map(v => +dz(v).toFixed(3));
        // 通常: ax[1] が左stickのY, ax[3] が右stickのY（手元の一般的パッド想定）
        const leftY  = (ax[1] ?? 0);
        const rightY = (ax[3] ?? 0);
        // 上で前進(正)に合わせるため符号反転
        const L_gp = -leftY;
        const R_gp = -rightY;

        // スティックの入力がそれなりにある時はGamepad優先
        if (Math.abs(L_gp) > 0.05) L = L_gp;
        if (Math.abs(R_gp) > 0.05) R = R_gp;
      }

      // ブレーキ（Space）→ 瞬時に0へ
      if (held.current.space) { L = 0; R = 0; }

      setLeft(prev => clamp(L, -1, 1));
      setRight(prev => clamp(R, -1, 1));

      // 表示はゆるやかに追従
      const alpha = 0.4;
      setLeftVis(prev => prev + (clamp(L,-1,1) - prev) * alpha);
      setRightVis(prev => prev + (clamp(R,-1,1) - prev) * alpha);
    }, 1000 / POLL_HZ);
    return () => clearInterval(iv);
  }, []);

  // ===== 非常停止 / リセット =====
  const eStop = () => {
    setLeft(0); setRight(0);
    sendSerialLine("ESTOP:1\n");
    setTimeout(()=> sendSerialLine("ESTOP:0\n"), 200);
  };
  const reset = () => {
    setLeft(0); setRight(0);
    sendSerialLine("RESET\n");
  };

  // ===== Web Serial: 接続/受信/切断 =====
  async function connectSerial() {
    try {
      if (!("serial" in navigator)) {
        alert("このブラウザはWeb Serialに未対応です（Chrome / Edge 推奨）");
        return;
      }
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD });
      serialPortRef.current = port;
      serialWriterRef.current = port.writable.getWriter();
      setSerialConnected(true);

      // 受信パイプ開始
      decoderRef.current = new TextDecoderStream();
      pipeDoneRef.current = port.readable.pipeTo(decoderRef.current.writable);
      readerRef.current = decoderRef.current.readable.getReader();

      (async () => {
        let buf = "";
        try {
          for (;;) {
            const { value, done } = await readerRef.current.read();
            if (done) break;
            if (value) {
              buf += value;
              let idx;
              while ((idx = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, idx).replace(/\r$/, "");
                buf = buf.slice(idx + 1);
                setSerialLog(prev => {
                  const next = [...prev, line];
                  return next.length > 300 ? next.slice(-300) : next;
                });
              }
            }
          }
        } catch {}
      })();

      port.addEventListener("disconnect", () => cleanupSerial(true));
    } catch (e) {
      console.error(e);
      alert("シリアル接続に失敗しました");
    }
  }

  async function disconnectSerial() { await cleanupSerial(false); }

  async function cleanupSerial(fromDisconnectEvent) {
    try { await readerRef.current?.cancel(); } catch {}
    try { await pipeDoneRef.current; } catch {}
    try { readerRef.current?.releaseLock(); } catch {}
    readerRef.current = null;
    decoderRef.current = null;
    pipeDoneRef.current = null;

    try { await serialWriterRef.current?.close?.(); } catch {}
    try { if (!fromDisconnectEvent) await serialPortRef.current?.close?.(); } catch {}
    serialWriterRef.current = null;
    serialPortRef.current = null;
    setSerialConnected(false);
  }

  async function sendSerialLine(line) {
    if (!serialWriterRef.current) return;
    try { await serialWriterRef.current.write(new TextEncoder().encode(line)); } catch (e) { console.warn("write failed", e); }
  }

  // ===== シリアル送信（30Hz、差分のみ）：L,R を -1..+1 二桁で送信 =====
  useEffect(() => {
    const iv = setInterval(() => {
      if (!serialWriterRef.current) return;
      const L = +left.toFixed(2), R = +right.toFixed(2);
      const last = lastSentRef.current;
      if (Math.abs(L - last.L) < CHANGE_EPS && Math.abs(R - last.R) < CHANGE_EPS) return;
      lastSentRef.current = { L, R };
      sendSerialLine(`L:${L},R:${R}\n`);
    }, 1000 / SERIAL_HZ);
    return () => clearInterval(iv);
  }, [left, right]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 grid grid-cols-2 gap-6">
      <Header
        gpConnected={gpConnected}
        gamepadId={gamepadId}
        serialConnected={serialConnected}
        onConnectSerial={connectSerial}
        onDisconnectSerial={disconnectSerial}
        onEStop={eStop}
        onReset={reset}
      />

      {/* 左右スライダー */}
      <Panel title="Left Motor (E↑ / F↓)">
        <VerticalSlider
          value={leftVis}
          onChange={(v)=>{ setLeft(v); }}
        />
      </Panel>

      <Panel title="Right Motor (I↑ / J↓)">
        <VerticalSlider
          value={rightVis}
          onChange={(v)=>{ setRight(v); }}
        />
      </Panel>

      {/* シリアルログ */}
      <div className="col-span-2">
        <Panel title="Serial Log">
          <div className="h-56 overflow-auto bg-black/40 rounded-lg p-2 font-mono text-xs leading-5">
            {serialLog.length === 0 ? (
              <div className="opacity-60">（Arduinoの Serial.println(...) がここに表示されます）</div>
            ) : (
              serialLog.map((l,i)=>(<div key={i}>{l}</div>))
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

function Header({ gpConnected, gamepadId, serialConnected, onConnectSerial, onDisconnectSerial, onEStop, onReset }) {
  const color = gpConnected ? "bg-emerald-400" : "bg-rose-400";
  const serColor = serialConnected ? "bg-emerald-400" : "bg-rose-400";
  return (
    <div className="col-span-2 flex items-center justify-between bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <div>
        <h1 className="text-xl font-bold">Dual Motor Controller (Sliders + Web Serial)</h1>
        <p className="text-xs text-gray-400">
          Up/Down: Forward/Reverse (range -1..+1). Keyboard (Left: E/F, Right: I/J). Gamepad sticks supported.
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
          <span className="hidden sm:inline">Serial:</span>
          {serialConnected ? (
            <button onClick={onDisconnectSerial} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600">Disconnect</button>
          ) : (
            <button onClick={onConnectSerial} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500">Connect</button>
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
  const pct = Math.round(clamp((value + 1) / 2, 0, 1) * 100); // 0..100%
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
          // 縦スライダー化（Edge/Chromeで実用可）
          style={{ WebkitAppearance: 'slider-vertical', writingMode: 'bt-lr', height: '260px' }}
          className="w-6 h-[260px] bg-gray-800 rounded-xl accent-cyan-400"
        />
        <div className="text-xs text-gray-400 mt-2">-100</div>
        <div className="mt-3 text-sm text-gray-300">{pct}%</div>
      </div>
    </div>
  );
}
