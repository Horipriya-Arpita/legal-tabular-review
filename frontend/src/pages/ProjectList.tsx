/**
 * Project List Page - Shows all review projects
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Project } from '../services/api';
import { Dialog } from '../components/Dialog';

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Dialog state
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title?: string;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    confirmColor?: string;
  }>({
    isOpen: false,
    type: 'alert',
    message: '',
  });

  useEffect(() => {
    loadProjects();
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.listTemplates(true);
      setTemplates(data);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (err: any) {
      setError('Failed to load projects: ' + err.message);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Validation Error',
        message: 'Please enter a project name',
        onConfirm: () => setDialog({ ...dialog, isOpen: false }),
      });
      return;
    }

    setLoading(true);
    setError('');

    try {
      const project = await api.createProject(
        newProjectName,
        newProjectDescription,
        selectedTemplateId || undefined
      );
      setNewProjectName('');
      setNewProjectDescription('');
      setSelectedTemplateId('');
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      setError('Failed to create project: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string, event: React.MouseEvent) => {
    // Stop propagation to prevent navigating to project detail
    event.stopPropagation();

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Project',
      message: `Are you sure you want to delete the project "${projectName}"?\n\nThis will permanently delete:\n• All uploaded documents\n• All extracted fields and data\n• All associated async requests\n\nThis action cannot be undone.`,
      confirmText: 'Delete',
      confirmColor: '#dc3545',
      onConfirm: async () => {
        setDialog({ ...dialog, isOpen: false });
        setLoading(true);
        setError('');

        try {
          await api.deleteProject(projectId);
          // Refresh the project list
          await loadProjects();
        } catch (err: any) {
          setError('Failed to delete project: ' + err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CREATED': return '#gray';
      case 'DOCUMENTS_UPLOADED': return '#blue';
      case 'READY': return '#green';
      default: return '#black';
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h1 style={{ margin: 0 }}>Legal Tabular Review</h1>
        <button
          onClick={() => navigate('/templates')}
          style={{
            padding: '10px 20px',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Manage Templates
        </button>
      </div>
      <p style={{ color: '#666', marginBottom: '40px' }}>
        Extract and compare fields from legal documents
      </p>

      {/* Create Project Section */}
      <div style={{
        background: '#f5f5f5',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '40px'
      }}>
        <h2 style={{ marginTop: 0 }}>Create New Project</h2>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Project name (e.g., Q1 2026 Vendor Contracts)"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            style={{
              padding: '10px',
              width: '100%',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <textarea
            placeholder="Description (optional)"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            rows={3}
            style={{
              padding: '10px',
              width: '100%',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
            Field Template (Optional)
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            style={{
              padding: '10px',
              width: '100%',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            <option value="">Use Default Fields</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.field_count} fields)
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
            Select a template to use custom fields, or leave blank for default fields
          </p>
        </div>
        <button
          onClick={handleCreateProject}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Creating...' : '+ Create Project'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee',
          color: '#c00',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Projects List */}
      <div>
        <h2>Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p style={{ color: '#666' }}>
            No projects yet. Create one to get started!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                style={{
                  border: '1px solid #ddd',
                  padding: '20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: 'white'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = '#007bff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#ddd';
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 8px 0' }}>{project.name}</h3>
                    {project.description && (
                      <p style={{ margin: '0 0 8px 0', color: '#666' }}>
                        {project.description}
                      </p>
                    )}
                    <p style={{ margin: 0, fontSize: '13px', color: '#999' }}>
                      Created: {project.created_at ? new Date(project.created_at).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '6px 12px',
                      background: getStatusColor(project.status),
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {project.status}
                    </div>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                      style={{
                        padding: '6px 12px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#c82333';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#dc3545';
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Dialog */}
      <Dialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        confirmColor={dialog.confirmColor}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog({ ...dialog, isOpen: false })}
      />
    </div>
  );
}
