/**
 * Custom Dialog Component - Replaces browser alert() and confirm()
 */

import React from 'react';

export interface DialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  type: 'alert' | 'confirm' | 'prompt';
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  promptValue?: string;
  onPromptChange?: (value: string) => void;
  promptPlaceholder?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  title,
  message,
  type,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  confirmColor = '#007bff',
  promptValue = '',
  onPromptChange,
  promptPlaceholder = '',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type === 'alert') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '600px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {title && (
          <h3
            style={{
              margin: '0 0 16px 0',
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#333',
            }}
          >
            {title}
          </h3>
        )}

        <div
          style={{
            marginBottom: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#555',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message}
        </div>

        {type === 'prompt' && (
          <input
            type="text"
            value={promptValue}
            onChange={(e) => onPromptChange && onPromptChange(e.target.value)}
            placeholder={promptPlaceholder}
            autoFocus
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '24px',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirm();
              }
            }}
          />
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          {type !== 'alert' && (
            <button
              onClick={handleCancel}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e9e9e9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            autoFocus={type === 'alert'}
            style={{
              padding: '10px 20px',
              background: confirmColor,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};