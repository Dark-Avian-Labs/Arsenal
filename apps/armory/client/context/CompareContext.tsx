import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';

import type { EquipmentType } from '../types/warframe';
import type { WeaponCalcResult } from '../utils/damageCalc';
import type { DamageEntry } from '../utils/elements';

export interface CompareSnapshot {
  id: string;
  label: string;
  weaponName: string;
  weaponImage?: string;
  equipmentType: EquipmentType;
  calc: WeaponCalcResult;
  elementBreakdown: DamageEntry[];
  totalElementDamage: number;
  timestamp: number;
}

interface CompareState {
  snapshots: CompareSnapshot[];
}

type CompareAction =
  | { type: 'ADD_SNAPSHOT'; snapshot: CompareSnapshot }
  | { type: 'REMOVE_SNAPSHOT'; id: string }
  | { type: 'CLEAR_ALL' };

const MAX_SNAPSHOTS = 3;

function compareReducer(state: CompareState, action: CompareAction): CompareState {
  switch (action.type) {
    case 'ADD_SNAPSHOT': {
      const next = [...state.snapshots, action.snapshot];
      if (next.length > MAX_SNAPSHOTS) next.shift();
      return { snapshots: next };
    }
    case 'REMOVE_SNAPSHOT':
      return { snapshots: state.snapshots.filter((s) => s.id !== action.id) };
    case 'CLEAR_ALL':
      return { snapshots: [] };
    default:
      return state;
  }
}

interface CompareContextValue {
  snapshots: CompareSnapshot[];
  addSnapshot: (snapshot: CompareSnapshot) => void;
  removeSnapshot: (id: string) => void;
  clearAll: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(compareReducer, { snapshots: [] });

  const addSnapshot = useCallback(
    (snapshot: CompareSnapshot) => dispatch({ type: 'ADD_SNAPSHOT', snapshot }),
    [],
  );
  const removeSnapshot = useCallback((id: string) => dispatch({ type: 'REMOVE_SNAPSHOT', id }), []);
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      snapshots: state.snapshots,
      addSnapshot,
      removeSnapshot,
      clearAll,
    }),
    [state.snapshots, addSnapshot, removeSnapshot, clearAll],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
