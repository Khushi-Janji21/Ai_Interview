import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    console.log("Trying models/gemini-1.5-flash...");
    const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });
    const result = await model.generateContent('Hello');
    console.log('Success:', result.response.text());
  } catch (err) {
    console.error('Error:', err.status);
  }
}

test();
