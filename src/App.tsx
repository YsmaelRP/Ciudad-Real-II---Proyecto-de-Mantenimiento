import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { getTechnicians, type AuthUser } from './api/auth';
import { getCategories, type Category } from './api/categories';
import { ApiError } from './api/client';
import { useAuth } from './auth/useAuth';

type Status = 'Pendiente' | 'En proceso' | 'Resuelta';
type View = 'dashboard' | 'requests' | 'new' | 'detail';

type User = AuthUser;

type HistoryEntry = {
  id: string;
  previousStatus: Status;
  newStatus: Status;
  userId: string;
  userName: string;
  at: string;
  note: string;
  type: 'created' | 'assignment' | 'status';
};

type MaintenanceRequest = {
  id: string;
  code: string;
  residentId: string;
  residentName: string;
  category: string;
  location: string;
  description: string;
  status: Status;
  createdAt: string;
  assignedTo?: string;
  assignedName?: string;
  resolution?: string;
  history: HistoryEntry[];
};

// Las solicitudes siguen siendo locales. No mezclar IDs ficticios antiguos con
// los identificadores reales de PostgreSQL ni borrar el almacenamiento anterior.
const STORAGE_KEY = 'cr2-maintenance-local-requests-v2';

const icons: Record<string, ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6"/><circle cx="17" cy="9" r="2"/><path d="M16 15c3 0 5 1.5 5 4"/></>,
  wrench: <><path d="M14 6a4 4 0 0 0-5-4l2.2 2.2-3 3L6 5a4 4 0 0 0 4 5L4 16a2.1 2.1 0 0 0 3 3l6-6a4 4 0 0 0 5-5l-2.2 2.2-3-3z"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  filter: <><path d="M4 5h16M7 12h10M10 19h4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="M6 6l12 12M18 6 6 18"/></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  building: <><path d="M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M8 19h3M18 13v2M18 18v1M2 21h20"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
};

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

const formatDate = (iso: string, withTime = true) =>
  new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(iso));

