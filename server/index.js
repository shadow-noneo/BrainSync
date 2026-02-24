require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" }, 
  maxHttpBufferSize: 1e8, 
  pingInterval: 2000, 
  pingTimeout: 5000 
});

const groq = new Groq({ apiKey: "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" });
const rooms = {}; 

console.log("🚀 SERVER v28.0 - ZERO ERROR PROTOCOL ACTIVE");

// Unbreakable JSON Extractor
function repairJSON(text) {
    try { return JSON.parse(text); } 
    catch (e) {
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                let jsonPart = text.substring(start, end + 1)
                    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
                return JSON.parse(jsonPart);
            }
        } catch (e2) { return null; }
        return null;
    }
}

async function generateAIQuestion(subject, topicsArray, attempt = 1) {
  const topic = (topicsArray && topicsArray.length > 0) ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : "General";
  const marks = [5, 6, 7, 8, 10][Math.floor(Math.random() * 5)];
  
  try {
    const prompt = `Act as an Engineering Examiner. Generate ONE UNIQUE multiple-choice question (${marks} Marks).
    Subject: ${subject}. Topic: ${topic}.
    CRITICAL: 
    1. Only return a JSON object. 
    2. Write math normally or use basic symbols. IF you use LaTeX, use DOUBLE BACKSLASHES (e.g. \\\\frac{1}{2}). 
    3. The answer string must perfectly match one of the options.
    
    JSON Schema: {"question": "text", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "text", "marks": ${marks}, "topic": "${topic}"}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        // If attempt 1 fails, drop to the ultra-fast 8b model to guarantee a response
        model: attempt === 1 ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant",
        temperature: 0.7,
        response_format: { type: "json_object" } 
    });
    
    const data = repairJSON(res.choices[0].message.content);
    if (!data) throw new Error("JSON Parse Failed");

    const cleanOpts = data.options.map(o => String(o).trim());
    const cleanAns = String(data.answer).trim();
    let correctIndex = cleanOpts.indexOf(cleanAns);
    
    if (correctIndex === -1) { 
        correctIndex = 0; 
        data.options[0] = data.answer; 
    }

    data.correctIndex = correctIndex; 
    data.topic = topic;
    return data;

  } catch (e) { 
    // AUTO-RETRY LOOP: If it fails, silently try again instantly.
    if (attempt < 2) {
        console.log(`⚠️ Attempt 1 failed. Auto-retrying...`);
        return await generateAIQuestion(subject, topicsArray, 2);
    }
    // Absolute failsafe (You will almost never see this now)
    return { 
        question: "Could not generate a complex question. Please proceed to the next.", 
        options: ["Next", "Next", "Next", "Next"], 
        answer: "Next", 
        explanation: "Network hiccup.", 
        correctIndex: 0, marks: 0, topic: "Recovery Mode" 
    }; 
  }
}

async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain simply in 2 sentences.` }], 
        model: "llama-3.1-8b-instant" 
    });
    return res.choices[0].message.content;
  } catch (e) { return "AI unavailable."; }
}

io.on('connection', (socket) => {
  socket.on('rejoin_room', ({ roomCode, username }) => {
    if (rooms[roomCode]) {
      socket.join(roomCode);
      socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
      if (rooms[roomCode].currentQuestion) socket.emit('new_question', rooms[roomCode].currentQuestion);
      socket.emit('update_scores', rooms[roomCode].scores);
    } else { socket.emit('error_message', "Room expired."); }
  });

  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], hostId: socket.id, hostUsername: username, currentQuestion: null, scores: {}, history: [], historyIndex: -1, questionLimit: -1, questionCount: 0, canMoveOn: false, selectedTopics: ["General"] };
    rooms[roomCode].users.push({ id: socket.id, username });
    if (!rooms[roomCode].scores[username]) rooms[roomCode].scores[username] = 0;
    if (rooms[roomCode].hostUsername === username) rooms[roomCode].hostId = socket.id;
    socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
    io.to(roomCode).emit('update_scores', rooms[roomCode].scores);
  });

  socket.on('send_message', (data) => socket.to(data.roomCode).volatile.emit('receive_message', { ...data, time: new Date().toLocaleTimeString() }));
  socket.on('send_audio_chunk', (data) => socket.to(data.roomCode).emit('receive_audio_chunk', data));

  socket.on('start_quiz', async ({ roomCode, subject, topics, limit, forceNew }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (forceNew) {
        room.questionCount = 0; room.history = []; room.historyIndex = -1;
        room.currentQuestion = null; room.canMoveOn = false; room.subject = subject; 
        if (limit !== undefined) room.questionLimit = parseInt(limit);
        if (topics) room.selectedTopics = topics;
    }
    
    if (!forceNew && room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores, history: room.history });
      return;
    }

    const qData = await generateAIQuestion(room.subject || subject, room.selectedTopics);
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    room.timeLeft = 420; room.timerRunning = true; room.canMoveOn = false;

    io.to(roomCode).emit('new_question', qData);
    if (room.hostId) io.to(room.hostId).emit('lock_host');

    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      if (room.timerRunning) {
        room.timeLeft--;
        io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) clearInterval(room.interval);
      }
    }, 1000);
  });

  socket.on('nav_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex < room.history.length - 1) {
        room.historyIndex++;
        io.to(roomCode).emit('new_question', room.history[room.historyIndex]);
        io.to(roomCode).emit('round_result', { correctIndex: room.history[room.historyIndex].correctIndex, correctAnswer: room.history[room.historyIndex].answer, explanation: room.history[room.historyIndex].explanation, isReview: true });
    }
  });
  
  socket.on('nav_prev', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex > 0) {
        room.historyIndex--;
        io.to(roomCode).emit('new_question', room.history[room.historyIndex]);
        io.to(roomCode).emit('round_result', { correctIndex: room.history[room.historyIndex].correctIndex, correctAnswer: room.history[room.historyIndex].answer, explanation: room.history[room.historyIndex].explanation, isReview: true });
    }
  });

  socket.on('submit_answer', ({ roomCode, answerIndex, username }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) return;
    const isCorrect = (answerIndex === room.currentQuestion.correctIndex);
    if (isCorrect) {
       room.scores[username] = (room.scores[username] || 0) + (room.currentQuestion.marks || 5);
       io.to(roomCode).emit('update_scores', room.scores);
    }
    if (!room.canMoveOn) {
        room.canMoveOn = true;
        if(room.hostId) io.to(room.hostId).emit('unlock_host');
    }
    socket.emit('round_result', { correctIndex: room.currentQuestion.correctIndex, correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
  });

  socket.on('host_action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (room) {
        if (action === 'add') room.timeLeft += 60;
        if (action === 'pause') room.timerRunning = !room.timerRunning;
        io.to(roomCode).emit('timer_update', room.timeLeft);
    }
  });

  socket.on('student_signal', ({ roomCode, type, username }) => {
    const room = rooms[roomCode];
    if (room && room.hostId) {
        io.to(room.hostId).emit('host_notification', { type, username });
        if (type === 'stuck') { room.canMoveOn = true; io.to(room.hostId).emit('unlock_host'); }
    }
  });

  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (room) socket.emit('ai_voice_reply', { text: await solveDoubt(room.currentQuestion.question, userQuery) });
  });
});

server.listen(3001, () => console.log('SERVER ON 3001'));