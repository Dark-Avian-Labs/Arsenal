import { Modal } from '@dark-avian-labs/ui';
import { memo } from 'react';

type BuildSaveModalProps = {
  open: boolean;
  title: string;
  confirmLabel: string;
  hint?: string;
  name: string;
  error: string | null;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export const BuildSaveModal = memo(function BuildSaveModal({
  open,
  title,
  confirmLabel,
  hint,
  name,
  error,
  onNameChange,
  onClose,
  onConfirm,
}: BuildSaveModalProps) {
  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabelledBy="save-build-title"
      className="glass-modal-surface max-w-md"
    >
      <h3 id="save-build-title" className="text-foreground mb-4 text-lg font-semibold">
        {title}
      </h3>
      {hint ? <p className="text-muted mb-3 text-sm">{hint}</p> : null}
      {error ? (
        <p className="error-msg mb-3" role="alert">
          {error}
        </p>
      ) : null}
      <label
        htmlFor="save-build-name"
        className="text-muted mb-2 block text-xs tracking-[0.18em] uppercase"
      >
        Build Name
      </label>
      <input
        id="save-build-name"
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onConfirm();
          }
        }}
        className="form-input mb-4 w-full"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="btn btn-accent" onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
});
