'use client';

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Membership, Session } from '@pos/contracts';
import { ApiClient, ApiError } from './client.js';
import { Button, cn, Input } from './button.js';

const createSelectionStore = () => createStore<{ tenantId: string; outletId: string; selectTenant: (id: string) => void; selectOutlet: (id: string) => void; reset: () => void }>(set => ({
  tenantId: '', outletId: '', selectTenant: tenantId => set({ tenantId, outletId: '' }), selectOutlet: outletId => set({ outletId }), reset: () => set({ tenantId: '', outletId: '' }),
}));
const SelectionContext = createContext<ReturnType<typeof createSelectionStore> | null>(null);
function useSelection() {
  const store = useContext(SelectionContext);
  if (!store) throw new Error('Selection provider is missing');
  return useStore(store);
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return ({ INVALID_CREDENTIALS: 'Email atau password salah.', PERMISSION_FORBIDDEN: 'Akun ini tidak memiliki izin untuk tindakan tersebut.', TENANT_FORBIDDEN: 'Akses merchant sudah tidak tersedia.', CONFLICT: 'Kode outlet sudah digunakan.', DEVICE_CONFLICT: 'ID perangkat sudah digunakan atau dicabut.', RATE_LIMITED: 'Terlalu banyak percobaan. Coba lagi sebentar.', UNAUTHENTICATED: 'Sesi berakhir. Silakan masuk kembali.' } as Record<string, string>)[error.code] ?? error.message;
  }
  return 'Layanan belum dapat dihubungi. Periksa koneksi lalu coba lagi.';
}
function ErrorNotice({ error }: { error: unknown }) { return error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">{errorMessage(error)}</p> : null; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }

function Login({ api, mode }: { api: ApiClient; mode: 'pos' | 'admin' }) {
  const queryClient = useQueryClient();
  const selection = useSelection();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: () => api.login(email, password), onSuccess: session => { setPassword(''); selection.reset(); queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); queryClient.setQueryData(['session'], session); } });
  return <div className="grid min-h-screen lg:grid-cols-2">
    <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
      <div className="text-2xl font-bold tracking-tight">Danka POS<span className="ml-3 rounded-full border border-white/30 px-3 py-1 text-xs font-normal">F&B</span></div>
      <div className="max-w-lg"><p className="mb-5 text-sm uppercase tracking-widest opacity-75">Operasional merchant</p><h1 className="text-5xl font-semibold leading-tight">Satu tempat untuk setiap outlet.</h1><p className="mt-6 text-lg opacity-85">Akses sesuai peran. Outlet yang terpisah. Perangkat yang terdaftar.</p></div>
      <p className="text-sm opacity-80">{mode === 'pos' ? 'Ruang kerja kasir' : 'Dashboard merchant'}</p>
    </aside>
    <main className="flex items-center justify-center bg-background px-6 py-12"><form onSubmit={(event: FormEvent) => { event.preventDefault(); login.mutate(); }} className="grid w-full max-w-sm gap-5">
      <div className="mb-3"><p className="mb-3 text-sm font-semibold text-primary">Danka POS / {mode === 'pos' ? 'Kasir' : 'Merchant'}</p><h1 className="text-3xl font-semibold tracking-tight">Masuk ke ruang kerja</h1><p className="mt-3 text-sm text-muted-foreground">Gunakan akun staf yang sudah terdaftar.</p></div>
      <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></Field>
      <ErrorNotice error={login.error} />
      <Button type="submit" disabled={login.isPending}>{login.isPending ? 'Memeriksa akun…' : 'Masuk'}</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">Penjualan belum diaktifkan pada versi ini. Hubungi pengelola merchant untuk akses akun.</p>
    </form></main>
  </div>;
}

function OutletForm({ api, membership, csrf }: { api: ApiClient; membership: Membership; csrf: string }) {
  const client = useQueryClient();
  const [name, setName] = useState(''), [code, setCode] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const createOutlet = useMutation({ mutationFn: () => api.createOutlet(membership.tenantId, csrf, { name, code, timezone }), onSuccess: () => { setName(''); setCode(''); void client.invalidateQueries({ queryKey: ['outlets', membership.tenantId] }); } });
  return <form onSubmit={event => { event.preventDefault(); createOutlet.mutate(); }} className="grid gap-4 rounded-xl border border-border bg-card p-5">
    <h3 className="font-semibold">Tambah outlet</h3><Field label="Nama outlet"><Input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></Field>
    <Field label="Kode outlet"><Input required pattern="[A-Z0-9_-]+" maxLength={20} value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="BKS" /></Field>
    <Field label="Zona waktu"><Input required maxLength={64} value={timezone} onChange={event => setTimezone(event.target.value)} /></Field>
    <ErrorNotice error={createOutlet.error} /><Button type="submit" disabled={createOutlet.isPending}>{createOutlet.isPending ? 'Menyimpan…' : 'Simpan outlet'}</Button>
  </form>;
}