const statusClass = (status: Status) => status === 'Pendiente' ? 'pending' : status === 'En proceso' ? 'progress' : 'resolved';

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${statusClass(status)}`}><span className="status-dot"/>{status}</span>;
}

function App() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  });
  const { user: currentUser, checking, loggingOut, sessionError, login, logout, retrySession, invalidateSession } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    setView('dashboard');
    setSelectedId(null);
    setSidebarOpen(false);
    setToast(null);
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(requests)); }, [requests]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleRequests = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'resident') return requests.filter(r => r.residentId === currentUser.id);
    if (currentUser.role === 'maintenance') return requests.filter(r => r.assignedTo === currentUser.id);
    return requests;
  }, [requests, currentUser]);

  const navigate = (next: View, id?: string) => {
    setView(next);
    setSelectedId(id || null);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const notify = (title: string, text: string) => setToast({ title, text });

  if (checking) return <div className="session-screen" role="status">Comprobando sesión…</div>;
  if (!currentUser) return <Login onLogin={login} sessionError={sessionError} onRetry={retrySession}/>;

  const selected = visibleRequests.find(r => r.id === selectedId);

  return (
    <div className="app-shell">
      <Sidebar user={currentUser} view={view} open={sidebarOpen} navigate={navigate} logout={() => { void logout(); }} loggingOut={loggingOut}/>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"/>}
      <main className="main-area">
        <Header user={currentUser} onMenu={() => setSidebarOpen(true)} navigate={navigate}/>
        <div className="page-wrap">
          <div className="integration-notice" role="note">Acceso conectado a PostgreSQL. Las solicitudes todavía se guardan solo en este navegador; su integración está pendiente.</div>
          {sessionError && <div className="session-error" role="alert">{sessionError}<button type="button" disabled={loggingOut} onClick={retrySession}>Comprobar sesión</button></div>}
          {view === 'dashboard' && <Dashboard user={currentUser} requests={visibleRequests} navigate={navigate}/>}
          {view === 'requests' && <RequestList user={currentUser} requests={visibleRequests} navigate={navigate}/>}
          {view === 'new' && currentUser.role === 'resident' && <NewRequest user={currentUser} onCreate={(request) => { setRequests(prev => [request, ...prev]); notify('Solicitud registrada', `El código ${request.code} fue generado correctamente.`); navigate('detail', request.id); }} onCancel={() => navigate('requests')} onSessionExpired={invalidateSession}/>}
          {view === 'detail' && selected && <RequestDetail key={selected.id} user={currentUser} request={selected} setRequests={setRequests} notify={notify} navigate={navigate} onSessionExpired={invalidateSession}/>}
          {view === 'detail' && !selected && <EmptyState title="Solicitud no disponible" text="No tienes permiso para consultar este caso o ya no existe." onBack={() => navigate('requests')}/>}
        </div>
      </main>
      {toast && <div className="toast"><span className="toast-icon"><Icon name="check"/></span><div><strong>{toast.title}</strong><p>{toast.text}</p></div><button onClick={() => setToast(null)}><Icon name="close" size={16}/></button></div>}
    </div>
  );
}

function Login({ onLogin, sessionError, onRetry }: { onLogin: (email: string, password: string) => Promise<void>; sessionError: string; onRetry: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-content">
          <div className="brand-mark large"><Icon name="building" size={27}/></div>
          <p className="eyebrow light">Residencial Ciudad Real II</p>
          <h1>Solicitudes atendidas.<br/><span>Comunidad tranquila.</span></h1>
          <p className="login-lead">Una forma sencilla y transparente de reportar, gestionar y dar seguimiento al mantenimiento de nuestra comunidad.</p>
          <div className="login-benefits">
            <div><Icon name="file"/><span><strong>Reporta fácilmente</strong><small>Registra incidencias en pocos pasos.</small></span></div>
            <div><Icon name="clock"/><span><strong>Sigue el progreso</strong><small>Consulta cada actualización en tiempo real.</small></span></div>
            <div><Icon name="shield"/><span><strong>Acceso por rol</strong><small>Información protegida según tu perfil.</small></span></div>
          </div>
        </div>
        <div className="brand-orbit orbit-one"/>
        <div className="brand-orbit orbit-two"/>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand"><span className="brand-mark"><Icon name="building"/></span><span>Ciudad Real II</span></div>
          <p className="eyebrow">Portal de mantenimiento</p>
          <h2>Bienvenido de nuevo</h2>
          <p className="muted">Ingresa tus credenciales para continuar.</p>
          <form onSubmit={submit} className="login-form">
            <label>Correo electrónico<input type="email" autoComplete="username" disabled={submitting} value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@correo.com" required/></label>
            <label>Contraseña<input type="password" autoComplete="current-password" disabled={submitting} value={password} onChange={e => setPassword(e.target.value)} placeholder="Ingresa tu contraseña" required/></label>
            {error && <div className="form-error" role="alert"><Icon name="alert" size={17}/>{error}</div>}
            {sessionError && <div className="session-error" role="alert">{sessionError}<button type="button" disabled={submitting} onClick={onRetry}>Reintentar conexión</button></div>}
            <button className="btn primary wide" type="submit" disabled={submitting}>{submitting ? 'Ingresando…' : 'Iniciar sesión'} <Icon name="arrow"/></button>
          </form>
          <p className="demo-hint">Usa una cuenta de prueba preparada en PostgreSQL por el equipo.</p>
        </div>
        <p className="beta-note">Versión beta · Autenticación mediante API REST</p>
      </section>
    </div>
  );
}

function Sidebar({ user, view, open, navigate, logout, loggingOut }: { user: User; view: View; open: boolean; navigate: (v: View) => void; logout: () => void; loggingOut: boolean }) {
  const requestLabel = user.role === 'maintenance' ? 'Mis trabajos' : user.role === 'admin' ? 'Solicitudes' : 'Mis solicitudes';
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-mark"><Icon name="building"/></span><span><strong>Ciudad Real II</strong><small>Mantenimiento</small></span><button onClick={() => navigate('dashboard')} className="mobile-close"><Icon name="close"/></button></div>
      <nav>
        <p>MENÚ PRINCIPAL</p>
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><Icon name="home"/>Inicio</button>
        <button className={view === 'requests' || view === 'detail' ? 'active' : ''} onClick={() => navigate('requests')}><Icon name={user.role === 'maintenance' ? 'wrench' : 'file'}/>{requestLabel}</button>
        {user.role === 'resident' && <button className={view === 'new' ? 'active' : ''} onClick={() => navigate('new')}><Icon name="plus"/>Nueva solicitud</button>}
      </nav>
      <div className="sidebar-footer">
        <div className="role-badge"><Icon name="shield" size={15}/>{user.role === 'resident' ? 'Residente' : user.role === 'admin' ? 'Administrador' : 'Mantenimiento'}</div>
        <div className="side-user"><span className="avatar">{user.initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
        <button className="logout" disabled={loggingOut} onClick={logout}><Icon name="logout"/>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
      </div>
    </aside>
  );
}

function Header({ user, onMenu, navigate }: { user: User; onMenu: () => void; navigate: (v: View) => void }) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu}><Icon name="menu"/></button>
      <div><p className="topbar-title">Sistema de seguimiento</p><p className="topbar-subtitle">Residencial Ciudad Real II</p></div>
      <div className="topbar-actions">
        {user.role === 'resident' && <button className="quick-new" onClick={() => navigate('new')}><Icon name="plus" size={17}/>Nueva solicitud</button>}
        <button className="icon-button" aria-label="Notificaciones"><Icon name="bell"/><span/></button>
        <span className="avatar small">{user.initials}</span>
      </div>
    </header>
  );
}

function Dashboard({ user, requests, navigate }: { user: User; requests: MaintenanceRequest[]; navigate: (v: View, id?: string) => void }) {
  const pending = requests.filter(r => r.status === 'Pendiente').length;
  const progress = requests.filter(r => r.status === 'En proceso').length;
  const resolved = requests.filter(r => r.status === 'Resuelta').length;
  const firstName = user.name.split(' ')[0];
  const intro = user.role === 'resident' ? 'Aquí puedes consultar el estado de tus solicitudes y reportar nuevas incidencias.' : user.role === 'admin' ? 'Consulta, filtra y asigna las solicitudes de mantenimiento de la comunidad.' : 'Revisa los trabajos que tienes asignados y actualiza su progreso.';
  return (
    <>
      <section className="welcome-row">
        <div><p className="eyebrow">Panel principal</p><h1>Hola, {firstName}</h1><p>{intro}</p></div>
        <p className="date-chip"><Icon name="calendar" size={17}/>{new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
      </section>
      <section className="stats-grid">
        <StatCard icon="file" label={user.role === 'maintenance' ? 'Trabajos asignados' : 'Total de solicitudes'} value={requests.length} tone="navy"/>
        <StatCard icon="clock" label="Pendientes" value={pending} tone="amber"/>
        <StatCard icon="wrench" label="En proceso" value={progress} tone="blue"/>
        <StatCard icon="check" label="Resueltas" value={resolved} tone="teal"/>
      </section>
      {user.role === 'resident' && (
        <section className="new-banner">
          <div className="banner-icon"><Icon name="wrench" size={25}/></div>
          <div><h3>¿Necesitas reportar un problema?</h3><p>Registra una solicitud y recibe un código único para dar seguimiento.</p></div>
          <button className="btn white" onClick={() => navigate('new')}>Crear solicitud <Icon name="arrow" size={17}/></button>
        </section>
      )}
      <section className="card recent-card">
        <div className="section-heading"><div><h2>{user.role === 'maintenance' ? 'Trabajos recientes' : 'Solicitudes recientes'}</h2><p>Últimas actualizaciones registradas</p></div><button className="text-button" onClick={() => navigate('requests')}>Ver todas <Icon name="arrow" size={16}/></button></div>
        {requests.length ? <RequestTable requests={requests.slice(0, 4)} navigate={navigate} compact/> : <EmptyInline user={user}/>}
      </section>
    </>
  );
}

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon name={icon}/></span><div><strong>{value}</strong><p>{label}</p></div></article>;
}

function RequestList({ user, requests, navigate }: { user: User; requests: MaintenanceRequest[]; navigate: (v: View, id?: string) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Todas');
  const filtered = requests.filter(r => (status === 'Todas' || r.status === status) && `${r.code} ${r.category} ${r.location} ${r.residentName}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">{user.role === 'maintenance' ? 'Área de trabajo' : 'Gestión de casos'}</p><h1>{user.role === 'resident' ? 'Mis solicitudes' : user.role === 'admin' ? 'Solicitudes de mantenimiento' : 'Mis trabajos asignados'}</h1><p>{user.role === 'admin' ? 'Consulta y asigna los reportes de la comunidad.' : user.role === 'maintenance' ? 'Solo se muestran los casos asignados a tu cuenta.' : 'Consulta el progreso y el historial de tus reportes.'}</p></div>
        {user.role === 'resident' && <button className="btn primary" onClick={() => navigate('new')}><Icon name="plus"/>Nueva solicitud</button>}
      </section>
      <section className="card list-card">
        <div className="filters">
          <label className="search-box"><Icon name="search"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, categoría o ubicación..."/></label>
          <label className="select-box"><Icon name="filter" size={17}/><select value={status} onChange={e => setStatus(e.target.value)}><option>Todas</option><option>Pendiente</option><option>En proceso</option><option>Resuelta</option></select></label>
        </div>
        <div className="result-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'resultado' : 'resultados'} encontrados</div>
        {filtered.length ? <RequestTable requests={filtered} navigate={navigate} showResident={user.role === 'admin'}/> : <div className="no-results"><Icon name="search" size={30}/><h3>Sin resultados</h3><p>Prueba con otro término o cambia el filtro seleccionado.</p></div>}
      </section>
    </>
  );
}

