import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { useSpeechRecognition, useSpeechSynthesis } from "react-speech-kit";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
//
// This file demonstrates a skeleton of a full‑stack planning tool inspired by
// the Lovable "Controle Diário" app.  It connects to Supabase for auth and
// database operations, supports drag‑and‑drop Kanban boards, multiple
// visualisations, a voice assistant powered by the Web Speech API, and simple
// workflow automations.  You can extend each component to match your
// production schema and styling.
//
// Before running this application:
//  1) Create a new React project (e.g. with Vite) and install these
//     dependencies: react, react‑router‑dom, @supabase/supabase-js,
//     @dnd-kit/core, @dnd-kit/sortable, recharts, react‑speech‑kit.
//  2) Configure Supabase with email/password authentication and create the
//     tables referenced in this code (see the SQL migration at the bottom of
//     this file).  Copy your Supabase URL and anonymous key into
//     VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY variables in your .env.
//  3) Optionally obtain a HuggingFace API key and expose it as VITE_HF_TOKEN
//     if you want to integrate a remote LLM/voice service.
//

/* --------------------------------------------------------------------
 * Supabase client and authentication context
 *
 * We create a single Supabase client for the entire app.  The AuthContext
 * exposes the current user and provides login/logout helpers.  When
 * authenticated, Supabase returns a session; when not, we redirect to
 * the login page.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const AuthContext = React.createContext(null);

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  useEffect(() => {
    const currentSession = supabase.auth.session?.();
    setSession(currentSession);
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => authListener?.unsubscribe();
  }, []);
  const value = useMemo(() => ({ session }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/*
 * Login page component.  It provides a simple form for email/password
 * authentication.  On success, Supabase will set the session and the
 * AuthProvider will redirect the user.
 */
function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const onSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signIn({ email, password });
    setError(error?.message);
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm p-6 bg-white rounded shadow">
        <h1 className="mb-4 text-2xl font-bold">Entrar</h1>
        {error && <div className="mb-2 text-red-500">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 mb-2 border rounded"
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
          required
        />
        <button type="submit" className="w-full py-2 font-semibold text-white bg-blue-600 rounded">Entrar</button>
      </form>
    </div>
  );
}

/*
 * Layout component used by most pages.  It displays a side navigation bar
 * similar to the Lovable app.  When the user is not logged in the
 * navigation is hidden.
 */
function Layout({ children }) {
  const { session } = React.useContext(AuthContext);
  const onLogout = async () => {
    await supabase.auth.signOut();
  };
  return (
    <div className="flex h-screen overflow-hidden">
      {session && (
        <aside className="w-60 p-4 text-sm bg-gray-100">
          <div className="mb-8 text-xl font-bold">Controle Diário</div>
          <nav className="space-y-2">
            <NavLink to="/" label="Dashboard" />
            <NavLink to="/kanban" label="Kanban" />
            <NavLink to="/agenda" label="Agenda" />
            <NavLink to="/clientes" label="Clientes" />
            <NavLink to="/equipe" label="Equipe" />
            <NavLink to="/servicos" label="Serviços" />
            <NavLink to="/relatorios" label="Relatórios" />
            <NavLink to="/funil" label="Funil IA" />
            <NavLink to="/ferramentas" label="Ferramentas" />
            <button onClick={onLogout} className="w-full px-2 py-1 mt-4 text-left text-red-600 hover:bg-red-50 rounded">Sair</button>
          </nav>
        </aside>
      )}
      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}

/* Simple NavLink component; highlight active route */
import { NavLink as RRNavLink, useLocation } from "react-router-dom";
function NavLink({ to, label }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <RRNavLink
      to={to}
      className={active ? "block px-3 py-2 font-medium bg-blue-100 rounded" : "block px-3 py-2 hover:bg-gray-200 rounded"}
    >
      {label}
    </RRNavLink>
  );
}

/*
 * Dashboard page
 *
 * Displays summary metrics and quick links.  You can expand this to query
 * Supabase for counts (tasks total, pending, completed etc.).  For now,
 * we compute metrics from the tasks loaded in state.
 */
