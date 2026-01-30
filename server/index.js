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

  // 🔴 STRICT DOUBLE BACKSLASH INSTRUCTION
  const prompt = `Act as a strict Engineering Mathematics Professor.
  Generate 1 challenging Multiple Choice Question (MCQ) worth ${marks} marks.
  Subject: ${subject}
  Topic: ${actualTopic}
  
  CRITICAL LATEX INSTRUCTION:
  - You MUST use DOUBLE BACKSLASHES for all LaTeX commands.
  - Correct: \\\\int, \\\\frac, \\\\infty, \\\\sqrt, \\\\cdot
  - Incorrect: \\int, \\frac 
  
  Context: This should be a "Previous Year Question" (PYQ) style problem.
  ${avoidText}

  Return ONLY valid JSON with this exact structure:
  {
    "question": "The question text (use \\\\frac etc)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Exact correct option text (must match one option exactly)",
    "explanation": "Step-by-step solution."
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
      question: `Server Error. Try again.`, 
      options: ["A", "B", "C", "D"], 
      answer: "A", 
      explanation: "Error." 
    };
  }
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], hostId: socket.id, scores: {}, roundCount: 0, usedQuestions: [] };
    
    // Remove old instance of this user if exists to prevent duplicates
    rooms[roomCode].users = rooms[roomCode].users.filter(u => u.username !== username);
    
    rooms[roomCode].users.push({ id: socket.id, username });
    rooms[roomCode].scores[username] = 0;
    
    io.to(roomCode).emit('update_room', { users: rooms[roomCode].users, scores: rooms[roomCode].scores });
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty, marks }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const topic = difficulty; 
    const questionData = await generateAIQuestion(subject, topic, marks, room.usedQuestions);
    room.usedQuestions.push(questionData.question); 
    room.currentQuestion = questionData;
    
    // Reset round state
    room.results = []; 
    room.timerEnded = false;
    room.timeLeft = 60; 

    io.to(roomCode).emit('new_question', { question: questionData.question, options: questionData.options });

    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timer_update', room.timeLeft);
      if (room.timeLeft <= 0) {
        clearInterval(room.interval);
        // If time runs out, show answer to everyone
        io.to(roomCode).emit('round_result', { 
           correctAnswer: room.currentQuestion.answer, 
           explanation: room.currentQuestion.explanation 
        });
      }
    }, 1000);
  });

  // 🚀 INSTANT FEEDBACK UPDATE
  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const isCorrect = room.currentQuestion.answer === answer;
    
    // Send result ONLY to the user who clicked (Don't wait for others)
    socket.emit('round_result', { 
      correctAnswer: room.currentQuestion.answer, 
      explanation: room.currentQuestion.explanation,
      isCorrect: isCorrect
    });
  });
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log("User disconnected:", socket.id);
    // Optional: Clean up empty rooms or users here
  });
});

server.listen(3001, () => console.log('SERVER RUNNING ON PORT 3001'));