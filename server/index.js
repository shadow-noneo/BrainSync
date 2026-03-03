require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors({ origin: "*" }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 5 * 1024 * 1024,
  pingInterval: 2000,
  pingTimeout: 5000
});

const QUIZ_TIMER_SECONDS = 420;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); // ✅ Safe
const rooms = {};

console.log("🚀 SERVER v41.0 - SECURED");