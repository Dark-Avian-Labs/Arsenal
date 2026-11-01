import { apiFetch, Button, Modal } from '@dark-avian-labs/ui';
import type { ImportMode, ImportPlan } from '@shared/worImport';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
};

const MODES: { value: ImportMode; label: string }[] = [
  { value: 'sync', label: 'Sync' },
  { value: 'restore', label: 'Restore' },
  { value: 'skip', label: 'Skip' },
];

function countLine(add: number, update: number, unchanged: number, rejected: number): string {
  return `${add} new, ${update} updated, ${unchanged} unchanged, ${rejected} unreadable`;
}

export function ImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [gearMode, setGearMode] = useState<ImportMode>('sync');
  const [artifactMode, setArtifactMode] = useState<ImportMode>('sync');
  const [plus16, setPlus16] = useState(true);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [confirmedWipe, setConfirmedWipe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetPlan(): void {
    setPlan(null);
    setDeleteMissing(false);
    setConfirmedWipe(false);
    setError(null);
  }

  async function readFile(picked: File): Promise<void> {
    resetPlan();
    setFileName(picked.name);
    try {
      setFile(JSON.parse(await picked.text()) as unknown);
    } catch {
      setFile(null);
      setError('That file is not JSON.');
    }
  }

  function payload(apply: boolean) {
    return {
      file,
      gear_mode: gearMode,
      artifact_mode: artifactMode,
      gear_plus_16_only: plus16,
      delete_missing: apply && deleteMissing,
    };
  }

  async function preview(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    const response = await apiFetch('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify(payload(false)),
    });
    const body = (await response.json().catch(() => null)) as
      | (ImportPlan & { error?: string })
      | null;
    setBusy(false);
    if (!response.ok || !body || body.error) {
      setPlan(null);
      setError(body?.error ?? 'Could not read that file.');
      return;
    }
    setPlan(body);
  }

  async function apply(): Promise<void> {
    if (!file || !plan) return;
    setBusy(true);
    setError(null);
    const response = await apiFetch('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload(true)),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? 'Import failed.');
      return;
    }
    await onImported();
    onClose();
  }

  const needsWipe = gearMode === 'restore' || artifactMode === 'restore';
  const showDeletes = Boolean(plan && !plus16 && (gearMode === 'sync' || artifactMode === 'sync'));
  const missing = [
    ...(gearMode === 'sync' ? (plan?.gear.missing ?? []) : []),
    ...(artifactMode === 'sync' ? (plan?.artifacts.missing ?? []) : []),
  ];

  return (
    <Modal open={open} onClose={onClose} className="glass-modal-surface max-w-2xl">
      <h2>Import extractor file</h2>
      <p className="text-muted mt-1 text-sm">
        Sync matches pieces by game id, then by stats. Restore wipes that inventory first.
      </p>
      <label className="form-group mt-4 block">
        <span>gear.json</span>
        <input
          className="form-input mt-1 w-full"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) void readFile(picked);
          }}
        />
      </label>
      {fileName ? <p className="text-muted mt-1 text-sm">{fileName}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="form-group block">
          <span>Gear</span>
          <select
            className="form-input mt-1 w-full"
            value={gearMode}
            onChange={(event) => {
              setGearMode(event.target.value as ImportMode);
              resetPlan();
            }}
          >
            {MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-group block">
          <span>Artifacts</span>
          <select
            className="form-input mt-1 w-full"
            value={artifactMode}
            onChange={(event) => {
              setArtifactMode(event.target.value as ImportMode);
              resetPlan();
            }}
          >
            {MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={plus16}
          onChange={(event) => {
            setPlus16(event.target.checked);
            resetPlan();
          }}
        />
        Gear at +16 only
      </label>
      {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
      {plan ? (
        <div className="mt-4 grid gap-2 text-sm">
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <p>
            Gear:{' '}
            {countLine(
              plan.gear.add.length,
              plan.gear.update.length,
              plan.gear.unchanged,
              plan.gear.rejected.length,
            )}
          </p>
          <p>
            Artifacts:{' '}
            {countLine(
              plan.artifacts.add.length,
              plan.artifacts.update.length,
              plan.artifacts.unchanged,
              plan.artifacts.rejected.length,
            )}
          </p>
          {plan.gear.rejected.length ? (
            <ul className="text-muted max-h-32 overflow-auto">
              {plan.gear.rejected.slice(0, 20).map((row) => (
                <li key={`g-${row.uid}`}>
                  Gear {row.uid}: {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {plan.artifacts.rejected.length ? (
            <ul className="text-muted max-h-32 overflow-auto">
              {plan.artifacts.rejected.slice(0, 20).map((row) => (
                <li key={`a-${row.uid}`}>
                  Artifact {row.uid}: {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {plan.unknown_hero_ids.length ? (
            <p className="text-muted">Hero ids: {plan.unknown_hero_ids.join(', ')}</p>
          ) : null}
          {showDeletes && missing.length ? (
            <div>
              <p>Only in Outfitter ({missing.length})</p>
              <ul className="text-muted max-h-32 overflow-auto">
                {missing.slice(0, 30).map((row) => (
                  <li key={row.id}>{row.label}</li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deleteMissing}
                  onChange={(event) => setDeleteMissing(event.target.checked)}
                />
                Delete these
              </label>
            </div>
          ) : null}
          {needsWipe ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmedWipe}
                onChange={(event) => setConfirmedWipe(event.target.checked)}
              />
              {gearMode === 'restore' ? `Delete all ${plan.gear.wipe_count} stored gear` : null}
              {gearMode === 'restore' && artifactMode === 'restore' ? ' and ' : null}
              {artifactMode === 'restore'
                ? `delete all ${plan.artifacts.wipe_count} stored artifacts`
                : null}
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="modal-actions">
        <Button variant="cancel" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" disabled={!file || busy} onClick={() => void preview()}>
          Preview
        </Button>
        <Button
          variant="accent"
          disabled={!plan || busy || (needsWipe && !confirmedWipe)}
          onClick={() => void apply()}
        >
          Import
        </Button>
      </div>
    </Modal>
  );
}
