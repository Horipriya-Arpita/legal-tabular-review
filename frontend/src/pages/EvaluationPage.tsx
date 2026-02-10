/**
 * Evaluation Page - Quality Evaluation: Compare AI vs Human References
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, TableDataV2, TableCellV2 } from '../services/api';
import { Dialog } from '../components/Dialog';
import { useDialog } from '../hooks/useDialog';

interface HumanReference {
  id: string;
  document_id: string;
  field_name: string;
  reference_value: string;
  notes?: string;
}

interface EvaluationReport {
  id: string;
  report_name: string;
  total_fields: number;
  exact_matches: number;
  partial_matches: number;
  mismatches: number;
  missing_ai: number;
  missing_human: number;
  accuracy_score: number;
  coverage_score: number;
  field_level_results: any[];
  created_at?: string;
}

export function EvaluationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { dialog, showAlert, showConfirm, closeDialog, updatePromptValue } = useDialog();

  // State
  const [tab, setTab] = useState<'references' | 'reports'>('references');
  const [tableData, setTableData] = useState<TableDataV2 | null>(null);
  const [references, setReferences] = useState<HumanReference[]>([]);
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Modal state for adding reference
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<TableCellV2 | null>(null);
  const [referenceValue, setReferenceValue] = useState('');
  const [referenceNotes, setReferenceNotes] = useState('');

  // Load data
  useEffect(() => {
    if (projectId) {
      loadTableData();
      loadReferences();
      loadReports();
    }
  }, [projectId]);

  const loadTableData = async () => {
    if (!projectId) return;
    try {
      const data = await api.getTableDataV2(projectId);
      setTableData(data);
    } catch (err: any) {
      console.error('Failed to load table data:', err);
    }
  };

  const loadReferences = async () => {
    if (!projectId) return;
    try {
      const refs = await api.getReferences(projectId);
      setReferences(refs);
    } catch (err: any) {
      console.error('Failed to load references:', err);
    }
  };

  const loadReports = async () => {
    if (!projectId) return;
    try {
      const reps = await api.getEvaluationReports(projectId);
      setReports(reps);
    } catch (err: any) {
      console.error('Failed to load reports:', err);
    }
  };

  // Get cell data
  const getCell = (fieldName: string, documentId: string): TableCellV2 | null => {
    if (!tableData) return null;
    return tableData.cells.find(
      (c) => c.field_name === fieldName && c.document_id === documentId
    ) || null;
  };

  // Check if reference exists for a cell
  const hasReference = (fieldName: string, documentId: string): boolean => {
    return references.some(
      (ref) => ref.field_name === fieldName && ref.document_id === documentId
    );
  };

  // Open reference modal
  const handleOpenReferenceModal = (cell: TableCellV2) => {
    setSelectedCell(cell);
    setReferenceValue(cell.display_value || ''); // Pre-fill with AI value
    setReferenceNotes('');
    setShowReferenceModal(true);
  };

  // Save reference
  const handleSaveReference = async () => {
    if (!projectId || !selectedCell) return;

    if (!referenceValue.trim()) {
      showAlert('Validation Error', 'Please enter a reference value');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await api.createReference(
        projectId,
        selectedCell.document_id,
        selectedCell.field_name,
        referenceValue.trim(),
        referenceNotes.trim() || undefined
      );
      setMessage('Reference added successfully!');
      setShowReferenceModal(false);
      await loadReferences();
    } catch (err: any) {
      setError('Failed to add reference: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-confirm all AI extractions as references (for demo purposes)
  const handleAutoConfirmAll = async () => {
    if (!projectId || !tableData) return;

    showConfirm(
      'Auto-Confirm All',
      'This will create human references for ALL AI-extracted fields,\nusing the AI values as "ground truth".\n\nThis is useful for demo/testing purposes.\n\nContinue?',
      async () => {

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const refsToCreate = tableData.cells
        .filter((cell) => !hasReference(cell.field_name, cell.document_id))
        .map((cell) => ({
          document_id: cell.document_id,
          field_name: cell.field_name,
          reference_value: cell.display_value || '',
          notes: 'Auto-confirmed from AI extraction',
        }));

      if (refsToCreate.length === 0) {
        setMessage('All fields already have references!');
        return;
      }

      await api.bulkCreateReferences(projectId, refsToCreate);
      setMessage(`Created ${refsToCreate.length} human references!`);
      await loadReferences();
    } catch (err: any) {
      setError('Failed to create references: ' + err.message);
    } finally {
      setLoading(false);
    }
      }
    );
  };

  // Delete a reference
  const handleDeleteReference = async (refId: string) => {
    showConfirm(
      'Delete Reference',
      'Are you sure you want to delete this reference?',
      async () => {

    setLoading(true);
    try {
      await api.deleteReference(refId);
      setMessage('Reference deleted');
      await loadReferences();
    } catch (err: any) {
      setError('Failed to delete: ' + err.message);
    } finally {
      setLoading(false);
    }
      },
      { confirmText: 'Delete', confirmColor: '#dc3545' }
    );
  };

  // Run evaluation
  const handleRunEvaluation = async () => {
    if (!projectId) return;

    if (references.length === 0) {
      showAlert('No References', 'No human references found. Please add references first.');
      return;
    }

    const reportName = 'Evaluation Report ' + new Date().toLocaleDateString();
    if (!reportName) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const report = await api.evaluateProject(projectId, reportName);
      setMessage(`Evaluation complete! Accuracy: ${report.accuracy_score}%`);
      await loadReports();
      setSelectedReport(report);
      setTab('reports');
    } catch (err: any) {
      setError('Evaluation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // View report details
  const handleViewReport = (report: EvaluationReport) => {
    setSelectedReport(report);
  };

  const getDocumentName = (docId: string): string => {
    const doc = tableData?.documents.find((d) => d.id === docId);
    return doc?.filename || 'Unknown Document';
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1600px', margin: '0 auto' }}>
      <button
        onClick={() => navigate(`/project/${projectId}`)}
        style={{
          padding: '8px 16px',
          background: '#f0f0f0',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        ← Back to Project
      </button>

      <h1 style={{ marginBottom: '10px' }}>Quality Evaluation</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Compare AI extraction vs human-labeled ground truth
      </p>

      {/* Messages */}
      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: '#efe', color: '#060', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setTab('references')}
          style={{
            padding: '12px 24px',
            background: tab === 'references' ? 'white' : '#f0f0f0',
            border: 'none',
            borderBottom: tab === 'references' ? '2px solid #007bff' : 'none',
            cursor: 'pointer',
            fontWeight: tab === 'references' ? 'bold' : 'normal',
            marginBottom: '-2px',
          }}
        >
          Human References ({references.length})
        </button>
        <button
          onClick={() => setTab('reports')}
          style={{
            padding: '12px 24px',
            background: tab === 'reports' ? 'white' : '#f0f0f0',
            border: 'none',
            borderBottom: tab === 'reports' ? '2px solid #007bff' : 'none',
            cursor: 'pointer',
            fontWeight: tab === 'reports' ? 'bold' : 'normal',
            marginBottom: '-2px',
          }}
        >
          Evaluation Reports ({reports.length})
        </button>
      </div>

      {/* References Tab */}
      {tab === 'references' && (
        <div>
          {/* Action Buttons */}
          <div style={{ marginBottom: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleAutoConfirmAll}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#ffc107',
                color: 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              🤖 Auto-Confirm All AI Extractions (Demo)
            </button>
            <button
              onClick={handleRunEvaluation}
              disabled={loading || references.length === 0}
              style={{
                padding: '12px 24px',
                background: references.length > 0 ? '#28a745' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || references.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              🔍 Run Evaluation
            </button>
          </div>

          {/* Instructions */}
          <div style={{ background: '#e7f3ff', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '2px solid #007bff' }}>
            <h3 style={{ marginTop: 0, color: '#007bff' }}>📖 What is "Add Reference"?</h3>
            <p style={{ marginBottom: '10px', lineHeight: '1.6' }}>
              <strong>"Add Reference"</strong> means: <em>"What is the CORRECT value that the AI should have extracted?"</em>
            </p>
            <div style={{ background: 'white', padding: '15px', borderRadius: '4px', marginBottom: '15px' }}>
              <strong>Example Workflow:</strong>
              <ol style={{ marginBottom: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>AI extracted:</strong> "Parties: John Smith and ABC Corp"</li>
                <li><strong>You click "Add Reference"</strong> → Modal shows the <span style={{ color: '#17a2b8', fontWeight: 'bold' }}>original PDF text</span> the AI found</li>
                <li><strong>You review the PDF text</strong> and see the AI missed "Jane Doe"</li>
                <li><strong>You enter the CORRECT value:</strong> "John Smith, Jane Doe and ABC Corp"</li>
                <li><strong>Run Evaluation</strong> → System compares AI vs Your Reference → Shows <span style={{ color: '#dc3545', fontWeight: 'bold' }}>MISMATCH</span></li>
              </ol>
            </div>
            <p style={{ marginBottom: 0, fontSize: '14px', color: '#666' }}>
              💡 <strong>Tip:</strong> The modal shows the PDF text that the AI found (with page numbers). Verify if it's complete, then enter the correct value.
            </p>
          </div>

          {/* Table with Add Reference buttons */}
          {tableData && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', minWidth: '150px', position: 'sticky', left: 0, background: '#f8f9fa', zIndex: 10 }}>
                      Field
                    </th>
                    {tableData.documents.map((doc) => (
                      <th key={doc.id} style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', minWidth: '300px' }}>
                        <div>{doc.filename}</div>
                        <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#666', marginTop: '5px' }}>
                          {doc.page_count || 0} pages
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.fields.map((fieldName, idx) => (
                    <tr key={fieldName} style={{ background: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6', fontWeight: 'bold', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fafafa' : 'white', zIndex: 5 }}>
                        {fieldName}
                      </td>
                      {tableData.documents.map((doc) => {
                        const cell = getCell(fieldName, doc.id);
                        const hasRef = hasReference(fieldName, doc.id);

                        if (!cell) {
                          return (
                            <td key={doc.id} style={{ padding: '15px', borderBottom: '1px solid #dee2e6', background: '#f0f0f0' }}>
                              N/A
                            </td>
                          );
                        }

                        return (
                          <td key={doc.id} style={{ padding: '15px', borderBottom: '1px solid #dee2e6', verticalAlign: 'top' }}>
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>AI Extracted:</div>
                              <div style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '8px' }}>
                                {cell.display_value || '—'}
                              </div>
                            </div>
                            {cell.confidence_score !== null && cell.confidence_score !== undefined && (
                              <div style={{ marginBottom: '10px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  background: cell.confidence_score >= 0.8 ? '#28a745' : cell.confidence_score >= 0.5 ? '#ffc107' : '#dc3545',
                                  color: 'white',
                                }}>
                                  {Math.round(cell.confidence_score * 100)}% confidence
                                </span>
                              </div>
                            )}
                            {hasRef ? (
                              <span style={{
                                display: 'inline-block',
                                padding: '6px 12px',
                                background: '#28a745',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                              }}>
                                ✓ Has Reference
                              </span>
                            ) : (
                              <button
                                onClick={() => handleOpenReferenceModal(cell)}
                                disabled={loading}
                                style={{
                                  padding: '8px 16px',
                                  background: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: loading ? 'not-allowed' : 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 'bold',
                                }}
                                title="Enter the CORRECT value (ground truth) to compare against AI"
                              >
                                ✏️ Add Reference
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reference List */}
          {references.length > 0 && (
            <div style={{ marginTop: '40px' }}>
              <h2>All Human References ({references.length})</h2>
              <div style={{ display: 'grid', gap: '10px' }}>
                {references.map((ref) => {
                  return (
                    <div
                      key={ref.id}
                      style={{
                        padding: '15px',
                        background: '#f8f9fa',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                          {ref.field_name} - {getDocumentName(ref.document_id)}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666' }}>
                          Ground Truth Value: <strong>{ref.reference_value}</strong>
                        </div>
                        {ref.notes && (
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                            Note: {ref.notes}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteReference(ref.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div>
          {reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
              <p>No evaluation reports yet.</p>
              <p>Add human references and run an evaluation to generate a report.</p>
            </div>
          ) : selectedReport ? (
            <div>
              <button
                onClick={() => setSelectedReport(null)}
                style={{
                  padding: '8px 16px',
                  background: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginBottom: '20px',
                }}
              >
                ← Back to Reports List
              </button>

              {/* Report Details */}
              <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h2>{selectedReport.report_name}</h2>
                <p style={{ color: '#666', fontSize: '14px' }}>
                  Created: {selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleString() : 'N/A'}
                </p>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '30px' }}>
                  <div style={{ background: '#e7f3ff', padding: '20px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#007bff' }}>
                      {selectedReport.accuracy_score.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Accuracy Score</div>
                  </div>
                  <div style={{ background: '#d4edda', padding: '20px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#28a745' }}>
                      {selectedReport.exact_matches}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Exact Matches</div>
                  </div>
                  <div style={{ background: '#fff3cd', padding: '20px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>
                      {selectedReport.partial_matches}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Partial Matches</div>
                  </div>
                  <div style={{ background: '#f8d7da', padding: '20px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#dc3545' }}>
                      {selectedReport.mismatches}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Mismatches</div>
                  </div>
                </div>

                {/* Field Level Results */}
                <h3 style={{ marginTop: '40px' }}>Field-Level Results</h3>
                <div style={{ overflowX: 'auto', marginTop: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Field</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>AI Value</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Human Reference (Ground Truth)</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Match</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Similarity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReport.field_level_results.map((result, idx) => {
                        const matchColor =
                          result.match_type === 'EXACT_MATCH' ? '#d4edda' :
                          result.match_type === 'PARTIAL_MATCH' ? '#fff3cd' :
                          result.match_type === 'MISMATCH' ? '#f8d7da' : '#f8f9fa';

                        return (
                          <tr key={idx} style={{ background: matchColor }}>
                            <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                              {result.field_name}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', maxWidth: '300px', overflow: 'hidden' }}>
                              {result.ai_value || <em style={{ color: '#999' }}>N/A</em>}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', maxWidth: '300px', overflow: 'hidden' }}>
                              {result.human_value || <em style={{ color: '#999' }}>N/A</em>}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                              {result.match_type.replace(/_/g, ' ')}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                              {result.similarity !== null && result.similarity !== undefined
                                ? `${(result.similarity * 100).toFixed(0)}%`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ marginBottom: '20px' }}>All Evaluation Reports</h2>
              <div style={{ display: 'grid', gap: '15px' }}>
                {reports.map((report) => (
                  <div
                    key={report.id}
                    style={{
                      background: 'white',
                      padding: '20px',
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleViewReport(report)}
                  >
                    <h3 style={{ marginTop: 0, marginBottom: '10px' }}>{report.report_name}</h3>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#666' }}>
                      <span>Accuracy: <strong style={{ color: '#007bff' }}>{report.accuracy_score.toFixed(1)}%</strong></span>
                      <span>Exact: <strong style={{ color: '#28a745' }}>{report.exact_matches}</strong></span>
                      <span>Partial: <strong style={{ color: '#ffc107' }}>{report.partial_matches}</strong></span>
                      <span>Mismatches: <strong style={{ color: '#dc3545' }}>{report.mismatches}</strong></span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
                      {report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Reference Modal */}
      {showReferenceModal && selectedCell && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowReferenceModal(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Add Human Reference (Ground Truth)</h3>

            {/* Explanation */}
            <div style={{ background: '#e7f3ff', padding: '15px', borderRadius: '4px', marginBottom: '20px', fontSize: '14px', lineHeight: '1.6' }}>
              <strong>What to do:</strong>
              <ol style={{ marginBottom: 0, paddingLeft: '20px', marginTop: '10px' }}>
                <li>Review the <strong>"Original Text from PDF"</strong> section below (if available)</li>
                <li>Verify if the text shown is complete and accurate</li>
                <li>Open the PDF document ({getDocumentName(selectedCell.document_id)}) if you need to check</li>
                <li>Enter the CORRECT value (ground truth) in the text box</li>
              </ol>
            </div>

            {/* Field Info */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>Field:</div>
              <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '15px' }}>
                {selectedCell.field_name}
              </div>

              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>Document:</div>
              <div style={{ fontSize: '14px', marginBottom: '15px' }}>
                {getDocumentName(selectedCell.document_id)}
              </div>
            </div>

            {/* AI Value */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>What AI Extracted:</div>
              <div style={{
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '4px',
                border: '1px solid #dee2e6',
                fontSize: '14px',
                fontStyle: 'italic',
              }}>
                {selectedCell.display_value || <em style={{ color: '#999' }}>Empty</em>}
              </div>
            </div>

            {/* PDF Citations - Original Text */}
            {selectedCell.citations && selectedCell.citations.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>
                  📄 Original Text from PDF:
                </div>
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '2px solid #17a2b8',
                  borderRadius: '4px',
                  background: '#e7f8fa',
                }}>
                  {selectedCell.citations.map((citation: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        borderBottom: idx < selectedCell.citations.length - 1 ? '1px solid #b8e6ec' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#0c5460', fontWeight: 'bold', marginBottom: '5px' }}>
                        📍 Page {citation.page}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: '1.6',
                        color: '#0c5460',
                        fontStyle: 'italic',
                        padding: '8px',
                        background: 'white',
                        borderRadius: '4px',
                        borderLeft: '3px solid #17a2b8',
                      }}>
                        "{citation.text}"
                      </div>
                      {citation.notes && (
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                          Note: {citation.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
                  💡 This is the actual text the AI found in the PDF. Verify if it's complete and correct.
                </div>
              </div>
            )}

            {/* Reference Value Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                Enter the CORRECT Value (Ground Truth): *
              </label>
              <textarea
                value={referenceValue}
                onChange={(e) => setReferenceValue(e.target.value)}
                placeholder="What should the AI have extracted? Enter the correct value here..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '12px',
                  border: '2px solid #007bff',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                autoFocus
              />
            </div>

            {/* Notes Input */}
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                Notes (Optional):
              </label>
              <input
                type="text"
                value={referenceNotes}
                onChange={(e) => setReferenceNotes(e.target.value)}
                placeholder="e.g., Manually verified from page 3"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSaveReference}
                disabled={loading || !referenceValue.trim()}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: referenceValue.trim() ? '#28a745' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading || !referenceValue.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '15px',
                }}
              >
                {loading ? 'Saving...' : '✓ Save Reference'}
              </button>
              <button
                onClick={() => setShowReferenceModal(false)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: 'white',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                }}
              >
                Cancel
              </button>
            </div>
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
}