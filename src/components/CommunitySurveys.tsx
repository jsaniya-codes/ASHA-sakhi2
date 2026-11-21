import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type {
  AuthUser,
  CommunitySurvey,
  FamilyRecord,
  SurveyQuestion,
  SurveyResponseRecord,
} from '../types';

interface CommunitySurveysProps {
  surveys: CommunitySurvey[];
  families: FamilyRecord[];
  user: AuthUser | null;
  authToken: string | null;
  onRequestAuth: () => void;
  onRefresh: () => Promise<void>;
}

export function CommunitySurveys({
  surveys,
  families,
  user,
  authToken,
  onRequestAuth,
  onRefresh,
}: CommunitySurveysProps) {
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(surveys[0]?.id ?? null);
  const [responses, setResponses] = useState<SurveyResponseRecord[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // Create survey modal
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('Sanitation & Hygiene');
  const [village, setVillage] = useState('All Villages');
  const [district, setDistrict] = useState(user?.district || 'Raichur');
  const [targetHouseholds, setTargetHouseholds] = useState('15');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([
    { id: 'q1', prompt: 'Does the household have access to safe drinking water?', type: 'yes_no' },
    { id: 'q2', prompt: 'Are mosquito nets used by children and pregnant women?', type: 'yes_no' },
  ]);

  // Collect response modal
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [respFamilyId, setRespFamilyId] = useState('');
  const [respName, setRespName] = useState('');
  const [respVillage, setRespVillage] = useState('');
  const [respAnswers, setRespAnswers] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSurvey = surveys.find((s) => s.id === selectedSurveyId) || surveys[0] || null;

  useEffect(() => {
    if (!selectedSurvey) {
      setResponses([]);
      return;
    }
    if (selectedSurveyId !== selectedSurvey.id) {
      setSelectedSurveyId(selectedSurvey.id);
    }
    let cancelled = false;
    setLoadingResponses(true);
    fetch(`/api/surveys/${selectedSurvey.id}/responses`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })
      .then((res) => parseApiResponse<{ responses: SurveyResponseRecord[] }>(res, 'Could not load responses.'))
      .then((data) => {
        if (!cancelled) setResponses(data.responses || []);
      })
      .catch(() => {
        if (!cancelled) setResponses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingResponses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSurvey?.id, authToken]);

  const handleAddQuestionRow = () => {
    setQuestions((prev) => [
      ...prev,
      { id: `q${prev.length + 1}`, prompt: '', type: 'yes_no' },
    ]);
  };

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      onRequestAuth();
      return;
    }
    const cleanQuestions = questions.filter((q) => q.prompt.trim().length > 0);
    if (cleanQuestions.length === 0) {
      setErrorMsg('Please add at least one survey question.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          topic,
          village: village.trim() || 'All Villages',
          district,
          target_households: Number(targetHouseholds) || 10,
          questions: cleanQuestions,
        }),
      });
      const data = await parseApiResponse<{ survey: CommunitySurvey }>(res, 'Could not create survey.');
      setShowCreateSurvey(false);
      setTitle('');
      setSelectedSurveyId(data.survey.id);
      setStatusMsg(`Created community survey "${data.survey.title}".`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Survey creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectFamilyForResponse = (fid: string) => {
    setRespFamilyId(fid);
    const fam = families.find((f) => String(f.id) === fid);
    if (fam) {
      setRespName(fam.head_name);
      setRespVillage(fam.village);
    }
  };

  const handleSubmitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurvey) return;
    if (!authToken) {
      onRequestAuth();
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/surveys/${selectedSurvey.id}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          family_id: respFamilyId ? Number(respFamilyId) : null,
          respondent_name: respName.trim(),
          village: respVillage.trim() || selectedSurvey.village,
          answers: respAnswers,
          status: 'Completed',
        }),
      });
      await parseApiResponse(res, 'Could not submit survey response.');
      setShowCollectModal(false);
      setRespName('');
      setRespAnswers({});
      setStatusMsg(`Recorded household survey response for "${selectedSurvey.title}".`);
      await onRefresh();
      // Refresh responses list
      const rRes = await fetch(`/api/surveys/${selectedSurvey.id}/responses`, {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      const rData = await parseApiResponse<{ responses: SurveyResponseRecord[] }>(rRes, 'Could not reload responses.');
      setResponses(rData.responses || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save response.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportPdf = () => {
    if (!selectedSurvey) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`AshaSakhi Community Survey Report — ${selectedSurvey.title}`, 40, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(
      `Topic: ${selectedSurvey.topic} · Village: ${selectedSurvey.village}, ${selectedSurvey.district} · Responses: ${responses.length}/${selectedSurvey.target_households}`,
      40,
      58
    );

    const headers = ['Respondent', 'Village', 'Submitted By', ...selectedSurvey.questions.map((q) => q.prompt.slice(0, 35))];
    const body = responses.map((r) => [
      r.respondent_name,
      r.village,
      r.submitted_by,
      ...selectedSurvey.questions.map((q) => r.answers[q.id] || '—'),
    ]);

    autoTable(doc, {
      startY: 76,
      head: [headers],
      body,
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255] },
      styles: { fontSize: 8.5, cellPadding: 5 },
    });
    doc.save(`AshaSakhi-Survey-${selectedSurvey.id}.pdf`);
  };

  const handleExportExcel = async () => {
    if (!selectedSurvey) return;
    const headRow: Row = [
      { value: 'Respondent', fontWeight: 'bold' },
      { value: 'Village', fontWeight: 'bold' },
      { value: 'Status', fontWeight: 'bold' },
      { value: 'Submitted By', fontWeight: 'bold' },
      ...selectedSurvey.questions.map((q) => ({ value: q.prompt, fontWeight: 'bold' as const })),
    ];
    const data: SheetData = [
      headRow,
      ...responses.map((r): Row => [
        { value: r.respondent_name, type: String },
        { value: r.village, type: String },
        { value: r.status, type: String },
        { value: r.submitted_by, type: String },
        ...selectedSurvey.questions.map((q) => ({ value: r.answers[q.id] || '', type: String })),
      ]),
    ];
    await writeXlsxFile([{ sheet: 'Survey Responses', data }]).toFile(
      `AshaSakhi-Survey-${selectedSurvey.id}.xlsx`
    );
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e7e0] bg-white p-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Village Community Health Surveys</h2>
          <p className="text-xs text-slate-500">
            Create household questionnaires, collect village responses, and export tabulated reports.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!authToken) {
              onRequestAuth();
              return;
            }
            setShowCreateSurvey(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
        >
          <Plus className="h-4 w-4" />
          New Community Survey
        </button>
      </div>

      {statusMsg && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            {statusMsg}
          </span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Surveys List */}
        <section className="xl:col-span-4 space-y-3">
          {surveys.map((s) => {
            const active = selectedSurvey?.id === s.id;
            const completed = s.completed_count ?? 0;
            const pct = Math.min(100, Math.round((completed / Math.max(1, s.target_households)) * 100));
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSurveyId(s.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  active ? 'border-[#1f6f5c] bg-white shadow-xs' : 'border-[#e2e7e0] bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#1f6f5c]">{s.topic}</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {completed}/{s.target_households}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-bold text-slate-900">{s.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {s.village}, {s.district} · {s.questions.length} questions
                </p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#1f6f5c]" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </section>

        {/* Right: Active Survey Detail & Responses */}
        <section className="xl:col-span-8 rounded-xl border border-[#e2e7e0] bg-white p-5">
          {!selectedSurvey ? (
            <div className="py-16 text-center text-sm text-slate-500">Select or create a survey to view responses.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-semibold text-[#1f6f5c]">
                    {selectedSurvey.topic} · {selectedSurvey.village}, {selectedSurvey.district}
                  </p>
                  <h3 className="mt-0.5 text-lg font-bold text-slate-900">{selectedSurvey.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    Completed: <strong>{selectedSurvey.completed_count ?? responses.length}</strong> · Pending Target:{' '}
                    <strong>{Math.max(0, selectedSurvey.target_households - (selectedSurvey.completed_count ?? responses.length))}</strong>{' '}
                    · Target Households: <strong>{selectedSurvey.target_households}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!authToken) {
                        onRequestAuth();
                        return;
                      }
                      setRespAnswers({});
                      setShowCollectModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f6f5c] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#185848]"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Collect Household Response
                  </button>
                </div>
              </div>

              {/* Per-Question Live Summary */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectedSurvey.questions.map((q, idx) => {
                  const answered = responses.map((r) => r.answers[q.id]).filter(Boolean);
                  const yesCount = answered.filter((a) => a.toLowerCase() === 'yes').length;
                  return (
                    <div key={q.id} className="rounded-lg bg-[#f4f6f2] p-3.5 text-xs">
                      <p className="font-semibold text-slate-900">
                        Q{idx + 1}. {q.prompt}
                      </p>
                      {q.type === 'yes_no' ? (
                        <p className="mt-1.5 text-slate-600 tabular-nums">
                          Yes: <strong className="text-[#1f6f5c]">{yesCount}</strong> · No:{' '}
                          <strong className="text-red-700">{answered.length - yesCount}</strong> ({answered.length} total)
                        </p>
                      ) : (
                        <p className="mt-1.5 text-slate-600 tabular-nums">{answered.length} household answers recorded</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Responses Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-800">Recorded Household Responses ({responses.length})</h4>
                {loadingResponses ? (
                  <p className="py-6 text-center text-xs text-slate-500">Loading survey responses...</p>
                ) : responses.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500">
                    No responses submitted yet. Click &ldquo;Collect Household Response&rdquo; to log the first visit.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-[#f9faf8] text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Respondent</th>
                          <th className="px-3 py-2.5">Village</th>
                          {selectedSurvey.questions.map((q, idx) => (
                            <th key={q.id} className="px-3 py-2.5">
                              Q{idx + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {responses.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{r.respondent_name}</td>
                            <td className="px-3 py-2.5 text-slate-600">{r.village}</td>
                            {selectedSurvey.questions.map((q) => (
                              <td key={q.id} className="px-3 py-2.5 text-slate-700">
                                {r.answers[q.id] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* CREATE SURVEY MODAL */}
      {showCreateSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Create Community Health Survey</h3>
              <button type="button" onClick={() => setShowCreateSurvey(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSurvey} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Survey Title *</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Monsoon Dengue & Clean Water Drive"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Health Topic</label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Sanitation & Hygiene">Sanitation & Hygiene</option>
                    <option value="Maternal & Nutrition">Maternal & Nutrition</option>
                    <option value="Immunization Coverage">Immunization Coverage</option>
                    <option value="Vector-Borne Disease">Vector-Borne Disease</option>
                    <option value="Non-Communicable Diseases">Non-Communicable Diseases</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Target Households</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={targetHouseholds}
                    onChange={(e) => setTargetHouseholds(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Village</label>
                  <input
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">District</label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {KARNATAKA_DISTRICTS.map((d) => (
                      <option key={d.district} value={d.district}>
                        {d.district}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Survey Questions</label>
                  <button
                    type="button"
                    onClick={handleAddQuestionRow}
                    className="text-xs font-semibold text-[#1f6f5c] hover:underline"
                  >
                    + Add Question
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="flex items-center gap-2">
                      <input
                        value={q.prompt}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, prompt: e.target.value } : item))
                          )
                        }
                        placeholder={`Question ${idx + 1}...`}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                      />
                      <select
                        value={q.type}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, type: e.target.value as SurveyQuestion['type'] } : item
                            )
                          )
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      >
                        <option value="yes_no">Yes / No</option>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                      </select>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSurvey(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  {submitting ? 'Creating...' : 'Create Survey'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT RESPONSE MODAL */}
      {showCollectModal && selectedSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Collect Response — {selectedSurvey.title}</h3>
              <button type="button" onClick={() => setShowCollectModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitResponse} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Select Household (Optional)</label>
                <select
                  value={respFamilyId}
                  onChange={(e) => handleSelectFamilyForResponse(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Enter respondent manually --</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.family_code} — {f.head_name} ({f.village})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Respondent Name *</label>
                  <input
                    required
                    value={respName}
                    onChange={(e) => setRespName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Village *</label>
                  <input
                    required
                    value={respVillage}
                    onChange={(e) => setRespVillage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                {selectedSurvey.questions.map((q, idx) => (
                  <div key={q.id}>
                    <label className="block text-xs font-semibold text-slate-800">
                      Q{idx + 1}. {q.prompt}
                    </label>
                    {q.type === 'yes_no' ? (
                      <div className="mt-1.5 flex gap-2">
                        {['Yes', 'No'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setRespAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                            className={`rounded-lg border px-4 py-1.5 text-xs font-semibold ${
                              respAnswers[q.id] === opt
                                ? 'border-[#1f6f5c] bg-[#1f6f5c] text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : q.type === 'choice' && q.options && q.options.length > 0 ? (
                      <select
                        value={respAnswers[q.id] || ''}
                        onChange={(e) => setRespAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">-- Select --</option>
                        {q.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={q.type === 'number' ? 'number' : 'text'}
                        value={respAnswers[q.id] || ''}
                        onChange={(e) => setRespAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1f6f5c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#185848]"
                >
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
