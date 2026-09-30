// File path: frontend/src/pages/DatasetEditor.jsx
// Purpose: A spreadsheet-style editor for ANY general-purpose dataset —
// uploaded, manually created, AI-generated, or the bundled sample. Cell
// edits save on blur; rows can be added/duplicated/deleted; columns can
// be added/renamed/deleted/reordered/retyped. A column type change that
// would lose data is blocked until the user reviews a preview and
// explicitly confirms (mirrors the safety gate the backend also
// enforces — see backend/controllers/datasetEditController.js).

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, Copy, ArrowLeft, ArrowUp, ArrowDown, Loader2,
  Pencil, X, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import genericService from '../services/genericService';
import editService, { EDITABLE_TYPES } from '../services/editService';

const PAGE_SIZE = 25;

function TypeChangeModal({ datasetId, columnName, onClose, onApplied }) {
  const [newType, setNewType] = useState('Text');
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  const runPreview = useCallback(async (type) => {
    setChecking(true);
    setPreview(null);
    try {
      const result = await editService.previewTypeChange(datasetId, columnName, type);
      setPreview(result);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not preview this conversion');
    } finally {
      setChecking(false);
    }
  }, [datasetId, columnName]);

  useEffect(() => { runPreview(newType); }, [newType, runPreview]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await editService.changeColumnType(datasetId, columnName, newType, true);
      toast.success(
        result.nullifiedCount > 0
          ? `Type changed. ${result.nullifiedCount} value(s) that couldn't convert were cleared.`
          : 'Column type changed.'
      );
      onApplied(result.profile);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change column type');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="font-semibold text-slate-900">Change type of '{columnName}'</h3>
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="mt-4 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="mt-4 min-h-[60px]">
          {checking ? (
            <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Checking existing values...</p>
          ) : preview?.safe ? (
            <p className="text-sm text-emerald-700">All {preview.totalRows} values convert cleanly to {preview.newType}.</p>
          ) : preview ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{preview.wouldFailCount} of {preview.totalRows} value(s) can't convert to {preview.newType} and will be cleared.</p>
                {preview.sampleFailures.length > 0 && (
                  <p className="text-xs mt-1 text-amber-600">e.g. {preview.sampleFailures.slice(0, 3).map((f) => `"${f.value}"`).join(', ')}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button
            onClick={handleApply}
            disabled={applying || checking}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 flex items-center gap-2"
          >
            {applying && <Loader2 className="animate-spin" size={14} />}
            {preview && !preview.safe ? 'Convert anyway' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddColumnModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('Text');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error('Column name is required');
    setSaving(true);
    try {
      await onAdd(name.trim(), dataType);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-6">
        <h3 className="font-semibold text-slate-900">Add Column</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Column name"
          className="mt-4 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <select value={dataType} onChange={(e) => setDataType(e.target.value)} className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
          {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'Adding...' : 'Add Column'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} className="min-h-[28px] px-1 -mx-1 rounded hover:bg-slate-100 cursor-text truncate">
        {value === null || value === undefined || value === '' ? <span className="text-slate-300">—</span> : String(value)}
      </div>
    );
  }

  const commit = async () => {
    if (String(draft) === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const ok = await onSave(draft === '' ? null : draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <input
      autoFocus
      disabled={saving}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
      }}
      className="w-full px-1 py-0.5 -mx-1 border border-brand-400 rounded text-sm focus:outline-none"
    />
  );
}

function AiModifyPanel({ datasetId, onApplied }) {
  const [instruction, setInstruction] = useState('');
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState(null); // { token, operation, preview }
  const [error, setError] = useState(null);

  const handlePropose = async (e) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    setProposing(true);
    setError(null);
    setProposal(null);
    try {
      const result = await editService.proposeAiModification(datasetId, instruction.trim());
      setProposal(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not understand that request.');
    } finally {
      setProposing(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await editService.applyAiModification(datasetId, proposal.token);
      toast.success('Change applied');
      setProposal(null);
      setInstruction('');
      onApplied(result.profile);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not apply this change');
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = async () => {
    try { await editService.cancelAiModification(datasetId, proposal.token); } catch { /* best-effort */ }
    setProposal(null);
  };

  return (
    <div className="bg-white border border-purple-200 rounded-xl p-5 mt-6">
      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
        <span className="text-purple-600">✦</span> Ask AI to modify this dataset
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        e.g. "add a profit_margin column", "fill missing salary values with the median", "normalize department names",
        "add 20 similar rows". Nothing is changed until you review and confirm.
      </p>

      <form onSubmit={handlePropose} className="flex gap-2 mt-3">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe the change you want..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={proposing}
          className="flex items-center gap-2 bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-60"
        >
          {proposing && <Loader2 className="animate-spin" size={14} />} Propose
        </button>
      </form>

      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {proposal && (
        <div className="mt-4 border border-purple-200 bg-purple-50 rounded-lg p-4">
          <p className="font-medium text-slate-800">{proposal.preview.description}</p>
          {proposal.preview.warnings?.map((w) => (
            <p key={w} className="text-xs text-amber-700 mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {w}</p>
          ))}
          {typeof proposal.preview.affectedCount === 'number' && (
            <p className="text-xs text-slate-500 mt-1">Affects {proposal.preview.affectedCount} row(s).</p>
          )}

          {proposal.preview.sampleRows && (
            <div className="mt-3 overflow-x-auto">
              <table className="text-xs border border-slate-200 rounded bg-white">
                <thead><tr>{Object.keys(proposal.preview.sampleRows[0] || {}).map((k) => <th key={k} className="px-2 py-1 border-b text-left font-medium">{k}</th>)}</tr></thead>
                <tbody>
                  {proposal.preview.sampleRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="px-2 py-1 border-b">{v === null ? '—' : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {proposal.preview.sampleChanges && (
            <div className="mt-3 text-xs space-y-1">
              {proposal.preview.sampleChanges.slice(0, 5).map((c, i) => (
                <p key={i}><span className="text-slate-400">{String(c.before)}</span> → <span className="font-medium">{String(c.after)}</span></p>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button onClick={handleApply} disabled={applying} className="flex items-center gap-2 bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-60">
              {applying && <Loader2 className="animate-spin" size={14} />} Confirm & Apply
            </button>
            <button onClick={handleCancel} className="text-sm font-medium text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DatasetEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState(null);
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'addColumn' | 'changeType', columnName? }

  const load = useCallback((page = 1) => {
    setLoading(true);
    Promise.all([
      genericService.getProfile(id),
      genericService.getRecords(id, { page, pageSize: PAGE_SIZE, sortDir: 'asc' }),
    ])
      .then(([profileRes, recordsRes]) => {
        setDataset(profileRes.dataset);
        setProfile(profileRes.profile);
        setRecords(recordsRes.records);
        setPagination(recordsRes.pagination);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Could not load this dataset'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(1); }, [load]);

  const refreshProfileOnly = (newProfile) => setProfile(newProfile);

  const handleCellSave = async (rowId, columnName, newValue) => {
    try {
      await editService.updateRow(id, rowId, { [columnName]: newValue });
      setRecords((rows) => rows.map((r) => (r.id === rowId ? { ...r, [columnName]: newValue } : r)));
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save this value');
      return false;
    }
  };

  const handleAddRow = async () => {
    const emptyValues = {};
    (profile?.columns || []).forEach((c) => { emptyValues[c.name] = null; });
    try {
      await editService.addRow(id, emptyValues);
      toast.success('Row added');
      load(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add row');
    }
  };

  const handleDeleteRow = async (rowId) => {
    if (!window.confirm('Delete this row?')) return;
    try {
      await editService.deleteRow(id, rowId);
      toast.success('Row deleted');
      load(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete row');
    }
  };

  const handleDuplicateRow = async (rowId) => {
    try {
      await editService.duplicateRow(id, rowId);
      toast.success('Row duplicated');
      load(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not duplicate row');
    }
  };

  const handleRenameColumn = async (oldName) => {
    const newName = window.prompt(`Rename column '${oldName}' to:`, oldName);
    if (!newName || newName.trim() === oldName) return;
    try {
      const result = await editService.renameColumn(id, oldName, newName.trim());
      refreshProfileOnly(result.profile);
      load(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not rename column');
    }
  };

  const handleDeleteColumn = async (columnName) => {
    if (!window.confirm(`Delete column '${columnName}'? This removes its data from every row.`)) return;
    try {
      const result = await editService.deleteColumn(id, columnName);
      refreshProfileOnly(result.profile);
      load(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete column');
    }
  };

  const handleMoveColumn = async (columnName, direction) => {
    const names = profile.columns.map((c) => c.name);
    const idx = names.indexOf(columnName);
    const swapWith = direction === 'left' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= names.length) return;
    [names[idx], names[swapWith]] = [names[swapWith], names[idx]];
    try {
      const result = await editService.reorderColumns(id, names);
      refreshProfileOnly(result.profile);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reorder columns');
    }
  };

  const handleAddColumn = async (name, dataType) => {
    try {
      const result = await editService.addColumn(id, name, dataType);
      refreshProfileOnly(result.profile);
      toast.success(`Column '${name}' added`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add column');
      throw err;
    }
  };

  if (loading && !profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full py-20">
          <Loader2 className="animate-spin text-brand-600" size={28} />
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) return null;

  return (
    <DashboardLayout>
      <div className="px-8 py-8">
        <button onClick={() => navigate('/upload')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ArrowLeft size={14} /> Back to datasets
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{dataset?.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {profile.rowCount.toLocaleString()} rows · {profile.columnCount} columns · edits save automatically
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setModal({ type: 'addColumn' })}
              className="flex items-center gap-2 text-sm font-medium border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              <Plus size={16} /> Add Column
            </button>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-2 text-sm font-medium bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
            >
              <Plus size={16} /> Add Row
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <Loader2 className="animate-spin text-brand-600" size={24} />
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 w-24 text-left font-medium text-slate-500">Actions</th>
                {profile.columns.map((col, i) => (
                  <th key={col.name} className="px-3 py-2 text-left font-medium text-slate-700 min-w-[160px]">
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate">
                        <span>{col.name}</span>
                        <span className="block text-[10px] font-normal text-slate-400">{col.inferredType}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => handleMoveColumn(col.name, 'left')} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move left"><ArrowUp size={12} className="rotate-[-90deg]" /></button>
                        <button onClick={() => handleMoveColumn(col.name, 'right')} disabled={i === profile.columns.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move right"><ArrowDown size={12} className="rotate-[-90deg]" /></button>
                        <button onClick={() => handleRenameColumn(col.name)} className="text-slate-400 hover:text-brand-600" title="Rename"><Pencil size={12} /></button>
                        <button onClick={() => setModal({ type: 'changeType', columnName: col.name })} className="text-[10px] font-medium text-slate-400 hover:text-brand-600 border border-slate-200 rounded px-1" title="Change type">T</button>
                        <button onClick={() => handleDeleteColumn(col.name)} className="text-slate-400 hover:text-red-600" title="Delete column"><X size={12} /></button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={profile.columns.length + 1} className="text-center text-slate-400 py-10">No rows yet — click "Add Row" to get started.</td></tr>
              ) : (
                records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDuplicateRow(row.id)} className="text-slate-400 hover:text-brand-600" title="Duplicate row"><Copy size={14} /></button>
                        <button onClick={() => handleDeleteRow(row.id)} className="text-slate-400 hover:text-red-600" title="Delete row"><Trash2 size={14} /></button>
                      </div>
                    </td>
                    {profile.columns.map((col) => (
                      <td key={col.name} className="px-3 py-1.5">
                        <EditableCell
                          value={row[col.name]}
                          onSave={(newValue) => handleCellSave(row.id, col.name, newValue)}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <p>{pagination.total} total rows</p>
          <div className="flex items-center gap-3">
            <button onClick={() => load(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1} className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button onClick={() => load(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page >= pagination.totalPages} className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>

        <AiModifyPanel datasetId={id} onApplied={(newProfile) => { refreshProfileOnly(newProfile); load(pagination.page); }} />
      </div>

      {modal?.type === 'addColumn' && (
        <AddColumnModal onClose={() => setModal(null)} onAdd={handleAddColumn} />
      )}
      {modal?.type === 'changeType' && (
        <TypeChangeModal
          datasetId={id}
          columnName={modal.columnName}
          onClose={() => setModal(null)}
          onApplied={(newProfile) => { refreshProfileOnly(newProfile); load(pagination.page); }}
        />
      )}
    </DashboardLayout>
  );
}
