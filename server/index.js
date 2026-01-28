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

// ⚡ HIGH-SPEED GROQ CONFIGURATION
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const rooms = {}; 

async function generateAIQuestion(subject, difficulty) {
  console.log(`⚡ Groq (Llama 3 70B) is generating: ${difficulty} ${subject}...`);
  
  const prompt = `Generate 1 high-quality multiple-choice question for ${subject}, difficulty ${difficulty}. 
  Return ONLY valid JSON with this exact structure (no markdown, no preamble):
  {
    "question": "Question text?",
    "options": ["A", "B", "C", "D"],
    "answer": "Exact correct option text",
    "explanation": "Why it's correct"
  }`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error("❌ Groq Error:", error.message);
    return { 
      question: `Fallback: What is the powerhouse of the cell?`, 
      options: ["Mitochondria", "Nucleus", "Ribosome", "Plasma"], 
      answer: "Mitochondria", 
      explanation: "Groq is currently offline." 
    };
  }
}

function endRound(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.timerEnded) return;
  room.timerEnded = true;
  clearInterval(room.interval);
  room.roundCount++;

  const leader = Object.entries(room.scores).reduce((a, b) => a[1] > b[1] ? a : b)[0] || "No one";

  io.to(roomCode).emit('round_result', { 
    results: room.results, 
    correctAnswer: room.currentQuestion.answer, 
    explanation: room.currentQuestion.explanation,
    scores: room.scores,
    leader: leader,
    showSummary: room.roundCount % 5 === 0
  });
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], hostId: socket.id, scores: {}, roundCount: 0 };
    rooms[roomCode].users.push({ id: socket.id, username });
    rooms[roomCode].scores[username] = 0;
    io.to(roomCode).emit('update_room', { users: rooms[roomCode].users, hostId: rooms[roomCode].hostId, scores: rooms[roomCode].scores });
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty }) => {
    const room = rooms[roomCode];
    const questionData = await generateAIQuestion(subject, difficulty);
    room.currentQuestion = questionData;
    room.results = [];
    room.ready = new Set();
    room.timerEnded = false;
    room.timeLeft = 20;

    io.to(roomCode).emit('new_question', { question: questionData.question, options: questionData.options });

    room.interval = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timer_update', room.timeLeft);
      if (room.timeLeft <= 0) endRound(roomCode);
    }, 1000);
  });

  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || room.timerEnded || room.results.find(r => r.id === socket.id)) return;
    const isCorrect = room.currentQuestion.answer === answer;
    const user = room.users.find(u => u.id === socket.id);
    if (isCorrect) room.scores[user.username] += 10;
    room.results.push({ id: socket.id, username: user.username, isCorrect });
    socket.emit('answer_received');
    if (room.results.length >= room.users.length) endRound(roomCode);
  });

  socket.on('player_ready', ({ roomCode }) => {
    const room = rooms[roomCode];
    room.ready.add(socket.id);
    io.to(roomCode).emit('ready_update', { readyCount: room.ready.size, totalGuests: room.users.length - 1 });
  });
});

server.listen(3001, () => console.log('SERVER RUNNING ON PORT 3001'));
