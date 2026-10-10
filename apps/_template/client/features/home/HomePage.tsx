import { useState } from 'react';

import { APP_DISPLAY_NAME } from '../../app/config';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { SelectDropdown } from '../../components/ui/SelectDropdown';
import { Toast } from '../../components/ui/Toast';

const SAMPLE_OPTIONS = [
  { value: 'prism', label: 'Prism' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'clear', label: 'Clear' },
  { value: 'acrylic', label: 'Acrylic' },
];

export function HomePage() {
  const [toast, setToast] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState('one');
  const [selectValue, setSelectValue] = useState('prism');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <GlassCard className="p-8">
        <p className="text-muted text-xs tracking-[0.25em] uppercase">{APP_DISPLAY_NAME}</p>
        <h1 className="text-foreground mt-2 text-3xl font-semibold">Scaffold Ready</h1>
        <p className="text-muted mt-3 max-w-2xl text-sm leading-relaxed">
          This starter keeps session security, theming, and the shell layout in place. Add your
          feature routes and domain UI in this content area. See client/clerk/ when an app needs
          authentication.
        </p>
      </GlassCard>

      <GlassCard className="p-8">
        <h2 className="text-foreground text-lg font-semibold">Theme samples</h2>
        <p className="text-muted mt-1 max-w-2xl text-sm">
          Switch UI style in settings. Cards and chrome should keep the same shape; only material
          and radius scale change.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="accent" onClick={() => setToast('Toast stays a pill.')}>
            Show toast
          </Button>
          <Button variant="secondary" className="btn-sm" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <button type="button" className="glass-button">
            Glass button
          </button>
          <button type="button" className="header-link">
            Header link
          </button>
        </div>

        <div className="tabs mt-6">
          <button
            type="button"
            className={tab === 'one' ? 'tab active' : 'tab'}
            onClick={() => setTab('one')}
          >
            One
          </button>
          <button
            type="button"
            className={tab === 'two' ? 'tab active' : 'tab'}
            onClick={() => setTab('two')}
          >
            Two
          </button>
        </div>

        <div className="mt-4 grid max-w-lg gap-3 sm:grid-cols-2">
          <Input placeholder="Form input" />
          <SelectDropdown
            id="theme-sample-select"
            value={selectValue}
            options={SAMPLE_OPTIONS}
            onChange={setSelectValue}
            buttonAriaLabel="Sample select"
          />
        </div>

        <div className="glass-tooltip-surface mt-6 max-w-sm p-3">
          <p className="text-foreground text-sm font-medium">Tooltip card</p>
          <p className="text-muted mt-1 text-xs">Stay a rounded rectangle. Toast is the pill.</p>
        </div>

        <div className="error-msg mt-4">Error message</div>
        <div className="success-msg mt-3">Success message</div>
      </GlassCard>

      <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        className="glass-modal-surface max-w-md"
        ariaLabelledBy="theme-sample-modal-title"
      >
        <h2 id="theme-sample-modal-title">Modal</h2>
        <p className="text-muted text-sm">
          Clear still blurs the page behind this. Acrylic only dims, so the panel glass can work.
        </p>
        <div className="modal-actions">
          <Button variant="cancel" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => setModalOpen(false)}>
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