function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase.from("tasks").select("*");
      if (data) setTasks(data);
    };
    fetchTasks();
  }, []);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "concluido").length;
  const pending = tasks.filter((t) => t.status === "pendente").length;
  const overdue = tasks.filter((t) => new Date(t.end_at) < new Date() && t.status !== "concluido").length;
  const activeClients = new Set(tasks.map((t) => t.client_id)).size;
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard title="Total de Tarefas" value={total} />
          <MetricCard title="Concluídas" value={completed} />
          <MetricCard title="Pendentes" value={pending} />
          <MetricCard title="Atrasadas" value={overdue} />
          <MetricCard title="Clientes Ativos" value={activeClients} />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Quick links to sections */}
          <QuickLink to="/kanban" label="Kanban" />
          <QuickLink to="/agenda" label="Agenda" />
          <QuickLink to="/clientes" label="Clientes" />
          <QuickLink to="/equipe" label="Equipe" />
        </div>
        {/* Recent tasks list */}
        <div>
          <h2 className="mb-2 text-xl font-semibold">Tarefas Recentes</h2>
          <ul className="divide-y divide-gray-200">
            {tasks.slice(0, 5).map((task) => (
              <li key={task.id} className="py-2">
                <div className="flex justify-between">
                  <span>{task.title}</span>
                  <span className="text-sm text-gray-500">{task.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Layout>
  );
}

function MetricCard({ title, value }) {
  return (
    <div className="p-4 bg-gray-50 rounded shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function QuickLink({ to, label }) {
  return (
    <RRNavLink to={to} className="flex items-center justify-center p-4 text-white bg-blue-600 rounded hover:bg-blue-700">
      {label}
    </RRNavLink>
  );
}

/*
 * Kanban page
 *
 * A drag‑and‑drop board for tasks.  Tasks are grouped by status.  This
 * component implements advanced filters (search, client, user, priority,
 * tags, date range) and supports reordering via @dnd‑kit.  When a task
 * is dropped into a new column, we update its status in Supabase.
 */
function KanbanPage() {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState({ search: "", client: "", user: "", priority: "", tag: "", dateFrom: "", dateTo: "" });

  useEffect(() => {
    const fetchTasks = async () => {
      const { data } = await supabase.from("tasks").select("*");
      setTasks(data || []);
    };
    fetchTasks();
    // Subscribe to realtime updates
    const subscription = supabase
      .from("tasks")
      .on("INSERT", (payload) => setTasks((prev) => [...prev, payload.new]))
      .on("UPDATE", (payload) => setTasks((prev) => prev.map((t) => (t.id === payload.new.id ? payload.new : t))))
      .on("DELETE", (payload) => setTasks((prev) => prev.filter((t) => t.id !== payload.old.id)))
      .subscribe();
    return () => {
      supabase.removeSubscription(subscription);
    };
  }, []);

  // Filtering logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = filters.search ? task.title.toLowerCase().includes(filters.search.toLowerCase()) : true;
      const matchesClient = filters.client ? task.client_id === filters.client : true;
      const matchesUser = filters.user ? task.user_id === filters.user : true;
      const matchesPriority = filters.priority ? task.priority === filters.priority : true;
      const matchesTag = filters.tag ? (task.tags || "").toLowerCase().includes(filters.tag.toLowerCase()) : true;
      const date = new Date(task.start_at);
      const matchesDateFrom = filters.dateFrom ? date >= new Date(filters.dateFrom) : true;
      const matchesDateTo = filters.dateTo ? date <= new Date(filters.dateTo) : true;
      return matchesSearch && matchesClient && matchesUser && matchesPriority && matchesTag && matchesDateFrom && matchesDateTo;
    });
  }, [tasks, filters]);

  // Group tasks by status for columns
  const columns = useMemo(() => {
    const statuses = ["pendente", "em_andamento", "concluido"];
    return statuses.map((status) => ({
      id: status,
      title: status.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase()),
      tasks: filteredTasks.filter((task) => task.status === status),
    }));
  }, [filteredTasks]);

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.data.current?.status === over.id) return;
    const taskId = active.id;
    const newStatus = over.id;
    // update local state
    setTasks((tasks) => tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    // update DB
    await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
  };

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Kanban</h1>
        {/* Filters */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <input
            type="text"
            placeholder="Buscar..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Cliente"
            value={filters.client}
            onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Usuário"
            value={filters.user}
            onChange={(e) => setFilters((f) => ({ ...f, user: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Prioridade"
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Tag"
            value={filters.tag}
            onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className="p-2 border rounded"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className="p-2 border rounded"
          />
        </div>
        {/* Kanban board */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {columns.map((column) => (
              <div key={column.id} id={column.id} className="p-3 bg-gray-50 rounded">
                <div className="mb-2 text-lg font-semibold">{column.title}</div>
                <div className="space-y-2">
                  {column.tasks.map((task) => (
                    <div
                      key={task.id}
                      id={task.id}
                      data-status={column.id}
                      className="p-3 text-sm bg-white border rounded shadow-sm cursor-move"
                    >
                      <div className="font-medium">{task.title}</div>
                      <div className="flex justify-between mt-1 text-xs text-gray-500">
                        <span>{task.priority}</span>
                        <span>{new Date(task.end_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DndContext>
      </div>
    </Layout>
  );
}

/*
 * Agenda page
 *
 * Displays a simple calendar using HTML inputs for selecting dates and times.
 * You can integrate a calendar component like react-big-calendar for a more
 * feature‑rich experience.  Here we list events per date and allow
 * creation of new events.
 */
function AgendaPage() {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", start: "", end: "", client_id: "", user_id: "" });
  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase.from("events").select("*");
      setEvents(data || []);
    };
    fetchEvents();
  }, []);
  const dailyEvents = events.filter((ev) => ev.start_at?.split("T")[0] === selectedDate);
  const openModal = () => {
    setForm({ title: "", start: `${selectedDate}T09:00`, end: `${selectedDate}T10:00`, client_id: "", user_id: "" });
    setModalOpen(true);
  };
  const saveEvent = async () => {
    const { title, start, end, client_id, user_id } = form;
    const { data, error } = await supabase.from("events").insert([{ title, start_at: start, end_at: end, client_id, user_id }]);
    if (!error) setEvents((prev) => [...prev, ...data]);
    setModalOpen(false);
  };
  return (
    <Layout>
      <div className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">Agenda</h1>
          <div className="flex items-center space-x-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="p-2 border rounded" />
            <button onClick={openModal} className="px-3 py-2 text-white bg-green-600 rounded">Novo Evento</button>
          </div>
          <ul className="mt-4 space-y-2">
            {dailyEvents.map((ev) => (
              <li key={ev.id} className="p-2 border rounded">
                <div className="font-semibold">{ev.title}</div>
                <div className="text-sm text-gray-500">{new Date(ev.start_at).toLocaleTimeString()} - {new Date(ev.end_at).toLocaleTimeString()}</div>
              </li>
            ))}
            {dailyEvents.length === 0 && <li className="text-gray-500">Nenhum evento</li>}
          </ul>
          {modalOpen && (
            <div className="fixed inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50">
              <div className="p-6 bg-white rounded shadow-lg w-96">
                <h2 className="mb-4 text-lg font-semibold">Novo Evento</h2>
                <input
                  type="text"
                  placeholder="Título"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 mb-2 border rounded"
                />
                <label className="block mb-1 text-sm">Início</label>
                <input
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                  className="w-full p-2 mb-2 border rounded"
                />
                <label className="block mb-1 text-sm">Fim</label>
                <input
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                  className="w-full p-2 mb-4 border rounded"
                />
                {/* Additional fields: client, user, etc. */}
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded">Cancelar</button>
                  <button onClick={saveEvent} className="px-4 py-2 text-white bg-blue-600 rounded">Salvar</button>
                </div>
              </div>
            </div>
          )}
      </div>
    </Layout>
  );
}

/*
 * Clientes page
 *
 * Displays a table of clients and allows adding new ones.  The form
 * corresponds to the Lovable modal: name, email, phone, company, status,
 * stage, tags and notes.
 */
function ClientesPage() {
  const [clients, setClients] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", status: "", stage: "", tags: "", notes: "" });
  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase.from("clients").select("*");
      setClients(data || []);
    };
    fetchClients();
  }, []);
  const saveClient = async () => {
    const { data, error } = await supabase.from("clients").insert([{
      name: form.name,
      email: form.email,
      phone: form.phone,
      company: form.company,
      status: form.status,
      stage: form.stage,
      tags: form.tags,
      notes: form.notes,
    }]);
    if (!error) setClients((prev) => [...prev, ...data]);
    setModalOpen(false);
  };
  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Clientes</h1>
          <button onClick={() => { setForm({ name: "", email: "", phone: "", company: "", status: "", stage: "", tags: "", notes: "" }); setModalOpen(true); }} className="px-3 py-2 text-white bg-green-600 rounded">Novo Cliente</button>
        </div>
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1 border">Nome</th>
              <th className="px-2 py-1 border">Email</th>
              <th className="px-2 py-1 border">Telefone</th>
              <th className="px-2 py-1 border">Empresa</th>
              <th className="px-2 py-1 border">Status</th>
              <th className="px-2 py-1 border">Etapa</th>
              <th className="px-2 py-1 border">Tags</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-2 py-1 border">{c.name}</td>
                <td className="px-2 py-1 border">{c.email}</td>
                <td className="px-2 py-1 border">{c.phone}</td>
                <td className="px-2 py-1 border">{c.company}</td>
                <td className="px-2 py-1 border">{c.status}</td>
                <td className="px-2 py-1 border">{c.stage}</td>
                <td className="px-2 py-1 border">{c.tags}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">Nenhum cliente cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
        {modalOpen && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="p-6 bg-white rounded shadow-lg w-96">
              <h2 className="mb-4 text-lg font-semibold">Novo Cliente</h2>
              <input className="w-full p-2 mb-2 border rounded" placeholder="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Telefone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Empresa" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Etapa de Vendas" value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Tags" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
              <textarea className="w-full p-2 mb-4 border rounded" placeholder="Observações" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}></textarea>
              <div className="flex justify-end space-x-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded">Cancelar</button>
                <button onClick={saveClient} className="px-4 py-2 text-white bg-blue-600 rounded">Salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

/*
 * Equipe page
 *
 * Lists team members and allows creation of a new member.  Fields: name,
 * email, role, status.  Status can be Active or Inactive.
 */
function EquipePage() {
  const [members, setMembers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "", status: "ativo" });
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("team").select("*");
      setMembers(data || []);
    };
    fetch();
  }, []);
  const save = async () => {
    const { data, error } = await supabase.from("team").insert([form]);
    if (!error) setMembers((prev) => [...prev, ...data]);
    setModalOpen(false);
  };
  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Equipe</h1>
          <button onClick={() => { setForm({ name: "", email: "", role: "", status: "ativo" }); setModalOpen(true); }} className="px-3 py-2 text-white bg-green-600 rounded">Novo Membro</button>
        </div>
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1 border">Nome</th>
              <th className="px-2 py-1 border">Email</th>
              <th className="px-2 py-1 border">Cargo</th>
              <th className="px-2 py-1 border">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-2 py-1 border">{m.name}</td>
                <td className="px-2 py-1 border">{m.email}</td>
                <td className="px-2 py-1 border">{m.role}</td>
                <td className="px-2 py-1 border">{m.status}</td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">Nenhum membro</td>
              </tr>
            )}
          </tbody>
        </table>
        {modalOpen && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="p-6 bg-white rounded shadow-lg w-96">
              <h2 className="mb-4 text-lg font-semibold">Novo Membro</h2>
              <input className="w-full p-2 mb-2 border rounded" placeholder="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <input className="w-full p-2 mb-2 border rounded" placeholder="Cargo" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
              <select className="w-full p-2 mb-4 border rounded" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
              <div className="flex justify-end space-x-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded">Cancelar</button>
                <button onClick={save} className="px-4 py-2 text-white bg-blue-600 rounded">Salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

/*
 * Serviços page
 *
 * Allows adding and listing service definitions.  Each service has a name
 * and description.
 */
function ServicosPage() {
  const [services, setServices] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("services").select("*");
      setServices(data || []);
    };
    fetch();
  }, []);
  const save = async () => {
    const { data, error } = await supabase.from("services").insert([form]);
    if (!error) setServices((prev) => [...prev, ...data]);
    setModalOpen(false);
  };
  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Serviços</h1>
          <button onClick={() => { setForm({ name: "", description: "" }); setModalOpen(true); }} className="px-3 py-2 text-white bg-green-600 rounded">Novo Serviço</button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {services.map((s) => (
            <div key={s.id} className="p-4 border rounded">
              <div className="text-lg font-semibold">{s.name}</div>
              <div className="mt-1 text-sm text-gray-600">{s.description}</div>
            </div>
          ))}
          {services.length === 0 && <div className="text-gray-500">Nenhum serviço</div>}
        </div>
        {modalOpen && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="p-6 bg-white rounded shadow-lg w-96">
              <h2 className="mb-4 text-lg font-semibold">Novo Serviço</h2>
              <input className="w-full p-2 mb-2 border rounded" placeholder="Nome do serviço" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <textarea className="w-full p-2 mb-4 border rounded" placeholder="Descrição" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}></textarea>
              <div className="flex justify-end space-x-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded">Cancelar</button>
                <button onClick={save} className="px-4 py-2 text-white bg-blue-600 rounded">Salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

/*
 * Relatórios page
 *
 * Renders a few example charts summarising tasks and team performance.
 */
function RelatoriosPage() {
  // Example static data; replace with queries to your Supabase tables
  const teamPerformance = [
    { name: "João", tarefas: 10, progresso: 80 },
    { name: "Maria", tarefas: 8, progresso: 95 },
    { name: "Carlos", tarefas: 6, progresso: 60 },
  ];
  const projectStatus = [
    { name: "Concluído", value: 15 },
    { name: "Em Andamento", value: 5 },
    { name: "Atrasado", value: 3 },
    { name: "Pausado", value: 1 },
  ];
  const clientMetrics = [
    { name: "Cliente A", tarefas: 5, receita: 2000, satisfacao: 4.8 },
    { name: "Cliente B", tarefas: 3, receita: 1500, satisfacao: 4.5 },
    { name: "Cliente C", tarefas: 2, receita: 1000, satisfacao: 4.2 },
  ];
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        {/* Team performance bar chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Membro", position: "insideBottom", offset: -5 }} />
              <YAxis label={{ value: "Tarefas", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Bar dataKey="tarefas" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Project status pie chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={projectStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Client metrics list */}
        <div>
          <h2 className="mb-2 text-xl font-semibold">Métricas por Cliente</h2>
          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 border">Cliente</th>
                <th className="px-2 py-1 border">Tarefas</th>
                <th className="px-2 py-1 border">Receita</th>
                <th className="px-2 py-1 border">Satisfação</th>
              </tr>
            </thead>
            <tbody>
              {clientMetrics.map((c) => (
                <tr key={c.name} className="border-t">
                  <td className="px-2 py-1 border">{c.name}</td>
                  <td className="px-2 py-1 border">{c.tarefas}</td>
                  <td className="px-2 py-1 border">R$ {c.receita.toFixed(2)}</td>
                  <td className="px-2 py-1 border">{c.satisfacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

/*
 * Funil IA page
 *
 * Provides a simple natural language assistant to create tasks/events/clients
 * and a funnel generator that accepts business type, audience, budget and
 * goals.  This is where you would integrate with an LLM through
 * HuggingFace.  The STT/TTS is implemented using the Web Speech API via
 * react‑speech‑kit.  For demonstration, the assistant only echoes the
 * command.
 */
function FunilPage() {
  const { speak } = useSpeechSynthesis();
  const { listen, listening, stop } = useSpeechRecognition({ onResult: handleResult });
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState("");
  function handleResult(transcript) {
    setCommand(transcript);
  }
  async function executeCommand() {
    // here you would call your HuggingFace model or custom API to parse
    // the command and perform actions.  We'll just echo it.
    setResponse(`Executando: ${command}`);
    speak({ text: `Executando: ${command}` });
    setCommand("");
  }
  // Funnel form
  const [funnel, setFunnel] = useState({ businessType: "", audience: "", budget: "", goals: "" });
  function generateFunnel() {
    const message = `Gerando funil para ${funnel.businessType} com público alvo ${funnel.audience}, orçamento ${funnel.budget} e objetivos ${funnel.goals}`;
    setResponse(message);
    speak({ text: message });
  }
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Funil com IA</h1>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Assistant */}
          <div className="p-4 bg-gray-50 rounded">
            <h2 className="mb-2 text-lg font-semibold">Assistente IA Inteligente</h2>
            <textarea className="w-full p-2 mb-2 border rounded" rows={3} placeholder="Digite o comando" value={command} onChange={(e) => setCommand(e.target.value)}></textarea>
            <div className="flex items-center space-x-2">
              <button onClick={executeCommand} className="px-4 py-2 text-white bg-blue-600 rounded">Executar</button>
              <button onClick={() => (listening ? stop() : listen())} className="px-4 py-2 text-white bg-green-600 rounded">
                {listening ? "Parar" : "Falar"}
              </button>
            </div>
            {response && <div className="mt-2 text-sm text-gray-700">{response}</div>}
          </div>
          {/* Funnel configuration */}
          <div className="p-4 bg-gray-50 rounded">
            <h2 className="mb-2 text-lg font-semibold">Configuração do Funil</h2>
            <input className="w-full p-2 mb-2 border rounded" placeholder="Tipo de Negócio" value={funnel.businessType} onChange={(e) => setFunnel((f) => ({ ...f, businessType: e.target.value }))} />
            <input className="w-full p-2 mb-2 border rounded" placeholder="Público-Alvo" value={funnel.audience} onChange={(e) => setFunnel((f) => ({ ...f, audience: e.target.value }))} />
            <select className="w-full p-2 mb-2 border rounded" value={funnel.budget} onChange={(e) => setFunnel((f) => ({ ...f, budget: e.target.value }))}>
              <option value="">Selecione o Orçamento</option>
              <option value="Baixo">Baixo</option>
              <option value="Médio">Médio</option>
              <option value="Alto">Alto</option>
            </select>
            <textarea className="w-full p-2 mb-2 border rounded" placeholder="Objetivos e Metas" value={funnel.goals} onChange={(e) => setFunnel((f) => ({ ...f, goals: e.target.value }))}></textarea>
            <button onClick={generateFunnel} className="w-full py-2 text-white bg-purple-600 rounded">Gerar Funil com IA</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/*
 * Ferramentas page
 *
 * Implements a Pomodoro timer with focus and break intervals.  It
 * replicates the behaviour of the Lovable timer with start, reset and
 * cycle management.  The timer runs on the client side; statistics and
 * reward logic can be stored in Supabase.
 */
function FerramentasPage() {
  const workDuration = 25 * 60; // 25 minutes
  const shortBreak = 5 * 60; // 5 minutes
  const longBreak = 15 * 60; // 15 minutes
  const [timeLeft, setTimeLeft] = useState(workDuration);
  const [phase, setPhase] = useState("work");
  const [cycle, setCycle] = useState(1);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev > 0) return prev - 1;
        // transition between phases
        if (phase === "work") {
          setPhase(cycle % 4 === 0 ? "longBreak" : "shortBreak");
          return cycle % 4 === 0 ? longBreak : shortBreak;
        } else {
          setPhase("work");
          setCycle((c) => c + 1);
          return workDuration;
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, phase, cycle]);
  const start = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setPhase("work");
    setCycle(1);
    setTimeLeft(workDuration);
  };
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Ferramentas</h1>
        <div className="flex flex-col items-center p-6 bg-red-50 rounded">
          <h2 className="mb-2 text-xl font-semibold">{phase === "work" ? "Foco no Trabalho" : phase === "shortBreak" ? "Pausa Curta" : "Pausa Longa"}</h2>
          <div className="mb-2 text-sm text-gray-600">Ciclo {cycle}</div>
          <div className="mb-4 text-5xl font-bold">{minutes}:{seconds}</div>
          <div className="flex space-x-2">
            {!running && <button onClick={start} className="px-4 py-2 text-white bg-blue-600 rounded">Iniciar</button>}
            {running && <button onClick={() => setRunning(false)} className="px-4 py-2 text-white bg-yellow-600 rounded">Pausar</button>}
            <button onClick={reset} className="px-4 py-2 text-white bg-gray-600 rounded">Reiniciar</button>
          </div>
        </div>
        {/* Rewards/discipline examples */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-yellow-50 rounded">
            <div className="text-lg font-semibold">Bronze</div>
            <div className="text-sm">4 pomodoros por dia<br/>Recompensa: 10 min de redes sociais</div>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <div className="text-lg font-semibold">Prata</div>
            <div className="text-sm">6 pomodoros por dia<br/>Recompensa: Episódio favorito</div>
          </div>
          <div className="p-4 bg-yellow-100 rounded">
            <div className="text-lg font-semibold">Ouro</div>
            <div className="text-sm">8+ pomodoros por dia<br/>Recompensa: Atividade especial</div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/*
 * Route wrapper
 *
 * Uses the AuthContext to decide whether to show the login page or
 * authenticated content.
 */
function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Routes>
                  <Route index element={<DashboardPage />} />
                  <Route path="kanban" element={<KanbanPage />} />
                  <Route path="agenda" element={<AgendaPage />} />
                  <Route path="clientes" element={<ClientesPage />} />
                  <Route path="equipe" element={<EquipePage />} />
                  <Route path="servicos" element={<ServicosPage />} />
                  <Route path="relatorios" element={<RelatoriosPage />} />
                  <Route path="funil" element={<FunilPage />} />
                  <Route path="ferramentas" element={<FerramentasPage />} />
                </Routes>
              </RequireAuth>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

function RequireAuth({ children }) {
  const { session } = React.useContext(AuthContext);
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default App;

/*
 * SQL Migration
 *
 * Below is an example schema that supports the features of this app.  You
 * should run this in the Supabase SQL Editor to provision your database.
 *
 * Tables:
 *   - profiles: basic user profiles linked to auth.users
 *   - clients: customer records
 *   - team: team members (distinct from auth.users)
 *   - services: service definitions
 *   - tasks: tasks with status, priority, dates, tags, client and user references
 *   - events: calendar events
 *   - automations: simple automation rules storing trigger, condition and action JSON
 */
-- SUPABASE MIGRATION SQL
-- profiles table
-- NB: Supabase will automatically create an auth.users table; we link profiles to it via user_id.
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  role text,
  created_at timestamp with time zone default now()
);

-- clients table
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  phone text,
  company text,
  status text,
  stage text,
  tags text,
  notes text,
  created_at timestamp with time zone default now()
);

-- team table
create table if not exists team (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  role text,
  status text,
  created_at timestamp with time zone default now()
);

-- services table
create table if not exists services (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamp with time zone default now()
);

-- tasks table
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  client_id uuid references clients(id),
  user_id uuid references profiles(id),
  service_id uuid references services(id),
  status text not null default 'pendente',
  priority text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  estimated_hours numeric,
  actual_hours numeric,
  rate numeric,
  budget numeric,
  progress integer,
  tags text,
  created_at timestamp with time zone default now()
);

-- events table
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  start_at timestamp with time zone not null,
  end_at timestamp with time zone not null,
  client_id uuid references clients(id),
  user_id uuid references profiles(id),
  created_at timestamp with time zone default now()
);

-- automations table
create table if not exists automations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  trigger jsonb not null,
  conditions jsonb,
  actions jsonb not null,
  created_at timestamp with time zone default now()
);
