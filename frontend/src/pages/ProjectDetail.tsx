/**
 * Project Detail Page - Upload documents and run extraction
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, Project } from '../services/api';
import { Dialog } from '../components/Dialog';
import { useDialog } from '../hooks/useDialog';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();
  const { dialog, showAlert, showPrompt, closeDialog, updatePromptValue } = useDialog();

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;

    try {
      const data = await api.getProjectInfo(projectId);
      setProject(data);
    } catch (err: any) {
      setError('Failed to load project: ' + err.message);
    }
  };

  const handleUpload = async () => {
    if (!files || !projectId) return;

    setUploading(true);
    setError('');
    setSuccessMessage('');

    try {
      const fileArray = Array.from(files);
      const result = await api.uploadDocuments(projectId, fileArray);
      setSuccessMessage(`Successfully uploaded ${result.total_uploaded} document(s)`);
      setFiles(null);
      // Reset file input
      const fileInput = document.getElementById('fileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // Reload project
      await loadProject();
    } catch (err: any) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleExtract = async () => {
    if (!projectId) return;

    setExtracting(true);
    setError('');
    setSuccessMessage('');

    try {
      // Start async extraction (Phase 2/3 - supports templates)
      const asyncRequest = await api.generateAllAnswers(projectId);

      // Poll for completion
      let status = asyncRequest.status;
      let requestId = asyncRequest.id;

      while (status === 'PENDING' || status === 'PROCESSING' || status === 'IN_PROGRESS') {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        const statusUpdate = await api.getRequestStatus(requestId);
        status = statusUpdate.status;

        if (statusUpdate.progress > 0) {
          setSuccessMessage(
            `Extracting... ${statusUpdate.progress}% complete (${statusUpdate.processed_items}/${statusUpdate.total_items} items)`
          );
        }
      }

      if (status === 'COMPLETED') {
        setSuccessMessage(
          `Successfully extracted fields from all documents!`
        );
        await loadProject();
      } else if (status === 'FAILED') {
        setError('Extraction failed. Please try again.');
      }
    } catch (err: any) {
      setError('Extraction failed: ' + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleViewTable = () => {
    navigate(`/project/${projectId}/table`);
  };

  const handleSaveAsTemplate = async () => {
    if (!projectId || !project) return;

    showPrompt(
      'Save as Template',
      'Enter a name for this template:',
      async (templateName: string) => {
        if (!templateName.trim()) return;

        try {
          const template = await api.createTemplateFromProject(projectId, templateName);
          showAlert('Success', `Template "${template.name}" created successfully with ${template.field_count} fields!`);
        } catch (err: any) {
          showAlert('Error', 'Failed to create template: ' + err.message);
        }
      },
      {
        defaultValue: `${project.name} Template`,
        placeholder: 'Enter template name'
      }
    );
  };

  if (!project) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '8px 16px',
          background: '#f0f0f0',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        ← Back to Projects
      </button>

      <h1 style={{ marginBottom: '10px' }}>{project.name}</h1>
      {project.description && (
        <p style={{ color: '#666', marginBottom: '10px' }}>{project.description}</p>
      )}
      <p style={{ fontSize: '14px', color: '#999', marginBottom: '10px' }}>
        Status: <strong style={{ color: '#007bff' }}>{project.status}</strong>
      </p>
      {project.template_name && (
        <p style={{ fontSize: '14px', color: '#28a745', marginBottom: '20px' }}>
          📋 Using template: <strong>{project.template_name}</strong>
        </p>
      )}
      {!project.template_name && (
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
          Using default fields
        </p>
      )}

      {/* Messages */}
      {error && (
        <div style={{
          background: '#fee',
          color: '#c00',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{
          background: '#efe',
          color: '#060',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {successMessage}
        </div>
      )}

      {/* Upload Section */}
      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '25px',
        marginBottom: '25px',
        background: 'white'
      }}>
        <h2 style={{ marginTop: 0 }}>📄 Upload Documents</h2>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Upload documents (PDF, HTML, or DOCX) containing legal documents (contracts, agreements, etc.)
        </p>

        <input
          id="fileInput"
          type="file"
          multiple
          accept=".pdf,.html,.htm,.docx"
          onChange={(e) => setFiles(e.target.files)}
          style={{
            display: 'block',
            marginBottom: '15px',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            width: '100%'
          }}
        />

        <button
          onClick={handleUpload}
          disabled={!files || uploading}
          style={{
            padding: '10px 20px',
            background: files && !uploading ? '#28a745' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: files && !uploading ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {uploading ? 'Uploading...' : 'Upload Documents'}
        </button>

        {files && files.length > 0 && (
          <p style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
            {files.length} file(s) selected
          </p>
        )}
      </div>

      {/* Extract Section */}
      {(project.status === 'DOCUMENTS_UPLOADED' || project.status === 'READY') && (
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '25px',
          marginBottom: '25px',
          background: 'white'
        }}>
          <h2 style={{ marginTop: 0 }}>🔍 Extract Fields</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
            {project.template_name
              ? `Extract fields from all documents using the "${project.template_name}" template.`
              : 'Extract default fields (Parties, Effective Date, Payment Terms, Governing Law, Termination Clause) from all documents.'
            }
          </p>

          <button
            onClick={handleExtract}
            disabled={extracting}
            style={{
              padding: '10px 20px',
              background: extracting ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: extracting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {extracting ? 'Extracting... (This may take a minute)' : 'Start Extraction'}
          </button>

          {extracting && (
            <p style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>
              ⏳ Extracting fields using AI... Please wait.
            </p>
          )}
        </div>
      )}

      {/* View Table Section */}
      {project.status === 'READY' && (
        <div style={{
          border: '2px solid #28a745',
          borderRadius: '8px',
          padding: '25px',
          background: '#f0fff0'
        }}>
          <h2 style={{ marginTop: 0, color: '#28a745' }}>✅ Ready for Review</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
            Field extraction is complete! View the results in a table format.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleViewTable}
              style={{
                padding: '12px 24px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              📋 View Extraction Table
            </button>
            <button
              onClick={() => navigate(`/project/${projectId}/evaluation`)}
              style={{
                padding: '12px 24px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              🔍 Quality Evaluation
            </button>
            <button
              onClick={handleSaveAsTemplate}
              style={{
                padding: '12px 24px',
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              💾 Save as Template
            </button>
          </div>
        </div>
      )}

      <Dialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        confirmColor={dialog.confirmColor}
        promptValue={dialog.promptValue}
        promptPlaceholder={dialog.promptPlaceholder}
        onConfirm={dialog.onConfirm}
        onCancel={closeDialog}
        onPromptChange={updatePromptValue}
      />
    </div>
  );
}
