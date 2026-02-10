/**
 * Template Builder Page - Phase 3
 * Allows users to create custom field templates using AI suggestions
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SuggestedField, FieldDefinition } from '../services/api';
import { Dialog } from '../components/Dialog';
import { useDialog } from '../hooks/useDialog';

interface SelectedField extends SuggestedField {
  selected: boolean;
}

export const TemplateBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { dialog, showAlert, showConfirm, showPrompt, closeDialog, updatePromptValue } = useDialog();

  // Step 1: Upload sample document
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Step 2: AI suggestions
  const [suggestedFields, setSuggestedFields] = useState<SelectedField[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [documentName, setDocumentName] = useState('');

  // Step 3: Template details
  const [templateName, setTemplateName] = useState('');
  const [customFields, setCustomFields] = useState<FieldDefinition[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Current step
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadSample = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Create a temporary project for sample upload
      const project = await api.createProject(
        'Template Sample',
        'Temporary project for AI field detection'
      );

      // Upload the sample document
      const uploadResult = await api.uploadDocuments(project.id, [selectedFile]);
      const docId = uploadResult.uploaded_documents[0].id;

      setUploadedDocId(docId);
      setStep(2);
    } catch (error) {
      console.error('Upload failed:', error);
      showAlert('Upload Failed', 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!uploadedDocId) return;

    setIsAnalyzing(true);
    try {
      const result = await api.suggestFieldsFromDocument(uploadedDocId);

      setSuggestedFields(
        result.suggested_fields.map(field => ({
          ...field,
          selected: true, // All fields selected by default
        }))
      );
      setDocumentName(result.document_name);
      setTemplateName(`${result.document_name} Template`);
      setStep(3);
    } catch (error) {
      console.error('Analysis failed:', error);
      showAlert('Analysis Failed', 'Failed to analyze document. Make sure the document is successfully parsed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleField = (index: number) => {
    setSuggestedFields(prev =>
      prev.map((field, i) =>
        i === index ? { ...field, selected: !field.selected } : field
      )
    );
  };

  const handleAddCustomField = () => {
    setCustomFields(prev => [
      ...prev,
      {
        field_name: '',
        field_type: 'TEXT',
        description: '',
      },
    ]);
  };

  const handleUpdateCustomField = (
    index: number,
    key: keyof FieldDefinition,
    value: string
  ) => {
    setCustomFields(prev =>
      prev.map((field, i) =>
        i === index ? { ...field, [key]: value } : field
      )
    );
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      showAlert('Validation Error', 'Please enter a template name');
      return;
    }

    // Combine selected AI fields and custom fields
    const selectedAIFields = suggestedFields
      .filter(f => f.selected)
      .map(({ selected, page_hint, ...field }) => ({
        field_name: field.field_name,
        field_type: field.field_type,
        description: field.description,
        example_value: field.example_value,
        // Preserve page hints for optimized extraction
        ...(field.page_start !== undefined && {
          page_start: field.page_start,
          page_end: field.page_end,
          page_confidence: field.page_confidence,
        }),
      }));

    const validCustomFields = customFields.filter(
      f => f.field_name.trim() && f.description.trim()
    );

    const allFields = [...selectedAIFields, ...validCustomFields];

    if (allFields.length === 0) {
      showAlert('Validation Error', 'Please select at least one field or add a custom field');
      return;
    }

    setIsSaving(true);
    try {
      const template = await api.createTemplate({
        name: templateName,
        fields: allFields,
      });

      setIsSaving(false);

      // Ask user what they want to do next
      showAlert(
        'Template Created Successfully',
        `Template "${template.name}" created successfully with ${template.field_count} fields!`,
        () => {
          showConfirm(
            'Create Project?',
            'Would you like to create a project with this template now?',
            () => {
              // User wants to create a project
              showPrompt(
                'Create Project',
                'Enter project name:',
                async (projectName: string) => {
                  if (projectName.trim()) {
                    const project = await api.createProject(projectName, '', template.id);
                    navigate(`/project/${project.id}`);
                  } else {
                    navigate('/templates');
                  }
                },
                { confirmText: 'Create Project' }
              );
            },
            { confirmText: 'Yes, Create Project', confirmColor: '#007bff' }
          );
        }
      );
    } catch (error) {
      console.error('Failed to save template:', error);
      showAlert('Error', 'Failed to save template. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Template Builder</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Create a custom field template using AI suggestions from a sample document
      </p>

      {/* Step Progress */}
      <div style={{ display: 'flex', marginBottom: '40px', gap: '20px' }}>
        <div style={{
          flex: 1,
          padding: '15px',
          background: step >= 1 ? '#007bff' : '#e9ecef',
          color: step >= 1 ? 'white' : '#6c757d',
          borderRadius: '8px',
          textAlign: 'center',
          fontWeight: 'bold',
        }}>
          1. Upload Sample
        </div>
        <div style={{
          flex: 1,
          padding: '15px',
          background: step >= 2 ? '#007bff' : '#e9ecef',
          color: step >= 2 ? 'white' : '#6c757d',
          borderRadius: '8px',
          textAlign: 'center',
          fontWeight: 'bold',
        }}>
          2. AI Analysis
        </div>
        <div style={{
          flex: 1,
          padding: '15px',
          background: step >= 3 ? '#007bff' : '#e9ecef',
          color: step >= 3 ? 'white' : '#6c757d',
          borderRadius: '8px',
          textAlign: 'center',
          fontWeight: 'bold',
        }}>
          3. Review & Save
        </div>
      </div>

      {/* Step 1: Upload Sample */}
      {step === 1 && (
        <div style={{
          background: 'white',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <h2>Upload a Sample Document</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Upload a sample document (PDF, HTML, or DOCX) that represents the type of documents you want to extract fields from.
            Our AI will analyze it and suggest relevant fields.
          </p>

          <input
            type="file"
            accept=".pdf,.html,.htm,.docx"
            onChange={handleFileSelect}
            style={{
              display: 'block',
              marginBottom: '20px',
              padding: '10px',
              border: '2px dashed #007bff',
              borderRadius: '8px',
              width: '100%',
            }}
          />

          {selectedFile && (
            <div style={{ marginBottom: '20px', padding: '10px', background: '#e7f3ff', borderRadius: '4px' }}>
              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
            </div>
          )}

          <button
            onClick={handleUploadSample}
            disabled={!selectedFile || isUploading}
            style={{
              padding: '12px 24px',
              background: selectedFile && !isUploading ? '#007bff' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedFile && !isUploading ? 'pointer' : 'not-allowed',
              fontSize: '16px',
            }}
          >
            {isUploading ? 'Uploading...' : 'Upload & Continue'}
          </button>
        </div>
      )}

      {/* Step 2: AI Analysis */}
      {step === 2 && (
        <div style={{
          background: 'white',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <h2>Analyze Document with AI</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Our AI will analyze your sample document and suggest fields to extract.
            This may take a few seconds.
          </p>

          <button
            onClick={handleAnalyzeDocument}
            disabled={isAnalyzing}
            style={{
              padding: '12px 24px',
              background: isAnalyzing ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              fontSize: '16px',
            }}
          >
            {isAnalyzing ? 'Analyzing...' : 'Start AI Analysis'}
          </button>
        </div>
      )}

      {/* Step 3: Review & Save */}
      {step === 3 && (
        <div style={{
          background: 'white',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <h2>Review & Save Template</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Review AI-suggested fields, select the ones you want, and add any custom fields.
          </p>

          {/* Template Name */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Template Name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Contract Fields, NDA Template"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px',
              }}
            />
          </div>

          {/* AI Suggested Fields */}
          <div style={{ marginBottom: '30px' }}>
            <h3>AI-Suggested Fields ({suggestedFields.filter(f => f.selected).length} selected)</h3>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
              Based on: {documentName}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {suggestedFields.map((field, index) => (
                <div
                  key={index}
                  style={{
                    padding: '15px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: field.selected ? '#f0f8ff' : '#f8f9fa',
                    display: 'flex',
                    gap: '15px',
                    alignItems: 'flex-start',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={field.selected}
                    onChange={() => handleToggleField(index)}
                    style={{ marginTop: '4px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                      {field.field_name}
                      <span style={{
                        marginLeft: '10px',
                        padding: '2px 8px',
                        background: '#e9ecef',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'normal',
                      }}>
                        {field.field_type}
                      </span>
                    </div>
                    <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>
                      {field.description}
                    </div>
                    {field.example_value && (
                      <div style={{ fontSize: '13px', color: '#28a745' }}>
                        Example: {field.example_value}
                      </div>
                    )}
                    {(field.page_start !== undefined || field.page_hint) && (
                      <div style={{
                        fontSize: '12px',
                        color: '#007bff',
                        marginTop: '5px',
                        padding: '4px 8px',
                        background: '#e7f3ff',
                        borderRadius: '4px',
                        display: 'inline-block',
                      }}>
                        {field.page_start !== undefined ? (
                          <>
                            📄 Pages {field.page_start}-{field.page_end}
                            {field.page_confidence && (
                              <span style={{ marginLeft: '8px', color: '#28a745' }}>
                                ({(field.page_confidence * 100).toFixed(0)}% confidence)
                              </span>
                            )}
                          </>
                        ) : (
                          field.page_hint
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Fields */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>Custom Fields</h3>
              <button
                onClick={handleAddCustomField}
                style={{
                  padding: '8px 16px',
                  background: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                + Add Custom Field
              </button>
            </div>

            {customFields.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                No custom fields added. Click "Add Custom Field" to create one.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {customFields.map((field, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '15px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: '#fff8e1',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'start' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Field Name</label>
                        <input
                          type="text"
                          value={field.field_name}
                          onChange={(e) => handleUpdateCustomField(index, 'field_name', e.target.value)}
                          placeholder="e.g., Termination Date"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Type</label>
                        <select
                          value={field.field_type}
                          onChange={(e) => handleUpdateCustomField(index, 'field_type', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                          }}
                        >
                          <option value="TEXT">TEXT</option>
                          <option value="DATE">DATE</option>
                          <option value="NUMBER">NUMBER</option>
                          <option value="ENUM">ENUM</option>
                          <option value="BOOLEAN">BOOLEAN</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Description</label>
                        <input
                          type="text"
                          value={field.description}
                          onChange={(e) => handleUpdateCustomField(index, 'description', e.target.value)}
                          placeholder="What does this field represent?"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveCustomField(index)}
                        style={{
                          marginTop: '18px',
                          padding: '8px 12px',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSaveTemplate}
              disabled={isSaving}
              style={{
                padding: '12px 32px',
                background: isSaving ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '12px 32px',
                background: 'white',
                color: '#6c757d',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              Cancel
            </button>
          </div>
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
        onCancel={closeDialog}
        onPromptChange={updatePromptValue}
      />
    </div>
  );
};
