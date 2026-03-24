import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TeacherBuilderPage } from './pages/TeacherBuilderPage';
import { TeacherLivePage } from './pages/TeacherLivePage';
import { StudentPage } from './pages/StudentPage';
import { DisplayPage } from './pages/DisplayPage';
import './styles/app.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/teacher/builder" element={<TeacherBuilderPage />} />
        <Route path="/teacher/live" element={<TeacherLivePage />} />
        <Route path="/teacher" element={<Navigate to="/teacher/builder" replace />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="*" element={<Navigate to="/teacher/builder" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
