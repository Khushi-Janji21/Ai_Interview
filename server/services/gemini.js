import OpenAI from 'openai';

let openai;

export function initGemini() {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('✅ OpenAI initialized (replacing Gemini)');
}

function buildInterviewerSystemPrompt(sessionConfig) {
  const { interview_type, job_role, difficulty } = sessionConfig;

  return `You are a senior, experienced interviewer conducting a ${interview_type} interview for a ${job_role} position at ${difficulty} difficulty level.

RULES YOU MUST FOLLOW:
1. You are conducting a realistic mock interview. Act as a professional interviewer.
2. Ask exactly ONE question at a time. Wait for the candidate's response before asking the next.
3. Your questions should be appropriate for the ${difficulty} level:
   - Beginner: Fundamental concepts, basic scenarios, entry-level expectations
   - Intermediate: Applied knowledge, problem-solving, real-world scenarios
   - Advanced: System design, complex scenarios, leadership, deep technical expertise
4. For ${interview_type} interviews, focus on:
   - Technical: Coding concepts, system design, algorithms, domain-specific knowledge
   - HR: Culture fit, salary expectations, career goals, conflict resolution
   - Behavioral: STAR method scenarios, leadership, teamwork, challenges
   - Mixed: A blend of technical, behavioral, and HR questions
5. Make your questions specific to the ${job_role} role.
6. Follow up naturally based on the candidate's previous answers — reference what they said.
7. Be conversational, warm but professional. Use the candidate's points to dig deeper.
8. NEVER reveal evaluation criteria or scoring.
9. NEVER break character — you are the interviewer at all times.
10. Keep your questions concise but thoughtful.

Start by briefly introducing yourself and the interview, then ask your first question.`;
}

export async function generateFirstQuestion(sessionConfig) {
  const systemPrompt = buildInterviewerSystemPrompt(sessionConfig);

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Please begin the interview now. Introduce yourself briefly and ask the first question.' }
        ],
        temperature: 0.8,
        max_tokens: 500,
      });
      return response.choices[0].message.content;
    } catch (err) {
      if (retries > 1) {
        retries--;
        console.log(`⚠️ OpenAI error, retrying... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw err;
    }
  }
}

export async function generateNextQuestion(sessionConfig, conversationHistory, questionNumber) {
  const systemPrompt = buildInterviewerSystemPrompt(sessionConfig);

  // Build the conversation history for OpenAI
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add all previous messages
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'interviewer' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  let prompt;
  if (questionNumber >= 8) {
    prompt = 'The candidate just gave their final answer. Briefly acknowledge their response and thank them for their time. Let them know the interview is now complete and they will receive their evaluation shortly. Keep it professional and warm.';
  } else {
    prompt = `The candidate has answered. Briefly acknowledge their response (1-2 sentences), then ask the next interview question (this will be question ${questionNumber + 1} of 8). Remember to stay in character as the interviewer and make the question relevant to the ${sessionConfig.job_role} role.`;
  }

  messages.push({ role: 'user', content: prompt });

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.8,
        max_tokens: 500,
      });
      return response.choices[0].message.content;
    } catch (err) {
      if (retries > 1) {
        retries--;
        console.log(`⚠️ OpenAI error, retrying... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw err;
    }
  }
}

export async function evaluateInterview(sessionConfig, conversationHistory) {
  const { interview_type, job_role, difficulty } = sessionConfig;

  // Build transcript
  let transcript = '';
  for (const msg of conversationHistory) {
    const role = msg.role === 'interviewer' ? 'Interviewer' : 'Candidate';
    transcript += `${role}: ${msg.content}\n\n`;
  }

  const evaluationPrompt = `You are an expert interview evaluator. Analyze the following ${interview_type} interview transcript for a ${job_role} position at ${difficulty} difficulty level.

TRANSCRIPT:
${transcript}

Evaluate the candidate's performance and provide a detailed assessment. You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) in this exact format:

{
  "overall_score": <number 0-100>,
  "communication_score": <number 0-100>,
  "technical_score": <number 0-100>,
  "confidence_score": <number 0-100>,
  "relevance_score": <number 0-100>,
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1>", "<specific weakness 2>", "<specific weakness 3>"],
  "tips": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>", "<actionable tip 4>"],
  "summary": "<A detailed 3-4 sentence paragraph summarizing the candidate's overall performance, highlighting key moments from the interview, and providing an overall assessment>"
}

SCORING GUIDELINES:
- communication_score: Clarity, articulation, structure of answers, professional language
- technical_score: Depth of knowledge, accuracy, problem-solving approach
- confidence_score: Assertiveness, composure, handling of difficult questions
- relevance_score: How well answers relate to the question and role
- overall_score: Weighted average considering all factors

Be specific in strengths, weaknesses, and tips — reference actual answers from the transcript.
Do NOT use generic feedback. Every point should be tied to something the candidate said or did.`;

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional interview evaluator. Respond ONLY with JSON.' },
          { role: 'user', content: evaluationPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0].message.content;
      return JSON.parse(responseText);
    } catch (err) {
      if (retries > 1) {
        retries--;
        console.log(`⚠️ OpenAI evaluation error, retrying... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      console.error('Failed to parse AI evaluation:', err);
      // Return default scores if parsing fails
      return {
        overall_score: 50,
        communication_score: 50,
        technical_score: 50,
        confidence_score: 50,
        relevance_score: 50,
        strengths: ['Completed the interview', 'Showed willingness to participate', 'Attempted all questions'],
        weaknesses: ['Could not fully evaluate due to processing error', 'Responses need more depth', 'Consider providing more specific examples'],
        tips: ['Practice structuring your answers', 'Use the STAR method for behavioral questions', 'Research the company beforehand', 'Prepare specific examples from past experience'],
        summary: 'The interview was completed. Due to evaluation processing, a detailed assessment could not be generated. We recommend reviewing your answers and practicing with more specific, structured responses.'
      };
    }
  }
}
