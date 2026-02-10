/**
 * Table View Page - Phase 2 with Interactive Review
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, TableDataV2, TableCellV2, Citation } from '../services/api';
import { Dialog } from '../components/Dialog';
import { useDialog } from '../hooks/useDialog';

export function TableView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tableData, setTableData] = useState<TableDataV2 | null>(null);
  const [error, setError] = useState('');
  const [selectedCell, setSelectedCell] = useState<TableCellV2 | null>(null);
  const [showCitations, setShowCitations] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editValue, setEditValue] = useState('');
  const navigate = useNavigate();
  const { dialog, showAlert, closeDialog, updatePromptValue } = useDialog();

  useEffect(() => {
    if (projectId) {
      loadTableData();
    }
  }, [projectId]);

  const loadTableData = async () => {
    if (!projectId) return;

    try {
      const data = await api.getTableDataV2(projectId);
      setTableData(data);
    } catch (err: any) {
      setError('Failed to load table data: ' + err.message);
    }
  };

  // Get cell data
  const getCell = (fieldName: string, documentId: string): TableCellV2 | null => {
    if (!tableData) return null;
    return tableData.cells.find(
      (c) => c.field_name === fieldName && c.document_id === documentId
    ) || null;
  };

  // Handle review actions
  const handleConfirm = async (cell: TableCellV2) => {
    try {
      await api.updateAnswer({
        extraction_id: cell.extraction_id,
        action: 'CONFIRM',
      });
      await loadTableData();
    } catch (err: any) {
      showAlert('Error', 'Failed to confirm: ' + err.message);
    }
  };

  const handleReject = async (cell: TableCellV2) => {
    try {
      await api.updateAnswer({
        extraction_id: cell.extraction_id,
        action: 'REJECT',
      });
      await loadTableData();
    } catch (err: any) {
      showAlert('Error', 'Failed to reject: ' + err.message);
    }
  };

  const handleEdit = (cell: TableCellV2) => {
    setSelectedCell(cell);
    setEditValue(cell.manual_value || cell.display_value);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCell) return;

    try {
      await api.updateAnswer({
        extraction_id: selectedCell.extraction_id,
        action: 'EDIT',
        manual_value: editValue,
      });
      setShowEditModal(false);
      setSelectedCell(null);
      await loadTableData();
    } catch (err: any) {
      showAlert('Error', 'Failed to save edit: ' + err.message);
    }
  };

  const handleShowCitations = (cell: TableCellV2) => {
    setSelectedCell(cell);
    setShowCitations(true);
  };

  // Handle export actions
  const handleExportCSV = async () => {
    if (!projectId) return;
    try {
      await api.exportTableToCSV(projectId);
    } catch (err: any) {
      showAlert('Error', 'Failed to export CSV: ' + err.message);
    }
  };

  const handleExportExcel = async () => {
    if (!projectId) return;
    try {
      await api.exportTableToExcel(projectId);
    } catch (err: any) {
      showAlert('Error', 'Failed to export Excel: ' + err.message);
    }
  };

  // Get cell background color based on review status
  const getCellColor = (cell: TableCellV2) => {
    switch (cell.review_status) {
      case 'CONFIRMED':
        return '#d4edda'; // Green
      case 'REJECTED':
        return '#f8d7da'; // Red
      case 'MANUAL_UPDATED':
        return '#fff3cd'; // Yellow
      case 'PENDING':
        return 'white';
      default:
        return '#f8f9fa'; // Gray
    }
  };

  // Get confidence badge color
  const getConfidenceBadgeColor = (confidence?: number) => {
    if (!confidence) return '#999';
    if (confidence >= 0.8) return '#28a745'; // Green
    if (confidence >= 0.5) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };

  if (error) {
    return (
      <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          style={{
            padding: '8px 16px',
            background: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '20px'
          }}
        >
          ← Back to Project
        </button>
        <div style={{
          background: '#fee',
          color: '#c00',
          padding: '20px',
          borderRadius: '4px'
        }}>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading table data...</p>
      </div>
    );
  }

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
          marginBottom: '20px'
        }}
      >
        ← Back to Project
      </button>

      <h1 style={{ marginBottom: '10px' }}>Extraction Table (Phase 2)</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Review and edit extracted fields from {tableData.documents.length} document(s)
      </p>

      {/* Export Buttons */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={handleExportCSV}
          style={{
            padding: '10px 20px',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
          title="Export table to CSV format"
        >
          📥 Export to CSV
        </button>
        <button
          onClick={handleExportExcel}
          style={{
            padding: '10px 20px',
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
          title="Export table to Excel format with metadata"
        >
          📥 Export to Excel
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th
                style={{
                  padding: '15px',
                  textAlign: 'left',
                  borderBottom: '2px solid #dee2e6',
                  fontWeight: 'bold',
                  minWidth: '150px',
                  position: 'sticky',
                  left: 0,
                  background: '#f8f9fa',
                  zIndex: 10
                }}
              >
                Field
              </th>
              {tableData.documents.map((doc) => (
                <th
                  key={doc.id}
                  style={{
                    padding: '15px',
                    textAlign: 'left',
                    borderBottom: '2px solid #dee2e6',
                    fontWeight: 'bold',
                    minWidth: '350px'
                  }}
                >
                  <div style={{ marginBottom: '5px' }}>{doc.filename}</div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 'normal',
                    color: '#666'
                  }}>
                    {doc.parse_status} • {doc.page_count || 0} pages
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.fields.map((fieldName, idx) => (
              <tr
                key={fieldName}
                style={{
                  background: idx % 2 === 0 ? '#fafafa' : '#f8f9fa'
                }}
              >
                <td
                  style={{
                    padding: '15px',
                    borderBottom: '1px solid #dee2e6',
                    fontWeight: 'bold',
                    position: 'sticky',
                    left: 0,
                    background: idx % 2 === 0 ? '#fafafa' : '#f8f9fa',
                    zIndex: 5
                  }}
                >
                  {fieldName}
                </td>
                {tableData.documents.map((doc) => {
                  const cell = getCell(fieldName, doc.id);
                  if (!cell) {
                    return (
                      <td
                        key={doc.id}
                        style={{
                          padding: '15px',
                          borderBottom: '1px solid #dee2e6',
                          background: '#f0f0f0',
                          color: '#999'
                        }}
                      >
                        N/A
                      </td>
                    );
                  }

                  return (
                    <td
                      key={doc.id}
                      style={{
                        padding: '15px',
                        borderBottom: '1px solid #dee2e6',
                        verticalAlign: 'top',
                        background: getCellColor(cell)
                      }}
                    >
                      {/* Value */}
                      <div style={{
                        fontSize: '14px',
                        lineHeight: '1.5',
                        marginBottom: '10px'
                      }}>
                        {cell.display_value || '—'}
                      </div>

                      {/* Confidence Badge */}
                      {cell.confidence_score !== null && cell.confidence_score !== undefined && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: getConfidenceBadgeColor(cell.confidence_score),
                            color: 'white',
                            marginRight: '5px'
                          }}
                        >
                          {Math.round(cell.confidence_score * 100)}%
                        </span>
                      )}

                      {/* Review Status Badge */}
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          background: '#6c757d',
                          color: 'white',
                          marginRight: '5px'
                        }}
                      >
                        {cell.review_status}
                      </span>

                      {/* Citations Link */}
                      {cell.citations && cell.citations.length > 0 && (
                        <button
                          onClick={() => handleShowCitations(cell)}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            background: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            marginRight: '5px'
                          }}
                        >
                          {cell.citations.length} citation{cell.citations.length > 1 ? 's' : ''}
                        </button>
                      )}

                      {/* Action Buttons */}
                      <div style={{ marginTop: '10px' }}>
                        {cell.review_status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleConfirm(cell)}
                              style={{
                                padding: '4px 12px',
                                background: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                marginRight: '5px'
                              }}
                              title="Confirm this extraction"
                            >
                              ✓ Confirm
                            </button>
                            <button
                              onClick={() => handleReject(cell)}
                              style={{
                                padding: '4px 12px',
                                background: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                marginRight: '5px'
                              }}
                              title="Reject this extraction"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleEdit(cell)}
                          style={{
                            padding: '4px 12px',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                          title="Edit this value"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{
        marginTop: '30px',
        padding: '20px',
        background: '#f8f9fa',
        borderRadius: '4px',
        fontSize: '13px'
      }}>
        <strong style={{ display: 'block', marginBottom: '10px' }}>Phase 2 Review Workflow:</strong>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              background: '#d4edda',
              border: '1px solid #c3e6cb',
              marginRight: '5px',
              verticalAlign: 'middle'
            }}></span>
            <span>Confirmed</span>
          </div>
          <div>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              background: '#f8d7da',
              border: '1px solid #f5c6cb',
              marginRight: '5px',
              verticalAlign: 'middle'
            }}></span>
            <span>Rejected</span>
          </div>
          <div>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              marginRight: '5px',
              verticalAlign: 'middle'
            }}></span>
            <span>Manually Edited</span>
          </div>
          <div>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              background: 'white',
              border: '1px solid #dee2e6',
              marginRight: '5px',
              verticalAlign: 'middle'
            }}></span>
            <span>Pending Review</span>
          </div>
        </div>
      </div>

      {/* Citations Modal */}
      {showCitations && selectedCell && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowCitations(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Citations for: {selectedCell.field_name}</h3>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              <strong>Value:</strong> {selectedCell.display_value}
            </p>

            {selectedCell.citations.length === 0 ? (
              <p style={{ color: '#999' }}>No citations available</p>
            ) : (
              <div>
                {selectedCell.citations.map((citation: Citation, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '15px',
                      background: '#f8f9fa',
                      borderRadius: '4px',
                      marginBottom: '10px',
                      borderLeft: '4px solid #007bff'
                    }}
                  >
                    <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>
                      Page {citation.page}
                    </div>
                    <div style={{
                      fontStyle: 'italic',
                      color: '#555',
                      lineHeight: '1.6',
                      marginBottom: '5px'
                    }}>
                      "{citation.text}"
                    </div>
                    {citation.notes && (
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Note: {citation.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowCitations(false)}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedCell && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Edit Field: {selectedCell.field_name}</h3>

            <div style={{ marginBottom: '15px' }}>
              <strong>Original AI Value:</strong>
              <div style={{
                padding: '10px',
                background: '#f8f9fa',
                borderRadius: '4px',
                marginTop: '5px'
              }}>
                {selectedCell.display_value}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Corrected Value:
              </label>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Save Changes
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
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
        onConfirm={dialog.onConfirm}
        onCancel={closeDialog}
      />
    </div>
  );
}
