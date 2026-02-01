require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const groq = new Groq({ apiKey: "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" });

const rooms = {}; 

async function generateAIQuestion(subject, topic, marks) {
  const prompt = `Act as an Engineering Math Professor. Generate 1 MCQ (${marks} marks). Subject: ${subject}, Topic: ${topic}. 
  STRICT JSON: {"question": "Text with $math$", "options": ["$A$", "$B$", "$C$", "$D$"], "answer": "Exact option text", "explanation": "Brief solution."}`;
  try {
    const res = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", response_format: { type: "json_object" } });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) { return { question: "Error", options: [], answer: "", explanation: "" }; }
}

async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain simply in 2 sentences.` }], model: "llama-3.3-70b-versatile" });
    return res.choices[0].message.content;
  } catch (e) { return "I couldn't hear that clearly."; }
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      // 👑 FIRST USER IS HOST
      rooms[roomCode] = { users: [], hostId: socket.id, currentQuestion: null, timeLeft: 0, timerRunning: false };
    }
    rooms[roomCode].users.push({ id: socket.id, username });
    
    // Tell user their role
    const isHost = rooms[roomCode].hostId === socket.id;
    socket.emit('set_role', { role: isHost ? 'host' : 'member' });
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty, marks }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    const qData = await generateAIQuestion(subject, difficulty, marks);
    room.currentQuestion = qData;
    room.timeLeft = 420; 
    room.timerRunning = true;

    io.to(roomCode).emit('new_question', { question: qData.question, options: qData.options });

    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      if (room.timerRunning) {
        room.timeLeft--;
        io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) clearInterval(room.interval);
      }
    }, 1000);
  });

  // 👑 HOST ONLY: MODIFY TIME
  socket.on('host_action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (action === 'add_time') room.timeLeft += 60;
    if (action === 'reduce_time') room.timeLeft = Math.max(0, room.timeLeft - 30);
    if (action === 'pause_timer') room.timerRunning = !room.timerRunning;
    
    io.to(roomCode).emit('timer_update', room.timeLeft); // Sync immediately
  });

  // 🎓 MEMBER ACTION: RAISE HAND / REQUEST
  socket.on('student_signal', ({ roomCode, type, username }) => {
    const room = rooms[roomCode];
    if (room && room.hostId) {
      // Notify ONLY the host
      io.to(room.hostId).emit('host_notification', { type, username });
    }
  });

  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    const isCorrect = room.currentQuestion.answer === answer;
    socket.emit('round_result', { correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
  });

  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const ans = await solveDoubt(room.currentQuestion.question, userQuery);
    socket.emit('ai_voice_reply', { text: ans });
  });
});

server.listen(3001, () => console.log('SERVER ON 3001'));