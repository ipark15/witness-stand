import { Routes, Route } from 'react-router-dom';
import Setup from './pages/Setup.jsx';
import Examination from './pages/Examination.jsx';
import Verdict from './pages/Verdict.jsx';
import Review from './pages/Review.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Setup />} />
      <Route path="/examination" element={<Examination />} />
      <Route path="/verdict" element={<Verdict />} />
      <Route path="/review/:sessionId" element={<Review />} />
    </Routes>
  );
}
