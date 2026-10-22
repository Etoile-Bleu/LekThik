import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react';

import { CloseIcon } from './Icons';
import './Dialog.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'modal' | 'drawer';
  showClose?: boolean;
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  size = 'md',
  variant = 'modal',
  showClose = true,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    if (openRef.current) {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`dialog dialog--${variant} dialog--${size}`}
      aria-label={title}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      {open && (
        <div className="dialog__panel">
          {showClose && (
            <button
              type="button"
              className="icon-button dialog__close"
              aria-label="Close"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
