import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io.connect(import.meta.env.VITE_BACKEND_URL || "http://localhost:3001");

// --- 🔊 SOUND ENGINE ---
const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'tick') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  } else if (type === 'correct') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(523, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1046, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } else if (type === 'wrong') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } else if (type === 'fanfare') {
    [440, 554, 659, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; g.gain.setValueAtTime(0, ctx.currentTime + i*0.1);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i*0.1 + 0.05);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + i*0.1 + 0.2);
      o.start(ctx.currentTime + i*0.1); o.stop(ctx.currentTime + i*0.1 + 0.2);
    });
  }
};

function App() {
  const [view, setView] = useState("join");
  const [roomData, setRoomData] = useState({ users: [], scores: {}, isHost: false, roomCode: "", leader: "" });
  const [game, setGame] = useState({ q: null, answered: false, result: null, timer: 20 });
  const [ready, setReady] = useState({ count: 0, total: 0, me: false });
  const [settings, setSettings] = useState({ sub: "Science", diff: "Medium", name: "", code: "" });

  useEffect(() => {
    socket.on("update_room", (d) => { setRoomData(p => ({ ...p, ...d, isHost: socket.id === d.hostId })); setView("lobby"); });
    socket.on("new_question", (d) => { setGame({ q: d, answered: false, result: null, timer: 20 }); setReady(r => ({ ...r, me: false })); setView("game"); });
    
    socket.on("timer_update", (t) => {
      setGame(g => ({ ...g, timer: t }));
      if (t <= 5 && t > 0) playSound('tick'); // 🕒 Tick-Tock
    });

    socket.on("answer_received", () => { /* User visual feedback */ });
    
    socket.on("round_result", (d) => { 
      setGame(g => ({ ...g, result: d })); 
      setRoomData(p => ({ ...p, scores: d.scores, leader: d.leader })); 
      setView("result");
      
      // 🎉 Play Correct/Wrong/Fanfare
      if (d.showSummary) playSound('fanfare');
      else {
        const myResult = d.results.find(r => r.id === socket.id);
        if (myResult?.isCorrect) playSound('correct');
        else if (myResult) playSound('wrong');
      }
    });

    socket.on("ready_update", (d) => setReady(r => ({ ...r, count: d.readyCount, total: d.totalGuests })));
    return () => socket.removeAllListeners();
  }, []);

  const sortedScores = Object.entries(roomData.scores).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif', maxWidth: '600px', margin: 'auto' }}>
      <h1 style={{fontSize: '2.5rem', marginBottom: '0'}}>🧠 BrainSync</h1>
      
      {view === "join" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '40px' }}>
          <input placeholder="Enter Username" onChange={e => setSettings({...settings, name: e.target.value})} style={{padding:'15px', borderRadius: '8px', border: '1px solid #ccc'}}/>
          <input placeholder="Room Code" onChange={e => setSettings({...settings, code: e.target.value})} style={{padding:'15px', borderRadius: '8px', border: '1px solid #ccc'}}/>
          <button onClick={() => { setRoomData(p => ({...p, roomCode: settings.code})); socket.emit("join_room", { roomCode: settings.code, username: settings.name }); }} style={{padding:'15px', background:'#007bff', color:'white', border: 'none', borderRadius: '8px', fontWeight: 'bold'}}>Enter Room</button>
        </div>
      )}

      {view === "lobby" && (
        <div>
          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '15px', margin: '20px 0' }}>
            <h3>👥 Scoreboard</h3>
            {sortedScores.map(([n, s]) => <div key={n} style={{ fontSize: '1.2rem' }}>{roomData.leader === n ? '🏆 ' : ''}{n}: <strong>{s} pts</strong></div>)}
          </div>
          {roomData.isHost ? (
            <button onClick={() => socket.emit("start_quiz", { roomCode: roomData.roomCode, subject: settings.sub, difficulty: settings.diff })} style={{padding:'15px', background:'#28a745', color:'white', width: '100%', border: 'none', borderRadius: '8px'}}>Start Match</button>
          ) : <p>Waiting for host...</p>}
        </div>
      )}

      {view === "game" && (
        <div>
          <div style={{ width: '100%', background: '#eee', height: '12px', borderRadius: '6px', marginBottom: '30px' }}>
            <div style={{ width: `${(game.timer / 20) * 100}%`, background: game.timer < 6 ? '#dc3545' : '#007bff', height: '100%', transition: 'width 1s linear', borderRadius: '6px' }} />
          </div>
          <h2 style={{minHeight: '100px'}}>{game.q?.question}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {!game.answered ? game.q?.options.map(opt => (
              <button key={opt} onClick={() => socket.emit("submit_answer", { roomCode: roomData.roomCode, answer: opt })} style={{ padding: '25px', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}>{opt}</button>
            )) : <p>Locked in! ⏳</p>}
          </div>
        </div>
      )}

      {view === "result" && (
        <div>
          {game.result?.showSummary && (
             <div style={{ background: '#fff3cd', padding: '20px', borderRadius: '15px', border: '2px solid #ffeeba', marginBottom: '20px' }}>
                <h2>🏆 CHAMPION: {roomData.leader} 🏆</h2>
             </div>
          )}
          <div style={{ background: '#d4edda', padding: '20px', borderRadius: '15px' }}>
            <h3>Answer: {game.result?.correctAnswer}</h3>
            <p>{game.result?.explanation}</p>
          </div>
          <div style={{ margin: '20px 0' }}>
            {game.result?.results.map(r => <div key={r.username}>{r.isCorrect ? '✅' : '❌'} {r.username}</div>)}
          </div>
          {!roomData.isHost && !ready.me && <button onClick={() => { setReady({...ready, me: true}); socket.emit("player_ready", { roomCode: roomData.roomCode }); }} style={{padding:'15px 30px', background:'#007bff', color:'white', border:'none', borderRadius:'8px'}}>Ready!</button>}
          {roomData.isHost && <button onClick={() => socket.emit("start_quiz", { roomCode: roomData.roomCode, subject: settings.sub, difficulty: settings.diff })} disabled={ready.count < ready.total} style={{padding:'15px 30px', background: ready.count < ready.total ? '#ccc' : '#343a40', color:'white', border:'none', borderRadius:'8px'}}>Next Round ({ready.count}/{ready.total})</button>}
        </div>
      )}
    </div>
  );
}

export default App;
