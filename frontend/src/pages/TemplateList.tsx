/**
 * Template List Page - Phase 3
 * Shows all available field templates
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Template } from '../services/api';
import { Dialog } from '../components/Dialog';

export const TemplateList: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Dialog states
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'prompt';
    title?: string;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    confirmColor?: string;
    promptValue?: string;
    promptPlaceholder?: string;
  }>({
    isOpen: false,
    type: 'alert',
    message: '',
  });

  useEffect(() => {
    loadTemplates();
  }, [showInactive]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await api.listTemplates(!showInactive);
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Error',
        message: 'Failed to load templates',
        onConfirm: () => setDialog({ ...dialog, isOpen: false }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = (templateId: string, templateName: string) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Deactivate Template',
      message: `Are you sure you want to deactivate "${templateName}"?\n\nThe template will be hidden from project creation but can be reactivated later.`,
      confirmText: 'Deactivate',
      confirmColor: '#ffc107',
      onConfirm: async () => {
        setDialog({ ...dialog, isOpen: false });
        try {
          await api.deleteTemplate(templateId, false); // Soft delete
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Success',
            message: 'Template deactivated successfully',
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
          loadTemplates();
        } catch (error) {
          console.error('Failed to deactivate template:', error);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Error',
            message: 'Failed to deactivate template',
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
        }
      },
    });
  };

  const handlePermanentDelete = (templateId: string, templateName: string) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Permanently Delete Template',
      message: `⚠️ WARNING: Are you sure you want to PERMANENTLY delete "${templateName}"?\n\nThis will:\n• Delete the template completely from the database\n• Remove it from all associated projects\n• Cannot be undone\n\nThis action is IRREVERSIBLE!`,
      confirmText: 'Permanently Delete',
      confirmColor: '#dc3545',
      onConfirm: async () => {
        setDialog({ ...dialog, isOpen: false });
        try {
          await api.deleteTemplate(templateId, true); // Permanent delete
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Success',
            message: 'Template permanently deleted',
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
          loadTemplates();
        } catch (error) {
          console.error('Failed to delete template:', error);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Error',
            message: 'Failed to delete template permanently',
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
        }
      },
    });
  };

  const handleClone = (templateId: string, originalName: string) => {
    setDialog({
      isOpen: true,
      type: 'prompt',
      title: 'Clone Template',
      message: 'Enter name for cloned template:',
      promptValue: `${originalName} (Copy)`,
      promptPlaceholder: 'Template name',
      confirmText: 'Clone',
      confirmColor: '#28a745',
      onConfirm: async () => {
        const newName = dialog.promptValue?.trim();
        setDialog({ ...dialog, isOpen: false });

        if (!newName) return;

        try {
          await api.cloneTemplate(templateId, newName);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Success',
            message: `Template "${newName}" created successfully!`,
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
          loadTemplates();
        } catch (error) {
          console.error('Failed to clone template:', error);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Error',
            message: 'Failed to clone template',
            onConfirm: () => setDialog({ ...dialog, isOpen: false }),
          });
        }
      },
    });
  };

  const toggleExpand = (templateId: string) => {
    setExpandedTemplate(prev => prev === templateId ? null : templateId);
  };

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading templates...</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Field Templates</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ← Back to Projects
          </button>
          <button
            onClick={() => navigate('/template-builder')}
            style={{
              padding: '10px 20px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            + Create New Template
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show inactive templates</span>
        </label>
      </div>

      {templates.length === 0 ? (
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '8px',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <h2 style={{ color: '#6c757d' }}>No templates found</h2>
          <p style={{ color: '#6c757d', marginBottom: '20px' }}>
            {showInactive
              ? 'No inactive templates available'
              : 'Create your first template to get started'}
          </p>
          {!showInactive && (
            <button
              onClick={() => navigate('/template-builder')}
              style={{
                padding: '12px 24px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              Create Template
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {templates.map(template => (
            <div
              key={template.id}
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: template.is_active ? '2px solid #28a745' : '2px solid #dc3545',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {template.name}
                    <span style={{
                      padding: '4px 8px',
                      background: template.is_active ? '#d4edda' : '#f8d7da',
                      color: template.is_active ? '#155724' : '#721c24',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'normal',
                    }}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </h2>
                  <div style={{ color: '#666', fontSize: '14px' }}>
                    {template.field_count} fields • Version {template.version}
                    {template.created_at && (
                      <> • Created {new Date(template.created_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => toggleExpand(template.id)}
                    style={{
                      padding: '8px 16px',
                      background: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    {expandedTemplate === template.id ? 'Hide Fields' : 'View Fields'}
                  </button>
                  <button
                    onClick={() => handleClone(template.id, template.name)}
                    style={{
                      padding: '8px 16px',
                      background: '#ffc107',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Clone
                  </button>
                  {template.is_active && (
                    <button
                      onClick={() => handleDeactivate(template.id, template.name)}
                      style={{
                        padding: '8px 16px',
                        background: '#ffc107',
                        color: '#000',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Deactivate
                    </button>
                  )}
                  <button
                    onClick={() => handlePermanentDelete(template.id, template.name)}
                    style={{
                      padding: '8px 16px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>

              {expandedTemplate === template.id && (
                <div style={{
                  marginTop: '15px',
                  padding: '15px',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                }}>
                  <h3 style={{ marginTop: 0 }}>Fields</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {template.fields.map((field, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '12px',
                          background: 'white',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontWeight: 'bold' }}>{field.field_name}</span>
                          <span style={{
                            padding: '2px 8px',
                            background: '#e9ecef',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}>
                            {field.field_type}
                          </span>
                        </div>
                        <div style={{ color: '#666', fontSize: '14px' }}>
                          {field.description}
                        </div>
                        {field.example_value && (
                          <div style={{ fontSize: '13px', color: '#28a745', marginTop: '5px' }}>
                            Example: {field.example_value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Custom Dialog */}
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
        onCancel={() => setDialog({ ...dialog, isOpen: false })}
        onPromptChange={(value) => setDialog({ ...dialog, promptValue: value })}
      />
    </div>
  );
};