function RequestTable({ requests, navigate, compact = false, showResident = false }: { requests: MaintenanceRequest[]; navigate: (v: View, id?: string) => void; compact?: boolean; showResident?: boolean }) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>CÓDIGO / CATEGORÍA</th>{showResident && <th>RESIDENTE</th>}<th>UBICACIÓN</th><th>FECHA</th><th>ESTADO</th><th>ASIGNADO A</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{requests.map(r => (
          <tr key={r.id} onClick={() => navigate('detail', r.id)}>
            <td><strong className="request-code">{r.code}</strong><small>{r.category}</small></td>
            {showResident && <td><span className="resident-cell"><span className="mini-avatar">{r.residentName.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>{r.residentName}</span></td>}
            <td><span className="location-cell"><Icon name="pin" size={15}/>{r.location}</span></td>
            <td>{formatDate(r.createdAt, false)}</td>
            <td><StatusPill status={r.status}/></td>
            <td>{r.assignedName || <span className="unassigned">Sin asignar</span>}</td>
            <td><button className="row-action" onClick={e => { e.stopPropagation(); navigate('detail', r.id); }} aria-label={`Ver ${r.code}`}><Icon name={compact ? 'chevron' : 'eye'} size={18}/></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function NewRequest({ user, onCreate, onCancel, onSessionExpired }: { user: User; onCreate: (r: MaintenanceRequest) => void; onCancel: () => void; onSessionExpired: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setCategoriesLoading(true);
    setCategoriesError('');
    void getCategories(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setCategories(items);
      setCategoryId(current => items.some(item => item.id === current) ? current : '');
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setCategories([]);
      setCategoryId('');
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setCategoriesError(failure instanceof ApiError ? failure.message : 'No se pudieron cargar las categorías.');
    }).finally(() => {
      if (!controller.signal.aborted) setCategoriesLoading(false);
    });
    return () => controller.abort();
  }, [catalogRetry, onSessionExpired]);

  // Las solicitudes locales guardan el nombre, igual que los casos ya almacenados.
  const selectedCategory = categories.find(item => item.id === categoryId);
  const catalogAvailable = !categoriesLoading && !categoriesError && categories.length > 0;
  const canSubmit = catalogAvailable && !!selectedCategory;
  const retryCatalog = () => setCatalogRetry(value => value + 1);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!selectedCategory) nextErrors.category = categoriesError || 'Selecciona una categoría válida.';
    if (!location.trim()) nextErrors.location = 'Indica la ubicación del problema.';
    if (description.trim().length < 15) nextErrors.description = 'Describe el problema con al menos 15 caracteres.';
    setErrors(nextErrors);
    if (!canSubmit || Object.keys(nextErrors).length) return;
    const now = new Date().toISOString();
    const suffix = String(Date.now()).slice(-5);
    const code = `CR2-${new Date().getFullYear()}-${suffix}`;
    onCreate({
      id: `req-${Date.now()}`, code, residentId: user.id, residentName: user.name,
      category: selectedCategory.name, location: location.trim(), description: description.trim(), status: 'Pendiente', createdAt: now,
      history: [{ id: `h-${Date.now()}`, previousStatus: 'Pendiente', newStatus: 'Pendiente', userId: user.id, userName: user.name, at: now, note: 'Solicitud registrada', type: 'created' }],
    });
  };
  return (
    <>
      <section className="page-heading"><div><p className="eyebrow">Nuevo reporte</p><h1>Registrar solicitud</h1><p>Cuéntanos qué ocurrió y dónde. Todos los campos son obligatorios.</p></div></section>
      <div className="form-layout">
        <form className="card request-form" onSubmit={submit} noValidate>
          <div className="form-section-title"><span>1</span><div><h2>Detalles de la incidencia</h2><p>Proporciona la información necesaria para atender el caso.</p></div></div>
          <div className="field-grid">
            <label className="field">Categoría <span>*</span>
              <select value={categoryId} disabled={!catalogAvailable} onChange={e => setCategoryId(e.target.value)} className={errors.category ? 'invalid' : ''}>
                <option value="">{categoriesLoading ? 'Cargando categorías…' : categoriesError ? 'Categorías no disponibles' : categories.length ? 'Selecciona una categoría' : 'Sin categorías disponibles'}</option>
                {categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>{errors.category && <small className="error-text">{errors.category}</small>}
            </label>
            <label className="field">Ubicación <span>*</span>
              <input value={location} onChange={e => setLocation(e.target.value)} className={errors.location ? 'invalid' : ''} placeholder="Ej.: Torre B · Apto. 3C · Cocina"/>
              {errors.location && <small className="error-text">{errors.location}</small>}
            </label>
          </div>
          {categoriesLoading && <p className="muted" role="status">Cargando categorías desde la API…</p>}
          {!categoriesLoading && !categoriesError && !categories.length && <div className="session-error" role="status">El catálogo de categorías está vacío.<button type="button" onClick={retryCatalog}>Reintentar</button></div>}
          {!categoriesLoading && categoriesError && <div className="session-error" role="alert">{categoriesError}<button type="button" onClick={retryCatalog}>Reintentar</button></div>}
          <label className="field">Descripción del problema <span>*</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={errors.description ? 'invalid' : ''} rows={6} maxLength={500} placeholder="Describe qué sucede, desde cuándo y cualquier detalle que pueda ayudar al equipo..."/>
            <span className="char-count">{description.length}/500</span>{errors.description && <small className="error-text">{errors.description}</small>}
          </label>
          <div className="form-actions"><button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button><button type="submit" className="btn primary" disabled={!canSubmit}>Registrar solicitud <Icon name="arrow" size={17}/></button></div>
        </form>
        <aside className="form-aside">
          <div className="info-card"><span><Icon name="file"/></span><h3>¿Qué sucederá después?</h3><ol><li><b>1</b><span>Recibirás un código único para consultar tu caso.</span></li><li><b>2</b><span>Administración revisará y asignará la solicitud.</span></li><li><b>3</b><span>Podrás seguir cada cambio desde tu panel.</span></li></ol></div>
          <div className="privacy-note"><Icon name="shield"/><p><strong>Tu información está protegida</strong><br/>Solo tú, administración y el trabajador asignado pueden acceder al caso.</p></div>
        </aside>
      </div>
    </>
  );
}

function RequestDetail({ user, request, setRequests, notify, navigate, onSessionExpired }: { user: User; request: MaintenanceRequest; setRequests: React.Dispatch<React.SetStateAction<MaintenanceRequest[]>>; notify: (t: string, x: string) => void; navigate: (v: View) => void; onSessionExpired: () => void }) {
  const [assignee, setAssignee] = useState(request.assignedTo || '');
  const [workDescription, setWorkDescription] = useState('');
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const [techniciansError, setTechniciansError] = useState('');
  const [techniciansRetry, setTechniciansRetry] = useState(0);

  useEffect(() => {
    if (user.role !== 'admin' || request.status !== 'Pendiente') return;
    const controller = new AbortController();
    setTechniciansLoading(true);
    setTechniciansError('');
    void getTechnicians(controller.signal).then((items) => {
      if (!controller.signal.aborted) setTechnicians(items);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setTechnicians([]);
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setTechniciansError(failure instanceof ApiError ? failure.message : 'No se pudieron cargar los trabajadores.');
    }).finally(() => {
      if (!controller.signal.aborted) setTechniciansLoading(false);
    });
    return () => controller.abort();
  }, [user.role, request.status, techniciansRetry, onSessionExpired]);

  const assign = () => {
    if (user.role !== 'admin') { setError('Acción bloqueada: tu cuenta no tiene este permiso.'); return; }
    if (!assignee) { setError('Selecciona un trabajador para continuar.'); return; }
    const tech = technicians.find(t => t.id === assignee);
    if (!tech || techniciansLoading || techniciansError) { setError('Selecciona un trabajador disponible en la API.'); return; }
    const at = new Date().toISOString();
    setRequests(prev => prev.map(r => r.id === request.id ? { ...r, assignedTo: tech.id, assignedName: tech.name, history: [...r.history, { id: `h-${Date.now()}`, previousStatus: r.status, newStatus: r.status, userId: user.id, userName: user.name, at, note: `Asignada a ${tech.name}. El estado se conserva en ${r.status}.`, type: 'assignment' }] } : r));
    setError('');
    notify('Trabajador asignado', `${tech.name} recibió el caso. El estado permanece ${request.status}.`);
  };

  const transition = (next: Status) => {
    if (user.role !== 'maintenance' || request.assignedTo !== user.id) { setError('Acción bloqueada: solo el trabajador asignado puede cambiar este estado.'); return; }
    const expected = request.status === 'Pendiente' ? 'En proceso' : request.status === 'En proceso' ? 'Resuelta' : null;
    if (next !== expected) { setError('Cambio no permitido. Los estados deben avanzar en el orden establecido.'); return; }
    if (next === 'Resuelta' && workDescription.trim().length < 15) { setError('Describe el trabajo realizado con al menos 15 caracteres.'); return; }
    const note = next === 'En proceso' ? 'Trabajo iniciado' : workDescription.trim();
    const at = new Date().toISOString();
    setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: next, ...(next === 'Resuelta' ? { resolution: note } : {}), history: [...r.history, { id: `h-${Date.now()}`, previousStatus: r.status, newStatus: next, userId: user.id, userName: user.name, at, note, type: 'status' }] } : r));
    setError('');
    setWorkDescription('');
    notify(next === 'En proceso' ? 'Trabajo iniciado' : 'Solicitud resuelta', `El caso ${request.code} cambió de ${request.status} a ${next}.`);
  };

  return (
    <>
      <button className="back-button" onClick={() => navigate('requests')}><span>‹</span>Volver a solicitudes</button>
      <section className="detail-heading">
        <div><div className="code-line"><span>{request.code}</span><StatusPill status={request.status}/></div><h1>{request.category}</h1><p>Registrada el {formatDate(request.createdAt)} por {request.residentName}</p></div>
        {user.role === 'maintenance' && request.status === 'Pendiente' && <button className="btn primary" onClick={() => transition('En proceso')}><Icon name="wrench"/>Iniciar trabajo</button>}
      </section>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="card detail-card">
            <div className="section-heading"><div><h2>Información de la solicitud</h2><p>Detalles proporcionados por el residente</p></div></div>
            <div className="detail-meta">
              <div><span className="meta-icon"><Icon name="pin"/></span><span><small>UBICACIÓN</small><strong>{request.location}</strong></span></div>
              <div><span className="meta-icon"><Icon name="file"/></span><span><small>CATEGORÍA</small><strong>{request.category}</strong></span></div>
              <div><span className="meta-icon"><Icon name="calendar"/></span><span><small>FECHA DE REGISTRO</small><strong>{formatDate(request.createdAt)}</strong></span></div>
              <div><span className="meta-icon"><Icon name="wrench"/></span><span><small>TRABAJADOR ASIGNADO</small><strong>{request.assignedName || 'Pendiente de asignación'}</strong></span></div>
            </div>
            <div className="description-box"><small>DESCRIPCIÓN</small><p>{request.description}</p></div>
            {request.resolution && <div className="resolution-box"><span><Icon name="check"/></span><div><small>TRABAJO REALIZADO</small><p>{request.resolution}</p></div></div>}
          </section>
          <section className="card detail-card timeline-card">
            <div className="section-heading"><div><h2>Historial de la solicitud</h2><p>Registro completo de actualizaciones</p></div></div>
            <div className="timeline">{[...request.history].reverse().map((item, i) => (
              <div className="timeline-item" key={item.id}>
                <div className={`timeline-marker ${i === 0 ? 'current' : ''}`}><Icon name={item.type === 'assignment' ? 'users' : item.type === 'created' ? 'file' : 'check'} size={16}/></div>
                <div className="timeline-content">
                  <div className="timeline-top"><strong>{item.note}</strong><time>{formatDate(item.at)}</time></div>
                  <p>Por {item.userName}</p>
                  <div className="transition"><span>{item.previousStatus}</span><Icon name="arrow" size={14}/><span>{item.newStatus}</span></div>
                </div>
              </div>
            ))}</div>
          </section>
        </div>
        <aside className="detail-aside">
          <section className="card status-summary">
            <h3>Estado actual</h3><StatusPill status={request.status}/>
            <div className="progress-track"><span className={request.status !== 'Pendiente' ? 'done' : 'active'}/><i/><span className={request.status === 'En proceso' ? 'active' : request.status === 'Resuelta' ? 'done' : ''}/><i/><span className={request.status === 'Resuelta' ? 'active' : ''}/></div>
            <div className="progress-labels"><small>Pendiente</small><small>En proceso</small><small>Resuelta</small></div>
          </section>
          {user.role === 'admin' && request.status === 'Pendiente' && <section className="card action-card"><h3>Asignar trabajador</h3><p>La asignación conservará el estado <b>Pendiente</b>.</p><label>Trabajador<select value={assignee} disabled={techniciansLoading || !!techniciansError} onChange={e => setAssignee(e.target.value)}><option value="">{techniciansLoading ? 'Cargando trabajadores…' : 'Selecciona un trabajador'}</option>{technicians.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>{techniciansError && <div className="session-error" role="alert">{techniciansError}<button type="button" onClick={() => setTechniciansRetry(value => value + 1)}>Reintentar</button></div>}{error && <small className="error-text block">{error}</small>}<button className="btn primary wide" disabled={techniciansLoading || !!techniciansError || !technicians.length} onClick={assign}>{request.assignedTo ? 'Actualizar asignación' : 'Asignar solicitud'}</button></section>}
          {user.role === 'maintenance' && request.status === 'En proceso' && <section className="card action-card"><h3>Finalizar trabajo</h3><p>Describe el trabajo realizado antes de marcar la solicitud como resuelta.</p><label>Descripción del trabajo <span>*</span><textarea rows={5} value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Detalla la reparación realizada..."/></label>{error && <small className="error-text block">{error}</small>}<button className="btn primary wide" onClick={() => transition('Resuelta')}><Icon name="check"/>Marcar como resuelta</button></section>}
          {user.role === 'maintenance' && request.status === 'Pendiente' && <div className="privacy-note"><Icon name="alert"/><p><strong>Siguiente paso</strong><br/>Inicia el trabajo para cambiar el estado a En proceso.</p></div>}
          <div className="security-card"><Icon name="shield"/><div><strong>Acceso protegido por rol</strong><p>Las acciones no autorizadas son rechazadas por el servicio local del prototipo.</p></div></div>
        </aside>
      </div>
    </>
  );
}

function EmptyInline({ user }: { user: User }) {
  return <div className="empty-inline"><Icon name="file" size={30}/><h3>No hay {user.role === 'maintenance' ? 'trabajos asignados' : 'solicitudes todavía'}</h3><p>Los nuevos casos aparecerán aquí.</p></div>;
}

function EmptyState({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  return <div className="card empty-state"><span><Icon name="shield" size={30}/></span><h1>{title}</h1><p>{text}</p><button className="btn primary" onClick={onBack}>Volver</button></div>;
}

export default App;
