/**
 * API client for Legal Tabular Review backend
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  template_id?: string;
  template_name?: string;
  created_at?: string;
}

export interface Document {
  id: string;
  filename: string;
  parse_status: string;
  file_format?: string;
  page_count?: number;
}

export interface TableCell {
  field_name: string;
  document_id: string;
  display_value: string;
}

export interface TableData {
  fields: string[];
  documents: Document[];
  cells: TableCell[];
}

// Phase 2 Types

export interface Citation {
  page: number;
  text: string;
  notes?: string;
}

export interface TableCellV2 {
  field_name: string;
  document_id: string;
  display_value: string;
  confidence_score?: number;
  citations: Citation[];
  review_status: string;
  manual_value?: string;
  extraction_id: string;
}

export interface TableDataV2 {
  fields: string[];
  documents: Document[];
  cells: TableCellV2[];
}

export interface AsyncRequest {
  id: string;
  project_id: string;
  request_type: string;
  status: string;
  progress: number;
  total_items?: number;
  processed_items?: number;
  error_message?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface UpdateAnswerRequest {
  extraction_id: string;
  action: 'CONFIRM' | 'REJECT' | 'EDIT';
  manual_value?: string;
  review_notes?: string;
  reviewed_by?: string;
}

// Phase 3 Types

export interface SuggestedField {
  field_name: string;
  field_type: string;
  description: string;
  example_value?: string;
  page_hint?: string;
  page_start?: number;
  page_end?: number;
  page_confidence?: number;
}

export interface SuggestFieldsResponse {
  document_id: string;
  document_name: string;
  suggested_fields: SuggestedField[];
  field_count: number;
}

export interface FieldDefinition {
  field_name: string;
  field_type: string;
  description: string;
  example_value?: string;
  page_start?: number;
  page_end?: number;
  page_confidence?: number;
}

export interface Template {
  id: string;
  name: string;
  version: number;
  fields: FieldDefinition[];
  is_active: boolean;
  created_at?: string;
  field_count: number;
}

export interface CreateTemplateRequest {
  name: string;
  fields: FieldDefinition[];
  version?: number;
}

export const api = {
  // Projects
  async createProject(name: string, description: string, templateId?: string): Promise<Project> {
    const response = await axios.post(`${API_BASE_URL}/create-project`, {
      name,
      description,
      template_id: templateId || null,
    });
    return response.data;
  },

  async listProjects(): Promise<Project[]> {
    const response = await axios.get(`${API_BASE_URL}/projects`);
    return response.data;
  },

  async getProjectInfo(projectId: string): Promise<Project> {
    const response = await axios.get(`${API_BASE_URL}/get-project-info/${projectId}`);
    return response.data;
  },

  async deleteProject(projectId: string): Promise<any> {
    const response = await axios.delete(`${API_BASE_URL}/delete-project/${projectId}`);
    return response.data;
  },

  // Documents
  async uploadDocuments(projectId: string, files: File[]): Promise<any> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await axios.post(
      `${API_BASE_URL}/upload-documents/${projectId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },

  // Extraction
  async extractFields(projectId: string): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/extract-fields/${projectId}`);
    return response.data;
  },

  // Table
  async getTableData(projectId: string): Promise<TableData> {
    const response = await axios.get(`${API_BASE_URL}/get-table-data/${projectId}`);
    return response.data;
  },

  // Phase 2: Async Extraction
  async generateAllAnswers(projectId: string): Promise<AsyncRequest> {
    const response = await axios.post(`${API_BASE_URL}/generate-all-answers/${projectId}`);
    return response.data;
  },

  async getRequestStatus(requestId: string): Promise<AsyncRequest> {
    const response = await axios.get(`${API_BASE_URL}/get-request-status/${requestId}`);
    return response.data;
  },

  // Phase 2: Review Workflow
  async getTableDataV2(projectId: string): Promise<TableDataV2> {
    const response = await axios.get(`${API_BASE_URL}/get-table-data-v2/${projectId}`);
    return response.data;
  },

  async updateAnswer(request: UpdateAnswerRequest): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/update-answer`, request);
    return response.data;
  },

  // Phase 3: Template Management
  async suggestFieldsFromDocument(documentId: string): Promise<SuggestFieldsResponse> {
    const response = await axios.post(`${API_BASE_URL}/suggest-fields-from-document/${documentId}`);
    return response.data;
  },

  async createTemplate(request: CreateTemplateRequest): Promise<Template> {
    const response = await axios.post(`${API_BASE_URL}/create-template`, request);
    return response.data;
  },

  async listTemplates(activeOnly: boolean = true): Promise<Template[]> {
    const response = await axios.get(`${API_BASE_URL}/templates`, {
      params: { active_only: activeOnly },
    });
    return response.data;
  },

  async getTemplate(templateId: string): Promise<Template> {
    const response = await axios.get(`${API_BASE_URL}/template/${templateId}`);
    return response.data;
  },

  async updateTemplate(templateId: string, updates: Partial<CreateTemplateRequest>): Promise<Template> {
    const response = await axios.put(`${API_BASE_URL}/update-template/${templateId}`, updates);
    return response.data;
  },

  async deleteTemplate(templateId: string, permanent: boolean = false): Promise<any> {
    const response = await axios.delete(`${API_BASE_URL}/delete-template/${templateId}`, {
      params: { permanent },
    });
    return response.data;
  },

  async cloneTemplate(templateId: string, newName: string): Promise<Template> {
    const response = await axios.post(`${API_BASE_URL}/clone-template/${templateId}`, null, {
      params: { new_name: newName },
    });
    return response.data;
  },

  async createTemplateFromProject(projectId: string, templateName: string): Promise<Template> {
    const response = await axios.post(`${API_BASE_URL}/create-template-from-project/${projectId}`, null, {
      params: { template_name: templateName },
    });
    return response.data;
  },

  // Export
  async exportTableToCSV(projectId: string): Promise<void> {
    const response = await axios.get(`${API_BASE_URL}/export-table/${projectId}`, {
      params: { format: 'csv' },
      responseType: 'blob',
    });

    // Create a download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `extraction_${projectId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async exportTableToExcel(projectId: string): Promise<void> {
    const response = await axios.get(`${API_BASE_URL}/export-table/${projectId}`, {
      params: { format: 'excel' },
      responseType: 'blob',
    });

    // Create a download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `extraction_${projectId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Quality Evaluation
  async createReference(projectId: string, documentId: string, fieldName: string, referenceValue: string, notes?: string): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/create-reference/${projectId}`, {
      document_id: documentId,
      field_name: fieldName,
      reference_value: referenceValue,
      notes,
    });
    return response.data;
  },

  async bulkCreateReferences(projectId: string, references: any[]): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/bulk-create-references/${projectId}`, {
      references,
    });
    return response.data;
  },

  async getReferences(projectId: string): Promise<any[]> {
    const response = await axios.get(`${API_BASE_URL}/get-references/${projectId}`);
    return response.data;
  },

  async deleteReference(referenceId: string): Promise<any> {
    const response = await axios.delete(`${API_BASE_URL}/delete-reference/${referenceId}`);
    return response.data;
  },

  async evaluateProject(projectId: string, reportName?: string): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/evaluate-project/${projectId}`, null, {
      params: { report_name: reportName },
    });
    return response.data;
  },

  async getEvaluationReports(projectId: string): Promise<any[]> {
    const response = await axios.get(`${API_BASE_URL}/get-evaluation-reports/${projectId}`);
    return response.data;
  },

  async getEvaluationReport(reportId: string): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/get-evaluation-report/${reportId}`);
    return response.data;
  },
};