function DevicePanel({ api, tenantId, outletId, csrf }: { api: ApiClient; tenantId: string; outletId: string; csrf: string }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  // Keep the same UUID across retries after an ambiguous network response.
  const [pendingId, setPendingId] = useState(() => crypto.randomUUID());
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const devices = useInfiniteQuery({ queryKey: ['devices', tenantId, outletId], initialPageParam: null as string | null, queryFn: ({ pageParam }) => api.devices(tenantId, outletId, pageParam), getNextPageParam: last => last.page.nextCursor ?? undefined });
  const register = useMutation({ mutationFn: () => api.registerDevice(tenantId, outletId, csrf, { id: pendingId, name, platform: 'web' }), onSuccess: () => { setName(''); setPendingId(crypto.randomUUID()); void client.invalidateQueries({ queryKey: ['devices', tenantId, outletId] }); } });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeDevice(tenantId, outletId, id, csrf), onSuccess: () => { setConfirmation(null); void client.invalidateQueries({ queryKey: ['devices', tenantId, outletId] }); } });
  return <section className="rounded-xl border border-border bg-card p-5">
    <div className="mb-5"><h3 className="font-semibold">Perangkat outlet</h3><p className="mt-1 text-sm text-muted-foreground">Kelola daftar perangkat yang diizinkan untuk outlet ini.</p></div>
    <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); register.mutate(); }}><div className="min-w-48 flex-1"><Field label="Nama perangkat"><Input required maxLength={120} value={name} disabled={register.isPending} onChange={event => setName(event.target.value)} placeholder="Kasir utama" /></Field></div><Button type="submit" disabled={register.isPending}>{register.isPending ? 'Mendaftarkan…' : 'Daftarkan perangkat'}</Button></form>
    <ErrorNotice error={register.error ?? revoke.error ?? devices.error} />
    {devices.isPending && <p role="status" className="text-sm text-muted-foreground">Memuat perangkat…</p>}
    {devices.data?.pages.flatMap(page => page.data).map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4"><div><p className="font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{device.platform} · {device.revokedAt ? 'Akses dicabut' : 'Terdaftar'}</p></div>{!device.revokedAt && <Button variant="outline" onClick={() => setConfirmation(device.id)}>Cabut akses {device.name}</Button>}</div>)}
    {devices.data && !devices.data.pages.some(page => page.data.length) && <p className="text-sm text-muted-foreground">Belum ada perangkat terdaftar.</p>}
    {devices.hasNextPage && <Button variant="outline" disabled={devices.isFetchingNextPage} onClick={() => { void devices.fetchNextPage(); }}>Muat perangkat berikutnya</Button>}
    {confirmation && <div role="alertdialog" aria-label="Konfirmasi pencabutan perangkat" className="mt-4 rounded-lg border border-destructive/40 p-4"><p className="mb-3 text-sm">Cabut registrasi perangkat ini? Registrasi yang dicabut tidak dapat dipakai kembali.</p><div className="flex gap-2"><Button variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(confirmation)}>Ya, cabut akses</Button><Button variant="outline" onClick={() => setConfirmation(null)}>Batal</Button></div></div>}
  </section>;
}

function Portal({ api, session, mode }: { api: ApiClient; session: Session; mode: 'pos' | 'admin' }) {
  const selection = useSelection();
  const client = useQueryClient();
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const membership = session.memberships.find(item => item.tenantId === selection.tenantId) ?? session.memberships[0];
  const logout = useMutation({ mutationFn: () => api.logout(session.csrfToken), onSuccess: () => { selection.reset(); client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); client.setQueryData(['session'], null); } });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health(), refetchInterval: 30000, retry: false });
  return <div className="min-h-screen bg-background text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-5 py-4 md:px-8"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">D</div><div><p className="font-bold tracking-tight">Danka POS</p><p className="text-xs text-muted-foreground">{mode === 'pos' ? 'Ruang kerja kasir' : 'Dashboard merchant'}</p></div></div><div className="flex flex-wrap items-center gap-3"><span role="status" className={cn('rounded-full px-3 py-1.5 text-xs font-medium', health.isSuccess ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{health.isSuccess ? 'Cloud terhubung' : 'Cloud belum terhubung'}</span><Button variant="ghost" onClick={() => setDark(!dark)} aria-pressed={dark}>Mode {dark ? 'terang' : 'gelap'}</Button><Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>Keluar</Button></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7 md:px-8"><ErrorNotice error={logout.error} /><div className="mb-7 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-sm text-muted-foreground">Selamat datang, {session.user.name}</p><h1 className="text-3xl font-semibold tracking-tight">{mode === 'pos' ? 'Pilih outlet kerja' : 'Kelola outlet'}</h1><p className="mt-2 text-sm text-muted-foreground">Akses outlet mengikuti izin akun Anda.</p></div><label className="grid min-w-56 gap-2 text-sm font-medium">Merchant<select aria-label="Merchant" className="min-h-11 rounded-lg border border-border bg-card px-3" value={membership?.tenantId ?? ''} onChange={event => selection.selectTenant(event.target.value)}>{session.memberships.map(item => <option key={item.tenantId} value={item.tenantId}>{item.tenantName}</option>)}</select></label></div>
    {!membership ? <div className="rounded-xl border border-border bg-card p-8"><h2 className="font-semibold">Belum ada akses merchant</h2><p className="mt-2 text-sm text-muted-foreground">Hubungi pengelola untuk mengaktifkan keanggotaan akun.</p></div> : <OutletWorkspace key={membership.tenantId} api={api} session={session} membership={membership} mode={mode} />}</main>
  </div>;
}

