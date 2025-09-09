import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const DEADZONE = 0.12;
const POLL_HZ = 60;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dz = v => (Math.abs(v) < DEADZONE ? 0 : v);

export default function WebControllerVisualOnly() {
  const [gamepadId, setGamepadId] = useState("(none)");
  const [gpConnected, setGpConnected] = useState(false);
  const [throttle, setThrottle] = useState(0);
  const [steer, setSteer] = useState(0);
  const [brake, setBrake] = useState(0);
  const held = useRef({ w:false, s:false, a:false, d:false, space:false });

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e) => { if (e.repeat) return;
      if (e.key === 'w') held.current.w = true;
      if (e.key === 's') held.current.s = true;
      if (e.key === 'a') held.current.a = true;
      if (e.key === 'd') held.current.d = true;
      if (e.key === ' ') held.current.space = true;
    };
    const onKeyUp = (e) => {
      if (e.key === 'w') held.current.w = false;
      if (e.key === 's') held.current.s = false;
      if (e.key === 'a') held.current.a = false;
      if (e.key === 'd') held.current.d = false;
      if (e.key === ' ') held.current.space = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // Gamepad connect/disconnect
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

  // Update loop
  useEffect(() => {
    const interval = setInterval(() => {
      let t = 0, s = 0, b = 0;
      if (held.current.w) t += 1;
      if (held.current.s) t -= 1;
      if (held.current.d) s += 1;
      if (held.current.a) s -= 1;
      if (held.current.space) b = 1;

      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (gp) {
        const ax = gp.axes.map(v => +dz(v).toFixed(3));
        const buttons = gp.buttons.map(b => (typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0)));
        const t_gp = -(ax[1] || 0);
        const s_gp =   (ax[0] || 0);
        const brake_gp = clamp(buttons[6] || 0, 0, 1);
        if (Math.abs(t_gp) > 0.05 || Math.abs(s_gp) > 0.05) { t = t_gp; s = s_gp; b = brake_gp; }
      }

      const targetT = clamp(t, -1, 1);
      const targetS = clamp(s, -1, 1);
      const targetB = clamp(b, 0, 1);
      const alpha = 0.4;
      setThrottle(prev => prev + (targetT - prev) * alpha);
      setSteer(prev => prev + (targetS - prev) * alpha);
      setBrake(prev => prev + (targetB - prev) * 0.5);
    }, 1000 / POLL_HZ);
    return () => clearInterval(interval);
  }, []);

  const eStop = () => { setThrottle(0); setSteer(0); setBrake(1); setTimeout(()=>setBrake(0), 200); };
  const reset = () => { setThrottle(0); setSteer(0); setBrake(0); };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 grid grid-cols-2 gap-6">
      <Header gpConnected={gpConnected} gamepadId={gamepadId} onEStop={eStop} onReset={reset} />
      <Panel title="Steer & Throttle Lever"><Lever steer={steer} throttle={throttle} /></Panel>
      <Panel title="Pedals">
        <Pedals accel={Math.max(throttle,0)} brake={Math.max(brake, Math.max(-throttle,0))} />
        <div className="mt-6 text-sm text-gray-400 space-y-1">
          <p><strong>Keyboard</strong>: W/S = forward/back, A/D = left/right, Space = brake</p>
          <p><strong>Gamepad</strong>: Left stick (X/Y), LT = brake</p>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }) { return (<div className="col-span-1 bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-800"><h2 className="text-lg font-semibold mb-4">{title}</h2>{children}</div>); }

function Header({ gpConnected, gamepadId, onEStop, onReset }) {
  const color = gpConnected ? "bg-emerald-400" : "bg-rose-400";
  return (
    <div className="col-span-2 flex items-center justify-between bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <div><h1 className="text-xl font-bold">Web Controller (Visual Only)</h1><p className="text-xs text-gray-400">No networking. Visual response to Keyboard / Gamepad input.</p></div>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${color}`} /><span className="hidden sm:inline">Gamepad:</span><span className="truncate max-w-[220px] text-gray-300">{gamepadId}</span>
        </div>
        <button onClick={onReset} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600">Reset</button>
        <button onClick={onEStop} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500">E-Stop</button>
      </div>
    </div>
  );
}

function Lever({ steer, throttle }) {
  const size = 300, pad = 22, r = (size/2 - pad);
  const cx = r * clamp(steer, -1, 1), cy = r * clamp(-throttle, -1, 1);
  return (<svg width={size} height={size} className="bg-gray-950 rounded-xl"><g transform={`translate(${size/2}, ${size/2})`}><circle r={r} fill="#111827" stroke="#334155" strokeWidth={2} /><GridLines r={r} /><motion.circle r="14" fill="#22d3ee" animate={{ cx, cy }} transition={{ type: "spring", stiffness: 220, damping: 22 }} /></g></svg>);
}

function GridLines({ r }) {
  const ticks = 24, rings = [0.33, 0.66, 1.0], lines = [];
  for (let i=0;i<ticks;i++){const ang=(i/ticks)*Math.PI*2;lines.push(<line key={i} x1={0} y1={0} x2={Math.cos(ang)*r} y2={Math.sin(ang)*r} stroke="#1f2a3a" strokeWidth={1}/>);} 
  return <g>{lines}{rings.map((k,i)=>(<circle key={i} r={r*k} fill="none" stroke="#263244" strokeWidth={1}/>))}<line x1={-r} y1={0} x2={r} y2={0} stroke="#334155"/><line x1={0} y1={-r} x2={0} y2={r} stroke="#334155"/></g>;
}

function Pedals({ accel, brake }) { return (<div><Gauge label="Accelerator" value={accel} /><Gauge label="Brake" value={brake} /></div>); }

function Gauge({ label, value }) {
  const pct = Math.round(clamp(value,0,1)*100);
  return (<div className="mb-4"><div className="flex justify-between text-sm mb-1"><span>{label}</span><span>{pct}%</span></div><div className="h-3 bg-gray-800 rounded-full overflow-hidden"><motion.div className="h-3 bg-cyan-400" style={{width:0}} animate={{ width: `${pct}%` }} transition={{ type:'tween', duration:0.12 }}/></div></div>);
}
