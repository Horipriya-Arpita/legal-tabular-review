/**
 * Custom hook for managing dialogs
 */

import { useState } from 'react';

interface DialogState {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  title?: string;
  message: string;
  onConfirm?: () => void;
  confirmText?: string;
  confirmColor?: string;
  promptValue?: string;
  promptPlaceholder?: string;
}

export const useDialog = () => {
  const [dialog, setDialog] = useState<DialogState>({
    isOpen: false,
    type: 'alert',
    message: '',
  });

  const showAlert = (title: string, message: string, onConfirm?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'alert',
      title,
      message,
      onConfirm: onConfirm || (() => setDialog({ ...dialog, isOpen: false })),
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { confirmText?: string; confirmColor?: string }
  ) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmText: options?.confirmText || 'Confirm',
      confirmColor: options?.confirmColor || '#007bff',
      onConfirm: async () => {
        setDialog({ ...dialog, isOpen: false });
        await onConfirm();
      },
    });
  };

  const showPrompt = (
    title: string,
    message: string,
    onConfirm: (value: string) => void,
    options?: { defaultValue?: string; placeholder?: string; confirmText?: string }
  ) => {
    setDialog({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      promptValue: options?.defaultValue || '',
      promptPlaceholder: options?.placeholder || '',
      confirmText: options?.confirmText || 'OK',
      onConfirm: async () => {
        const value = dialog.promptValue || '';
        setDialog({ ...dialog, isOpen: false });
        await onConfirm(value);
      },
    });
  };

  const closeDialog = () => {
    setDialog({ ...dialog, isOpen: false });
  };

  const updatePromptValue = (value: string) => {
    setDialog({ ...dialog, promptValue: value });
  };

  return {
    dialog,
    showAlert,
    showConfirm,
    showPrompt,
    closeDialog,
    updatePromptValue,
  };
};