function OutletWorkspace({ api, session, membership, mode }: { api: ApiClient; session: Session; membership: Membership; mode: 'pos' | 'admin' }) {
  const selection = useSelection();
  const outlets = useInfiniteQuery({ queryKey: ['outlets', membership.tenantId, session.user.id], initialPageParam: null as string | null, queryFn: ({ pageParam }) => api.outlets(membership.tenantId, pageParam), getNextPageParam: last => last.page.nextCursor ?? undefined });
  const allOutlets = outlets.data?.pages.flatMap(page => page.data) ?? [];
  const selected = allOutlets.find(item => item.id === selection.outletId);
  const canManage = membership.permissions.includes('outlet:manage') && membership.allOutlets;
  return <div className={cn('grid gap-6', mode === 'admin' && canManage && 'lg:grid-cols-[1fr_320px]')}>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{membership.tenantName}</h2><span className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">{membership.role.replaceAll('_', ' ')}</span></div>
      <ErrorNotice error={outlets.error} />{outlets.isPending && <p role="status">Memuat outlet…</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{allOutlets.map(outlet => <button key={outlet.id} onClick={() => selection.selectOutlet(outlet.id)} aria-pressed={selected?.id === outlet.id} className={cn('min-h-36 rounded-xl border bg-card p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected?.id === outlet.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60')}><span className="mb-4 inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">{outlet.code}</span><p className="text-lg font-semibold">{outlet.name}</p><p className="mt-1 text-xs text-muted-foreground">{outlet.timezone}</p></button>)}</div>
      {outlets.data && !allOutlets.length && <p className="mb-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Belum ada outlet yang dapat diakses.</p>}
      {outlets.hasNextPage && <Button variant="outline" disabled={outlets.isFetchingNextPage} onClick={() => { void outlets.fetchNextPage(); }}>Muat outlet berikutnya</Button>}
      {selected && <div className="mb-5 rounded-xl border border-border bg-card p-5"><h3 className="font-semibold">Outlet aktif: {selected.name}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Penjualan, shift dan pengiriman pesanan ke dapur belum diaktifkan. Outlet ini sudah dapat dipilih dan administrasi perangkat tersedia sesuai izin akun.</p></div>}
      {selected && membership.permissions.includes('device:manage') && <DevicePanel key={`${membership.tenantId}:${selected.id}`} api={api} tenantId={membership.tenantId} outletId={selected.id} csrf={session.csrfToken} />}
    </section>
    {mode === 'admin' && canManage && <aside><OutletForm api={api} membership={membership} csrf={session.csrfToken} /></aside>}
  </div>;
}

function AuthenticatedApp({ api, mode }: { api: ApiClient; mode: 'pos' | 'admin' }) {
  const query = useQuery({ queryKey: ['session'], queryFn: () => api.session(), retry: false, refetchInterval: 60000 });
  if (query.isPending) return <main className="flex min-h-screen items-center justify-center bg-background text-foreground"><p role="status">Memeriksa sesi…</p></main>;
  if (query.error) return <main className="mx-auto grid min-h-screen max-w-md content-center gap-4 px-6"><h1 className="text-2xl font-semibold">Layanan belum tersedia</h1><ErrorNotice error={query.error} /><Button onClick={() => { void query.refetch(); }}>Coba lagi</Button></main>;
  return query.data ? <Portal api={api} session={query.data} mode={mode} /> : <Login api={api} mode={mode} />;
}

export function Workspace({ apiUrl, mode }: { apiUrl: string; mode: 'pos' | 'admin' }) {
  const [selectionStore] = useState(createSelectionStore);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1 }, mutations: { retry: false } } }));
  const api = useMemo(() => new ApiClient(apiUrl), [apiUrl]);
  return <SelectionContext.Provider value={selectionStore}><QueryClientProvider client={queryClient}><AuthenticatedApp api={api} mode={mode} /></QueryClientProvider></SelectionContext.Provider>;
}
