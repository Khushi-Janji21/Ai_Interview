import express from 'express';
import { dbGet, dbAll, dbRun } from '../db/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { generateFirstQuestion, generateNextQuestion, evaluateInterview } from '../services/gemini.js';

const router = express.Router();

// POST /api/interview/start
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { interview_type, job_role, difficulty } = req.body;

    if (!interview_type || !job_role || !difficulty) {
      return res.status(400).json({ error: 'Interview type, job role, and difficulty are required' });
    }

    const validTypes = ['Technical', 'HR', 'Behavioral', 'Mixed'];
    const validDifficulties = ['Beginner', 'Intermediate', 'Advanced'];

    if (!validTypes.includes(interview_type)) {
      return res.status(400).json({ error: 'Invalid interview type' });
    }
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    // Create session
    const result = dbRun(
      'INSERT INTO sessions (user_id, interview_type, job_role, difficulty, current_question) VALUES (?, ?, ?, ?, 1)',
      [req.user.id, interview_type, job_role, difficulty]
    );

    const sessionId = result.lastInsertRowid;
    const sessionConfig = { interview_type, job_role, difficulty };

    // Generate first question from AI
    const firstQuestion = await generateFirstQuestion(sessionConfig);

    // Save the AI's first message
    dbRun(
      'INSERT INTO messages (session_id, role, content, question_number) VALUES (?, ?, ?, ?)',
      [sessionId, 'interviewer', firstQuestion, 1]
    );

    res.status(201).json({
      session_id: sessionId,
      message: {
        role: 'interviewer',
        content: firstQuestion,
        question_number: 1
      },
      current_question: 1,
      total_questions: 8
    });
  } catch (err) {
    console.error('Interview start error:', err);
    res.status(500).json({ error: 'Failed to start interview. Please try again.' });
  }
});

// POST /api/interview/:id/message
router.post('/:id/message', authenticateToken, async (req, res) => {
  try {
    const { answer } = req.body;
    const sessionId = req.params.id;

    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    // Verify session belongs to user and is in progress
    const session = dbGet(
      'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'This session has already been completed' });
    }

    const currentQ = session.current_question;

    // Save candidate's answer
    dbRun(
      'INSERT INTO messages (session_id, role, content, question_number) VALUES (?, ?, ?, ?)',
      [sessionId, 'candidate', answer.trim(), currentQ]
    );

    // Get conversation history
    const conversationHistory = dbAll(
      'SELECT role, content, question_number FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    const sessionConfig = {
      interview_type: session.interview_type,
      job_role: session.job_role,
      difficulty: session.difficulty
    };

    // Check if this was the last question
    if (currentQ >= 8) {
      // Generate closing message
      const closingMessage = await generateNextQuestion(sessionConfig, conversationHistory, currentQ);
      
      dbRun(
        'INSERT INTO messages (session_id, role, content, question_number) VALUES (?, ?, ?, ?)',
        [sessionId, 'interviewer', closingMessage, currentQ]
      );

      // Mark session ready for evaluation
      dbRun(
        'UPDATE sessions SET current_question = ? WHERE id = ?',
        [currentQ + 1, sessionId]
      );

      return res.json({
        message: {
          role: 'interviewer',
          content: closingMessage,
          question_number: currentQ
        },
        current_question: currentQ + 1,
        total_questions: 8,
        interview_complete: true
      });
    }

    // Generate next question
    const nextQuestion = await generateNextQuestion(sessionConfig, conversationHistory, currentQ);

    // Save AI's next question
    dbRun(
      'INSERT INTO messages (session_id, role, content, question_number) VALUES (?, ?, ?, ?)',
      [sessionId, 'interviewer', nextQuestion, currentQ + 1]
    );

    // Update current question counter
    dbRun(
      'UPDATE sessions SET current_question = ? WHERE id = ?',
      [currentQ + 1, sessionId]
    );

    res.json({
      message: {
        role: 'interviewer',
        content: nextQuestion,
        question_number: currentQ + 1
      },
      current_question: currentQ + 1,
      total_questions: 8,
      interview_complete: false
    });
  } catch (err) {
    console.error('Interview message error:', err);
    res.status(500).json({ error: 'Failed to process your answer. Please try again.' });
  }
});

// POST /api/interview/:id/end
router.post('/:id/end', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = dbGet(
      'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session already evaluated' });
    }

    // Get full transcript
    const messages = dbAll(
      'SELECT role, content, question_number FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    const sessionConfig = {
      interview_type: session.interview_type,
      job_role: session.job_role,
      difficulty: session.difficulty
    };

    // Get AI evaluation
    const evaluation = await evaluateInterview(sessionConfig, messages);

    // Update session with evaluation
    dbRun(
      `UPDATE sessions SET 
        status = 'completed',
        overall_score = ?,
        communication_score = ?,
        technical_score = ?,
        confidence_score = ?,
        relevance_score = ?,
        strengths = ?,
        weaknesses = ?,
        tips = ?,
        summary = ?,
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        evaluation.overall_score,
        evaluation.communication_score,
        evaluation.technical_score,
        evaluation.confidence_score,
        evaluation.relevance_score,
        JSON.stringify(evaluation.strengths),
        JSON.stringify(evaluation.weaknesses),
        JSON.stringify(evaluation.tips),
        evaluation.summary,
        sessionId
      ]
    );

    res.json({
      message: 'Interview evaluated successfully',
      evaluation: {
        overall_score: evaluation.overall_score,
        communication_score: evaluation.communication_score,
        technical_score: evaluation.technical_score,
        confidence_score: evaluation.confidence_score,
        relevance_score: evaluation.relevance_score,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        tips: evaluation.tips,
        summary: evaluation.summary
      }
    });
  } catch (err) {
    console.error('Interview end error:', err);
    res.status(500).json({ error: 'Failed to evaluate interview. Please try again.' });
  }
});

export default router;
