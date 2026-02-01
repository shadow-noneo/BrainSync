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

async function generateAIQuestion(subject, topic, marks, excludeList = []) {
  const actualTopic = topic || "General Concepts";
  console.log(`⚡ Generating Question: ${actualTopic}`);
  
  const prompt = `Act as an Engineering Math Professor.
  Generate 1 MCQ worth ${marks} marks.
  Subject: ${subject}, Topic: ${actualTopic}
  
  STRICT JSON FORMAT:
  {
    "question": "Question text with $math$",
    "options": ["$Opt A$", "$Opt B$", "$Opt C$", "$Opt D$"],
    "answer": "Exact correct option text",
    "explanation": "Brief solution."
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
    return { question: "Error", options: [], answer: "", explanation: "" };
  }
}

// 🟢 NEW: AI DOUBT SOLVER
async function solveDoubt(question, doubt) {
  const prompt = `
  Context Question: ${question}
  Student Doubt: "${doubt}"
  
  Act as a friendly tutor. Explain the answer clearly in 2-3 sentences. 
  Do NOT use complex LaTeX here, use simple text readable by text-to-speech.
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });
    return completion.choices[0].message.content;
  } catch (e) {
    return "I couldn't hear you clearly, please try again.";
  }
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], scores: {}, roundCount: 0, usedQuestions: [] };
    rooms[roomCode].users.push({ id: socket.id, username });
    rooms[roomCode].scores[username] = 0;
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty, marks }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const qData = await generateAIQuestion(subject, difficulty, marks, room.usedQuestions);
    room.currentQuestion = qData;
    room.usedQuestions.push(qData.question);
    io.to(roomCode).emit('new_question', { question: qData.question, options: qData.options });
  });

  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    const isCorrect = room.currentQuestion.answer === answer;
    io.to(roomCode).emit('round_result', { 
      correctAnswer: room.currentQuestion.answer, 
      explanation: room.currentQuestion.explanation,
      isCorrect 
    });
  });

  // 🟢 NEW: LISTEN FOR VOICE DOUBTS
  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) return;
    
    // Ask AI to explain
    const answer = await solveDoubt(room.currentQuestion.question, userQuery);
    
    // Send audio text back to user
    socket.emit('ai_voice_reply', { text: answer });
  });
});

server.listen(3001, () => console.log('SERVER RUNNING ON 3001'));