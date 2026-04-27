import express from 'express';
import { dbGet, dbAll, dbRun } from '../db/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// PUT /api/user/profile
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { name, target_role, skills, experience_years } = req.body;

    const current = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    dbRun(
      'UPDATE users SET name = ?, target_role = ?, skills = ?, experience_years = ? WHERE id = ?',
      [
        name ?? current.name,
        target_role ?? current.target_role,
        skills ?? current.skills,
        experience_years ?? current.experience_years,
        req.user.id
      ]
    );

    const user = dbGet(
      'SELECT id, name, email, role, target_role, skills, experience_years FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ message: 'Profile updated', user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user/sessions
router.get('/sessions', authenticateToken, (req, res) => {
  try {
    const sessions = dbAll(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    const parsed = sessions.map(s => ({
      ...s,
      strengths: JSON.parse(s.strengths || '[]'),
      weaknesses: JSON.parse(s.weaknesses || '[]'),
      tips: JSON.parse(s.tips || '[]'),
    }));

    res.json({ sessions: parsed });
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user/sessions/:id
router.get('/sessions/:id', authenticateToken, (req, res) => {
  try {
    const session = dbGet(
      'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = dbAll(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({
      session: {
        ...session,
        strengths: JSON.parse(session.strengths || '[]'),
        weaknesses: JSON.parse(session.weaknesses || '[]'),
        tips: JSON.parse(session.tips || '[]'),
      },
      messages
    });
  } catch (err) {
    console.error('Session detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user/stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const totalSessions = dbGet(
      'SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND status = ?',
      [req.user.id, 'completed']
    );

    const avgScore = dbGet(
      'SELECT AVG(overall_score) as avg FROM sessions WHERE user_id = ? AND status = ?',
      [req.user.id, 'completed']
    );

    const bestScore = dbGet(
      'SELECT MAX(overall_score) as best FROM sessions WHERE user_id = ? AND status = ?',
      [req.user.id, 'completed']
    );

    // Score trends (last 20 completed sessions)
    const trends = dbAll(
      'SELECT id, overall_score, communication_score, technical_score, confidence_score, relevance_score, interview_type, job_role, difficulty, completed_at FROM sessions WHERE user_id = ? AND status = ? ORDER BY completed_at DESC LIMIT 20',
      [req.user.id, 'completed']
    );

    // Performance by type
    const byType = dbAll(
      'SELECT interview_type, AVG(overall_score) as avg_score, COUNT(*) as count FROM sessions WHERE user_id = ? AND status = ? GROUP BY interview_type',
      [req.user.id, 'completed']
    );

    // Performance by difficulty
    const byDifficulty = dbAll(
      'SELECT difficulty, AVG(overall_score) as avg_score, COUNT(*) as count FROM sessions WHERE user_id = ? AND status = ? GROUP BY difficulty',
      [req.user.id, 'completed']
    );

    res.json({
      totalSessions: totalSessions.count,
      avgScore: Math.round(avgScore.avg || 0),
      bestScore: bestScore.best || 0,
      trends: trends.reverse(),
      byType,
      byDifficulty
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
