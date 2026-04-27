@echo off
echo Starting AI Interview Simulator...

start cmd /k "cd server && node server.js"
start cmd /k "cd client && npm run dev"

echo Servers are starting. 
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
pause
