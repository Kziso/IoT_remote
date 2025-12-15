import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import wsConfig from "./wsConfig.json";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const DISPLAY_RANGE = 110; // px: how far the knob can travel up/down from center
const WS_HZ = 30;
const DIFF_EPS = 0.02;
const FORCE_MS = 120;

export default function App() {
  const [left, setLeft] = useState(0);   // -1..+1
  const [right, setRight] = useState(0); // -1..+1
  const [zoom, setZoom] = useState(0.9);   // 0.8..1.3
  const [wsUrl, setWsUrl] = useState(wsConfig?.wsUrl || "ws://192.168.0.10:81/");
  const [wsState, setWsState] = useState("disconnected"); // disconnected|connecting|connected
  const wsRef = useRef(null);
  const lastSentRef = useRef({ L: 999, R: 999 });
  const lastForceAtRef = useRef(0);

  const connectWS = () => {
    try {
      setWsState("connecting");
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        wsRef.current = ws;
        setWsState("connected");
        lastSentRef.current = { L: 999, R: 999 }; // force first send
      };
      ws.onclose = () => {
        wsRef.current = null;
        setWsState("disconnected");
      };
      ws.onerror = () => {
        setWsState("disconnected");
      };
    } catch (e) {
      setWsState("disconnected");
    }
  };

  const disconnectWS = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsState("disconnected");
  };

  useEffect(() => {
    const iv = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const L = +left.toFixed(2);
      const R = +right.toFixed(2);
      const last = lastSentRef.current;
      const now = Date.now();
      const force = now - (lastForceAtRef.current || 0) > FORCE_MS;
      if (!force && Math.abs(L - last.L) < DIFF_EPS && Math.abs(R - last.R) < DIFF_EPS) return;
      lastSentRef.current = { L, R };
      if (force) lastForceAtRef.current = now;
      ws.send(JSON.stringify({ v:1, cmd:"drive", L, R }));
    }, 1000 / WS_HZ);
    return () => clearInterval(iv);
  }, [left, right]);

  useEffect(() => {
    const iv = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ v:1, cmd:"ping", t: Date.now() }));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-3 py-5 overflow-x-hidden">
      <header className="w-full max-w-4xl flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.32em] text-cyan-300 font-semibold uppercase">Touch Pad</p>
            <h1 className="text-2xl font-bold">Dual Vertical Sticks</h1>
            <p className="text-[12px] text-slate-400 mt-1">
              丸いトップを指でつまんで上下へ。離すと中央へ戻ります。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="tracking-wide text-slate-400">Zoom</span>
            <input
              type="range"
              min={80}
              max={130}
              step={1}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              className="w-28 accent-cyan-400"
            />
            <span className="w-10 text-right text-[11px] text-slate-400">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-200 bg-slate-900/70 border border-white/5 rounded-xl px-3 py-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            wsState === "connected" ? "bg-emerald-400" :
            wsState === "connecting" ? "bg-amber-400" : "bg-rose-400"
          }`} />
          <input
            className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700 rounded-lg px-2 py-1 text-[12px] text-slate-100"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://192.168.x.x:81/"
          />
          {wsState !== "connected" ? (
            <button
              onClick={connectWS}
              className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-[12px]"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={disconnectWS}
              className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-[12px]"
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      <div
        className="w-full flex justify-center"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div className="grid grid-cols-2 gap-4 w-full max-w-3xl sm:max-w-2xl">
          <KnobPanel
            label="LEFT"
            value={left}
            onChange={setLeft}
            accent="from-cyan-400/70 via-teal-500/40 to-cyan-300/20"
          />
          <KnobPanel
            label="RIGHT"
            value={right}
            onChange={setRight}
            accent="from-amber-400/70 via-orange-500/40 to-pink-400/20"
          />
        </div>
      </div>

      <footer className="mt-4 text-[11px] text-slate-500 text-center">
        スマートフォンでの2本指操作用。上下のみ有効。
      </footer>
    </div>
  );
}

function KnobPanel({ label, value, onChange, accent }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-white/5 shadow-xl backdrop-blur-sm">
      <div className={`absolute inset-0 opacity-30 bg-gradient-to-b ${accent}`} />
      <div className="relative p-4 flex flex-col items-center gap-3">
        <div className="text-[11px] tracking-[0.28em] text-slate-300">{label}</div>
        <TouchSlider value={value} onChange={onChange} />
        <div className="text-xs text-slate-300">
          出力 <span className="font-semibold text-white">{Math.round(value * 100)}</span>%
        </div>
      </div>
    </div>
  );
}

function TouchSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const activePointer = useRef(null);

  const updateFromEvent = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const half = rect.height / 2;
    const delta = clamp((centerY - e.clientY) / half, -1, 1); // up => +1, down => -1
    onChange(+delta.toFixed(2));
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateFromEvent(e);
  };

  const handlePointerMove = (e) => {
    if (activePointer.current !== e.pointerId) return;
    updateFromEvent(e);
  };

  const releasePointer = (e) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    onChange(0); // snap back to neutral when released
  };

  const knobY = -value * DISPLAY_RANGE;

  return (
    <div
      ref={trackRef}
      className="relative w-full max-w-[180px] h-[260px] rounded-[26px] bg-black/30 border border-white/10 overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-y-4 left-1/2 w-[3px] rounded-full bg-white/5" />
        <div className="absolute left-1/2 -translate-x-1/2 top-3 text-[10px] text-slate-400">+100%</div>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 text-[10px] text-slate-400">-100%</div>
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -mt-3 text-[11px] text-cyan-300">0</div>
      </div>

      <motion.div
        className="absolute left-1/4 -translate-x-1/4 top-1/4 -translate-y-1/4 rounded-full"
        style={{
          width: "104px",
          height: "104px",
          background: "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.9), rgba(59,130,246,0.65))",
          border: "2px solid rgba(255,255,255,0.25)",
          touchAction: "none",
        }}
        animate={{ y: knobY }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        <div className="w-full h-full rounded-full flex items-center justify-center text-sm font-semibold text-white">
          {Math.round(value * 100)}%
        </div>
      </motion.div>
    </div>
  );
}
