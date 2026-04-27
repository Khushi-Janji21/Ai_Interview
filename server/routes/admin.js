import express from 'express';
import { dbGet, dbAll, dbRun } from '../db/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/admin/users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = dbAll(
      'SELECT id, name, email, role, target_role, skills, experience_years, created_at FROM users ORDER BY created_at DESC'
    );

    // Get session count for each user
    const usersWithStats = users.map(user => {
      const sessionCount = dbGet(
        'SELECT COUNT(*) as count FROM sessions WHERE user_id = ?',
        [user.id]
      );
      const avgScore = dbGet(
        'SELECT AVG(overall_score) as avg FROM sessions WHERE user_id = ? AND status = ?',
        [user.id, 'completed']
      );
      return {
        ...user,
        session_count: sessionCount.count,
        avg_score: Math.round(avgScore.avg || 0)
      };
    });

    res.json({ users: usersWithStats });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const user = dbGet('SELECT id, role FROM users WHERE id = ?', [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin accounts' });
    }

    // Delete related data first (sql.js doesn't always cascade)
    const sessions = dbAll('SELECT id FROM sessions WHERE user_id = ?', [req.params.id]);
    for (const s of sessions) {
      dbRun('DELETE FROM messages WHERE session_id = ?', [s.id]);
    }
    dbRun('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
    dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/sessions
router.get('/sessions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const sessions = dbAll(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM sessions s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    const parsed = sessions.map(s => ({
      ...s,
      strengths: JSON.parse(s.strengths || '[]'),
      weaknesses: JSON.parse(s.weaknesses || '[]'),
      tips: JSON.parse(s.tips || '[]'),
    }));

    res.json({ sessions: parsed });
  } catch (err) {
    console.error('Admin sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/stats
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const totalUsers = dbGet('SELECT COUNT(*) as count FROM users WHERE role = ?', ['user']);
    const totalSessions = dbGet('SELECT COUNT(*) as count FROM sessions');
    const completedSessions = dbGet('SELECT COUNT(*) as count FROM sessions WHERE status = ?', ['completed']);
    const avgScore = dbGet('SELECT AVG(overall_score) as avg FROM sessions WHERE status = ?', ['completed']);

    // Sessions per day (last 30 days)
    const sessionsPerDay = dbAll(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM sessions 
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Top performing users
    const topUsers = dbAll(`
      SELECT u.name, u.email, AVG(s.overall_score) as avg_score, COUNT(s.id) as session_count
      FROM users u
      JOIN sessions s ON u.id = s.user_id
      WHERE s.status = 'completed'
      GROUP BY u.id
      ORDER BY avg_score DESC
      LIMIT 10
    `);

    // Scores by type
    const scoresByType = dbAll(`
      SELECT interview_type, AVG(overall_score) as avg_score, COUNT(*) as count
      FROM sessions WHERE status = 'completed'
      GROUP BY interview_type
    `);

    res.json({
      totalUsers: totalUsers.count,
      totalSessions: totalSessions.count,
      completedSessions: completedSessions.count,
      avgScore: Math.round(avgScore.avg || 0),
      sessionsPerDay,
      topUsers,
      scoresByType
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
