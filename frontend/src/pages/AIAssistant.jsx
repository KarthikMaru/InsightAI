// File path: frontend/src/pages/AIAssistant.jsx
// Purpose: Two modes over the same chat UI:
//  - "Ask" (default): grounded business Q&A — backend retrieves real
//    analytics data first, then Gemini answers using only that data.
//  - "SQL": natural-language-to-SQL — shows the generated (validated,
//    SELECT-only) SQL, the actual result rows, and a plain-English
//    explanation, exactly like a transparent BI tool should.

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Send, Loader2, Database, MessageCircle, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import useDatasets from '../hooks/useDatasets';
import aiService from '../services/aiService';

const SUGGESTED_QUESTIONS = [
  'What were my best performing products?',
  'Which region generated the highest profit?',
  'Which products should I focus on?',
  'Show me the top 5 products by revenue.',
];

function SqlResultTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-slate-400 mt-2">No rows returned.</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto mt-2 border border-slate-200 rounded-lg">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left px-3 py-2 font-medium text-slate-600 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AIAssistant() {
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const [mode, setMode] = useState('ask'); // 'ask' | 'sql'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (questionOverride) => {
    const question = (questionOverride || input).trim();
    if (!question || !selectedId) return;

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setSending(true);

    try {
      if (mode === 'ask') {
        const data = await aiService.chat(selectedId, question);
        setMessages((prev) => [...prev, { role: 'assistant', kind: 'answer', content: data.answer }]);
      } else {
        const data = await aiService.textToSql(selectedId, question);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            kind: 'sql',
            sql: data.generatedSql,
            result: data.result,
            explanation: data.explanation,
          },
        ]);
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Something went wrong. Please try again.';
      toast.error(message);
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'error', content: message }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col h-[calc(100vh-64px)]">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="text-brand-600" size={22} /> AI Business Assistant
            </h1>
            <p className="text-slate-600 mt-1 text-sm">Answers are grounded in your actual data — nothing invented.</p>
          </div>
          {datasets.length > 0 && (
            <DatasetSelector datasets={datasets} selectedId={selectedId} onChange={selectDataset} />
          )}
        </div>

        {loadingDatasets ? (
          <p className="text-slate-500 text-sm">Loading your datasets...</p>
        ) : datasets.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <UploadCloud className="mx-auto text-brand-600 mb-3" size={36} />
            <h2 className="font-semibold text-slate-900 text-lg">Upload a dataset first</h2>
            <p className="text-slate-600 text-sm mt-1 mb-5">The AI assistant needs your data to answer questions.</p>
            <Link to="/upload" className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700">
              Go to Upload
            </Link>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode('ask')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  mode === 'ask' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                <MessageCircle size={16} /> Ask a question
              </button>
              <button
                onClick={() => setMode('sql')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  mode === 'sql' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                <Database size={16} /> Ask in SQL (Natural Language → SQL)
              </button>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-slate-500 mb-3">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        className="text-sm bg-brand-50 text-brand-700 px-3 py-1.5 rounded-full hover:bg-brand-100"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  {m.role === 'user' ? (
                    <div className="bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-lg text-sm">
                      {m.content}
                    </div>
                  ) : m.kind === 'error' ? (
                    <div className="bg-red-50 text-red-700 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-lg text-sm">
                      {m.content}
                    </div>
                  ) : m.kind === 'answer' ? (
                    <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg text-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl text-sm w-full">
                      <p className="text-xs font-semibold text-slate-500 mb-1">GENERATED SQL</p>
                      <pre className="bg-slate-900 text-emerald-300 text-xs rounded-lg p-3 overflow-x-auto">{m.sql}</pre>
                      <p className="text-xs font-semibold text-slate-500 mt-3 mb-1">RESULT</p>
                      <SqlResultTable rows={m.result} />
                      <p className="text-xs font-semibold text-slate-500 mt-3 mb-1">BUSINESS EXPLANATION</p>
                      <p className="text-slate-700">{m.explanation}</p>
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="animate-spin" size={16} /> Thinking...
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={mode === 'ask' ? 'Ask a question about your business...' : 'e.g. Show top 5 products by revenue'}
                className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={() => handleSend()}
                disabled={sending || !input.trim()}
                className="bg-brand-600 text-white p-3 rounded-xl hover:bg-brand-700 disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
