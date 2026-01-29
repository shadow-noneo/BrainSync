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

// ⚡ YOUR API KEY
const groq = new Groq({ apiKey: "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" });

const rooms = {}; 

async function generateAIQuestion(subject, topic, marks, excludeList = []) {
  const actualTopic = topic || "General Concepts";
  
  console.log(`⚡ Generating [${marks} Marks] question for: ${actualTopic}`);
  
  const avoidText = excludeList.length > 0 ? `DO NOT use these previous questions: ${JSON.stringify(excludeList.slice(-5))}` : "";

  const prompt = `Act as a strict Engineering Mathematics Professor.
  Generate 1 challenging Multiple Choice Question (MCQ) worth ${marks} marks.
  Subject: ${subject}
  Topic: ${actualTopic}
  
  Context: This should be a "Previous Year Question" (PYQ) style problem.
  ${avoidText}

  Return ONLY valid JSON with this exact structure:
  {
    "question": "The question text (include equations if needed)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Exact correct option text",
    "explanation": "Step-by-step solution explaining why the answer is correct.",
    "marks": ${marks}
  }`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.6, 
      response_format: { type: "json_object" }
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error("❌ Groq Error:", error.message);
    return { 
      question: `Server Error. Try again.`, 
      options: ["A", "B", "C", "D"], 
      answer: "A", 
      explanation: "Error.",
      marks: 0
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
    isGameOver: room.roundCount >= 15 
  });
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], hostId: socket.id, scores: {}, roundCount: 0, usedQuestions: [] };
    rooms[roomCode].users.push({ id: socket.id, username });
    rooms[roomCode].scores[username] = 0;
    io.to(roomCode).emit('update_room', { users: rooms[roomCode].users, hostId: rooms[roomCode].hostId, scores: rooms[roomCode].scores });
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty, marks }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    // We treat 'difficulty' as the specific SYLLABUS TOPIC now
    const topic = difficulty; 

    const questionData = await generateAIQuestion(subject, topic, marks, room.usedQuestions);
    questionData.marks = marks; // Ensure marks are passed through
    
    room.usedQuestions.push(questionData.question); 
    room.currentQuestion = questionData;
    room.results = [];
    room.ready = new Set();
    room.timerEnded = false;
    room.timeLeft = 60; // 60 Seconds for Math problems!

    io.to(roomCode).emit('new_question', questionData);

    if (room.interval) clearInterval(room.interval);
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
    if (isCorrect) room.scores[user.username] += room.currentQuestion.marks; // Add based on marks!
    room.results.push({ id: socket.id, username: user.username, isCorrect });
    socket.emit('answer_received');
    if (room.results.length >= room.users.length) endRound(roomCode);
  });
});

server.listen(3001, () => console.log('SERVER RUNNING ON PORT 3001'));