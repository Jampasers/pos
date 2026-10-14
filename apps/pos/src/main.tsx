import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { Workspace } from '@pos/ui';
import './style.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing');
createRoot(container).render(<StrictMode><BrowserRouter><Routes>
  <Route path="/" element={<Navigate to="/workspace" replace />} />
  <Route path="/workspace" element={<Workspace mode="pos" apiUrl={import.meta.env.VITE_API_URL ?? 'http://localhost:4000'} />} />
  <Route path="*" element={<main className="grid min-h-screen content-center justify-center gap-4"><h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1><Link className="text-primary underline" to="/workspace">Kembali ke ruang kerja</Link></main>} />
</Routes></BrowserRouter></StrictMode>);
