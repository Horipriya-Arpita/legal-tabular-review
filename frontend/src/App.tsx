/**
 * Main App component with routing
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProjectList } from './pages/ProjectList';
import { ProjectDetail } from './pages/ProjectDetail';
import { TableView } from './pages/TableView';
import { TemplateBuilder } from './pages/TemplateBuilder';
import { TemplateList } from './pages/TemplateList';
import { EvaluationPage } from './pages/EvaluationPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectDetail />} />
        <Route path="/project/:projectId/table" element={<TableView />} />
        <Route path="/project/:projectId/evaluation" element={<EvaluationPage />} />
        <Route path="/templates" element={<TemplateList />} />
        <Route path="/template-builder" element={<TemplateBuilder />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
