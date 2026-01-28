require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelsToTry = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest",
  "gemini-1.0-pro",
  "gemini-pro",
  "gemini-pro-vision"
];

async function findWorkingModel() {
  console.log("🔍 Scanning for a working Gemini Brain...");
  
  for (const modelName of modelsToTry) {
    process.stdout.write(`Testing "${modelName}"... `);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hello");
      await result.response; // Wait for response
      
      console.log("✅ SUCCESS!");
      console.log(`\n🎉 FOUND IT! Please use this name: "${modelName}"`);
      return; 
    } catch (error) {
      console.log("❌ Failed");
    }
  }
  
  console.log("\n⚠️ No models worked. Check your terminal logs for the specific error details.");
}

findWorkingModel();
