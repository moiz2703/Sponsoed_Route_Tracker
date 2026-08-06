import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard, Users, Columns3, Search, Plus, Check, Clock,
  Calendar, X, ArrowRight, ChevronRight, AlertTriangle, Mail, Phone,
  GraduationCap, Trophy, Sparkles, RotateCcw, Undo2
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  THE ENGINE                                                         */
/*  The whole system runs on one idea: a member's position in the      */
/*  journey (0..10) is the single source of truth. Everything else —   */
/*  the next task, whose queue it's in, whether it's overdue, the      */
/*  progress bar, the stats — is computed from that number. There is   */
/*  no separate task list to maintain, so nothing can fall out of sync.*/
/* ------------------------------------------------------------------ */

const MILESTONES = [
  "Joined", "Onboarding", "HPZ Strategy", "CV Submission", "CV Report",
  "Applications", "Interviews", "Mock Interview", "Job Offer", "Success",
];

// One action per position. owner = whose queue it sits in.
// ball = "us" (we owe work), "member" (waiting on them), "none" (done).
// ms = which milestone this action belongs to.
const ACTIONS = [
  { pos: 0,  label: "Review onboarding form",  done: "Onboarding reviewed", owner: "va",     ball: "us",     ms: 1 },
  { pos: 1,  label: "Write HPZ strategy",       done: "Strategy written",    owner: "me",     ball: "us",     ms: 2 },
  { pos: 2,  label: "Send HPZ strategy",        done: "Strategy sent",       owner: "va",     ball: "us",     ms: 2 },
  { pos: 3,  label: "Awaiting CV submission",   done: "CV received",         owner: "member", ball: "member", ms: 3 },
  { pos: 4,  label: "Review CV",                done: "CV reviewed",         owner: "me",     ball: "us",     ms: 4 },
  { pos: 5,  label: "Send CV report",           done: "Report sent",         owner: "va",     ball: "us",     ms: 4 },
  { pos: 6,  label: "Supporting applications",  done: "Got first interview", owner: "member", ball: "member", ms: 5 },
  { pos: 7,  label: "In interview process",     done: "Ready for mock",      owner: "member", ball: "member", ms: 6 },
  { pos: 8,  label: "Run mock interview",       done: "Mock complete",       owner: "me",     ball: "us",     ms: 7 },
  { pos: 9,  label: "Awaiting job offer",       done: "Offer received",      owner: "member", ball: "member", ms: 8 },
  { pos: 10, label: "Placed",                   done: "",                    owner: "done",   ball: "none",   ms: 9 },
];

const OWNER = {
  me:     { label: "You",    cls: "me" },
  va:     { label: "VA",     cls: "va" },
  member: { label: "Member", cls: "member" },
  done:   { label: "Placed", cls: "done" },
};

const STALE_US = 4;      // our task pending this many days -> overdue
const STALE_MEMBER = 10; // member unresponsive this many days -> chase
const INACTIVE = 14;     // no activity this many days -> at risk

const DAY = 86400000;
const days = (ms) => Math.max(0, Math.floor(ms / DAY));
const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const ago = (n) => (n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`);

function derive(m, now) {
  const a = ACTIONS[m.pos] || ACTIONS[0];
  const dInStage = days(now - m.stageSince);
  const dInactive = days(now - m.lastActivity);
  const placed = m.pos === 10;
  return {
    action: a,
    owner: a.owner,
    ball: a.ball,
    dInStage,
    dInactive,
    placed,
    overdue:   a.ball === "us" && dInStage > STALE_US,
    staleWait: a.ball === "member" && dInStage > STALE_MEMBER && !placed,
    atRisk:    a.ball === "member" && dInactive >= INACTIVE && !placed,
    isNew:     days(now - m.joinDate) <= 7,
    progress:  placed ? 100 : Math.round((m.pos / 10) * 100),
  };
}

// Milestone state for the journey spine: done / current / upcoming.
function milestoneState(pos, msIndex) {
  if (msIndex === 0) return "done"; // "Joined" true for anyone who exists
  if (msIndex === MILESTONES.length - 1) return pos === 10 ? "done" : "upcoming";
  const acts = ACTIONS.filter((a) => a.ms === msIndex).map((a) => a.pos);
  const max = Math.max(...acts);
  const min = Math.min(...acts);
  if (pos > max) return "done";
  if (pos >= min && pos <= max) return "current";
  return "upcoming";
}

/* ------------------------------------------------------------------ */
/*  STORAGE                                                            */
/* ------------------------------------------------------------------ */
const KEY = "tsr_members_v2";

async function loadMembers() {
  try {
    const data = localStorage.getItem(KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
async function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

function seed(now) {
  const d = (n) => now - n * DAY;
  const mk = (id, name, email, visa, uni, industry, roles, pos, joined, stage, last) => ({
    id, name, email, phone: "", visa, uni, industry, roles, notes: "",
    linkedin: false, pos, joinDate: d(joined), stageSince: d(stage), lastActivity: d(last),
  });
  return [
    mk("m1", "Esha Zia", "esha.zia@email.com", "Graduate", "Univ. of Manchester", "Physiotherapy", "Band 5 Physio, Rehab Assistant", 0, 1, 1, 1),
    mk("m2", "Alisha Unia", "alisha.u@email.com", "Skilled Worker", "City, Univ. of London", "Insurance", "Underwriting Analyst, Risk Analyst", 1, 3, 2, 2),
    mk("m3", "Marcus Lee", "marcus.lee@email.com", "Graduate", "Univ. of Leeds", "Data", "Data Analyst, BI Analyst", 1, 2, 2, 2),
    mk("m4", "Tom Becker", "tom.becker@email.com", "Graduate", "Imperial College", "Chemical Eng.", "Process Engineer, Grad Scheme", 2, 5, 1, 1),
    mk("m5", "Anamika Ramraje", "anamika.r@email.com", "Graduate", "Univ. of the Arts", "Fashion", "Fashion Buyer, Merchandiser", 3, 16, 12, 12),
    mk("m6", "Md Shadman Shabab", "shadman.s@email.com", "Skilled Worker", "Univ. of Warwick", "Finance", "Analyst, Investment Ops", 4, 9, 1, 1),
    mk("m7", "Priya Nair", "priya.nair@email.com", "Graduate", "King's College London", "Life Sciences", "Clinical Research Assoc.", 5, 10, 1, 1),
    mk("m8", "Sofia Martinez", "sofia.m@email.com", "Graduate", "Univ. of Nottingham", "Marketing", "Brand Exec, Growth Marketer", 6, 20, 6, 3),
    mk("m9", "Chen Wei", "chen.wei@email.com", "Graduate", "Univ. of Birmingham", "Accountancy", "Audit Associate, ACA Trainee", 7, 28, 18, 18),
    mk("m10", "Daniel Okafor", "daniel.o@email.com", "Skilled Worker", "Univ. of Sheffield", "Logistics", "Supply Chain Analyst", 8, 30, 2, 2),
    mk("m11", "Aisha Rahman", "aisha.r@email.com", "Skilled Worker", "Univ. of Manchester", "HR", "People Partner, HR Advisor", 10, 45, 5, 5),
  ];
}

/* ------------------------------------------------------------------ */
/*  APP                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const [members, setMembers] = useState(null);
  const [view, setView] = useState("dashboard");
  const [lens, setLens] = useState("all"); // all | me | va
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("tsr_theme") || "pro"; } catch { return "pro"; }
  });
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    try { localStorage.setItem("tsr_theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    (async () => {
      const existing = await loadMembers();
      if (existing) setMembers(existing);
      else { const s = seed(Date.now()); setMembers(s); persist(s); }
    })();
  }, []);

  const save = useCallback((updater) => {
    setMembers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persist(next);
      return next;
    });
  }, []);

  const patch = useCallback((id, fields) => {
    save((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  }, [save]);

  const advance = useCallback((id) => {
    save((prev) => prev.map((m) =>
      m.id === id && m.pos < 10
        ? { ...m, pos: m.pos + 1, stageSince: Date.now(), lastActivity: Date.now() }
        : m
    ));
  }, [save]);

  const stepBack = useCallback((id) => {
    save((prev) => prev.map((m) =>
      m.id === id && m.pos > 0
        ? { ...m, pos: m.pos - 1, stageSince: Date.now(), lastActivity: Date.now() }
        : m
    ));
  }, [save]);

  const touch = useCallback((id) => {
    patch(id, { lastActivity: Date.now() });
  }, [patch]);
  
  const removeMember = useCallback((id) => {
    const ok = window.confirm("Remove this member from the tracker? This cannot be undone.");
    if (!ok) return;
    save((prev) => prev.filter((m) => m.id !== id));
    setSelected(null);
  }, [save]);

  const addMember = useCallback((data) => {
    const id = "m" + Math.random().toString(36).slice(2, 8);
    const t = Date.now();
    const m = { id, phone: "", notes: "", linkedin: false, ...data, pos: 0, joinDate: t, stageSince: t, lastActivity: t };
    save((prev) => [m, ...prev]);
    setAdding(false);
    setSelected(id);
  }, [save]);

  const resetAll = useCallback(() => {
    const s = seed(Date.now());
    save(s);
  }, [save]);

  const rows = useMemo(() => {
    if (!members) return [];
    return members.map((m) => ({ m, d: derive(m, now) }));
  }, [members, now]);

  const selectedRow = rows.find((r) => r.m.id === selected) || null;

  if (!members) return <Loading />;

  return (
    <>
      <style>{CSS}</style>
      <div className={"app theme-" + theme}>
        <aside className="sidebar">
          <div className="brand">
            <div className="brandmark">TSR</div>
            <div className="brandtext">
              <b>The Sponsored Route</b>
              <span>Member OS</span>
            </div>
          </div>
          <nav className="nav">
            <NavItem icon={<LayoutDashboard size={17} />} label="Today" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <NavItem icon={<Users size={17} />} label="Members" active={view === "members"} onClick={() => setView("members")} count={members.length} />
            <NavItem icon={<Columns3 size={17} />} label="Pipeline" active={view === "board"} onClick={() => setView("board")} />
          </nav>
          <div className="sidefoot">
            <button className="reset" onClick={resetAll} title="Reset to sample data">
              <RotateCcw size={13} /> Reset demo data
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-l">
              <span className="today">{new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
            </div>
            <div className="lens">
              <span className="lenslbl">Working as</span>
              {["all", "me", "va"].map((k) => (
                <button key={k} className={"lensbtn " + (lens === k ? "on " + k : "")} onClick={() => setLens(k)}>
                  {k === "all" ? "Everyone" : k === "me" ? "You" : "VA"}
                </button>
              ))}
              <button className="themebtn" onClick={() => setTheme((t) => (t === "pro" ? "classic" : "pro"))} title={theme === "pro" ? "Switch to classic view" : "Switch to professional view"}>
                {theme === "pro" ? "Classic view" : "Professional view"}
              </button>
              <button className="add" onClick={() => setAdding(true)}><Plus size={15} /> Add member</button>
            </div>
          </header>

          <div className="content">
            {view === "dashboard" && <Dashboard rows={rows} lens={lens} onOpen={setSelected} onAdvance={advance} />}
            {view === "members" && <MembersView rows={rows} onOpen={setSelected} />}
            {view === "board" && <BoardView rows={rows} onOpen={setSelected} />}
          </div>
        </main>
      </div>

      {selectedRow && (
        <Drawer
          row={selectedRow}
          onClose={() => setSelected(null)}
          onAdvance={advance}
          onBack={stepBack}
          onTouch={touch}
          onPatch={patch}
          onRemove={removeMember}
        />
      )}
      {adding && <AddModal onClose={() => setAdding(false)} onSave={addMember} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  DASHBOARD                                                          */
/* ------------------------------------------------------------------ */
function Dashboard({ rows, lens, onOpen, onAdvance }) {
  const total = rows.length;
  const newWeek = rows.filter((r) => r.d.isNew).length;
  const strat = rows.filter((r) => r.m.pos === 1).length;
  const cvwork = rows.filter((r) => r.m.pos === 4 || r.m.pos === 5).length;
  const mock = rows.filter((r) => r.m.pos === 8).length;
  const risk = rows.filter((r) => r.d.atRisk).length;

  const yours = rows.filter((r) => r.d.owner === "me").sort((a, b) => b.d.dInStage - a.d.dInStage);
  const va = rows.filter((r) => r.d.owner === "va").sort((a, b) => b.d.dInStage - a.d.dInStage);
  const chase = rows.filter((r) => r.d.staleWait).sort((a, b) => b.d.dInStage - a.d.dInStage);
  const atRisk = rows.filter((r) => r.d.atRisk).sort((a, b) => b.d.dInactive - a.d.dInactive);

  const week = [
    { day: "Mon", theme: "Onboard", n: rows.filter((r) => r.m.pos === 0).length },
    { day: "Tue", theme: "Strategy", n: rows.filter((r) => r.m.pos === 1 || r.m.pos === 2).length },
    { day: "Wed", theme: "Live clinics", n: rows.filter((r) => r.m.pos === 6 || r.m.pos === 7).length },
    { day: "Thu", theme: "CV reports", n: rows.filter((r) => r.m.pos === 4 || r.m.pos === 5).length },
    { day: "Fri", theme: "Mock interviews", n: rows.filter((r) => r.m.pos === 8).length },
  ];
  const todayIdx = Math.min(4, Math.max(0, new Date().getDay() - 1));

  const showYours = lens !== "va";
  const showVa = lens !== "me";

  return (
    <div className="dash">
      <div className="statgrid">
        <Stat num={total} label="Active members" />
        <Stat num={newWeek} label="Joined this week" tone={newWeek ? "new" : ""} />
        <Stat num={strat} label="Strategies to write" tone={strat ? "me" : ""} />
        <Stat num={cvwork} label="CV reports in flight" tone={cvwork ? "va" : ""} />
        <Stat num={mock} label="Ready for mock" tone={mock ? "me" : ""} />
        <Stat num={risk} label="At risk" tone={risk ? "risk" : ""} />
      </div>

      <div className="week">
        {week.map((w, i) => (
          <div key={w.day} className={"weekday" + (i === todayIdx ? " istoday" : "") + (w.n ? " hot" : "")}>
            <span className="wd">{w.day}</span>
            <span className="wt">{w.theme}</span>
            <span className="wn">{w.n}</span>
          </div>
        ))}
      </div>

      <div className="cols">
        {showYours && (
          <Queue title="Your queue" cls="me" empty="Nothing needs writing. Clear desk." rows={yours} onOpen={onOpen} onAdvance={onAdvance} />
        )}
        {showVa && (
          <Queue title="VA queue" cls="va" empty="VA is all caught up." rows={va} onOpen={onOpen} onAdvance={onAdvance} />
        )}
      </div>

      <div className="dgrid">
        <Panel title="Chase — waiting on member" icon={<Clock size={15} />} tone="wait" count={chase.length}>
          {chase.length === 0 ? <Empty text="No one's gone quiet on a deliverable." /> :
            chase.map((r) => (
              <MiniRow key={r.m.id} r={r} onOpen={onOpen} meta={`Waiting ${ago(r.d.dInStage)}`} />
            ))}
        </Panel>
        <Panel title="At risk — no activity 14 days+" icon={<AlertTriangle size={15} />} tone="risk" count={atRisk.length}>
          {atRisk.length === 0 ? <Empty text="Everyone's engaged." /> :
            atRisk.map((r) => (
              <MiniRow key={r.m.id} r={r} onOpen={onOpen} meta={`Quiet ${ago(r.d.dInactive)}`} />
            ))}
        </Panel>
        <Panel title="Live sessions this week" icon={<Calendar size={15} />} tone="plain">
          {[["CV Clinic", "Mon"], ["Cover Letter Clinic", "Tue"], ["Interview Clinic", "Wed"], ["Mock Interviews", "Fri"]].map(([s, day]) => (
            <div key={s} className="session">
              <span className="sdot" /><span className="sname">{s}</span><span className="sday">{day}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Queue({ title, cls, rows, empty, onOpen, onAdvance }) {
  return (
    <div className="queue">
      <div className={"colhead " + cls}>
        <span className={"cdot " + cls} />{title}
        <span className="ccount">{rows.length}</span>
      </div>
      {rows.length === 0 ? <div className="qempty">{empty}</div> :
        rows.map((r) => (
          <div key={r.m.id} className={"qcard" + (r.d.overdue ? " od" : "")} onClick={() => onOpen(r.m.id)}>
            <div className="qmain">
              <div className="qname">{r.m.name}{r.d.overdue && <span className="odtag">{ago(r.d.dInStage)}</span>}</div>
              <div className="qact">{r.d.action.label}</div>
            </div>
            <button
              className={"adv " + cls}
              title={"Mark done: " + r.d.action.done}
              onClick={(e) => { e.stopPropagation(); onAdvance(r.m.id); }}
            >
              <Check size={15} />
            </button>
          </div>
        ))}
    </div>
  );
}

function Stat({ num, label, tone = "" }) {
  return (
    <div className={"stat " + tone}>
      <div className="num">{num}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

function Panel({ title, icon, tone, count, children }) {
  return (
    <div className="panel">
      <div className={"phead " + tone}>
        {icon}<span>{title}</span>
        {typeof count === "number" && <span className="pcount">{count}</span>}
      </div>
      <div className="pbody">{children}</div>
    </div>
  );
}

function MiniRow({ r, onOpen, meta }) {
  return (
    <div className="minirow" onClick={() => onOpen(r.m.id)}>
      <span className="mname">{r.m.name}</span>
      <span className="mstage">{MILESTONES[r.d.action.ms]}</span>
      <span className="mmeta">{meta}</span>
      <ChevronRight size={14} className="mchev" />
    </div>
  );
}

function Empty({ text }) { return <div className="pempty">{text}</div>; }

/* ------------------------------------------------------------------ */
/*  MEMBERS                                                            */
/* ------------------------------------------------------------------ */
const FILTERS = [
  { k: "all", label: "All", test: () => true },
  { k: "new", label: "New", test: (r) => r.d.isNew },
  { k: "strat", label: "Needs strategy", test: (r) => r.m.pos === 1 },
  { k: "cvrev", label: "Needs CV review", test: (r) => r.m.pos === 4 },
  { k: "cvrep", label: "Needs CV report", test: (r) => r.m.pos === 5 },
  { k: "mock", label: "Ready for mock", test: (r) => r.m.pos === 8 },
  { k: "wait", label: "Waiting on member", test: (r) => r.d.ball === "member" },
  { k: "risk", label: "At risk", test: (r) => r.d.atRisk },
  { k: "placed", label: "Placed", test: (r) => r.d.placed },
];

function MembersView({ rows, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const active = FILTERS.find((f) => f.k === filter) || FILTERS[0];
  const list = rows
    .filter(active.test)
    .filter((r) => r.m.name.toLowerCase().includes(q.toLowerCase()) || r.m.industry.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.m.name.localeCompare(b.m.name));

  return (
    <div className="members">
      <div className="mbar">
        <div className="searchbox">
          <Search size={15} />
          <input placeholder="Search by name or industry" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">
          {FILTERS.map((f) => {
            const n = rows.filter(f.test).length;
            return (
              <button key={f.k} className={"chip" + (filter === f.k ? " on" : "")} onClick={() => setFilter(f.k)}>
                {f.label}<span className="chipn">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mlist">
        {list.length === 0 && <div className="pempty">No members match this filter yet.</div>}
        {list.map((r) => (
          <div key={r.m.id} className="mcard" onClick={() => onOpen(r.m.id)}>
            <div className="mcname">
              {r.m.name}
              {r.d.isNew && <span className="tag new">New</span>}
              {r.d.atRisk && <span className="tag risk">At risk</span>}
              {r.d.overdue && <span className="tag od">Overdue</span>}
              {r.d.placed && <span className="tag done">Placed</span>}
            </div>
            <div className="mcmeta">{r.m.industry} · {r.m.visa}</div>
            <div className="mcstage">
              <span className={"sdot2 " + OWNER[r.d.owner].cls} />
              {r.d.placed ? "Success story" : r.d.action.label}
            </div>
            <div className="mcprog">
              <div className="bar"><i style={{ width: r.d.progress + "%" }} className={OWNER[r.d.owner].cls} /></div>
              <span className="pct">{MILESTONES[r.d.action.ms]}</span>
            </div>
            <span className={"owner " + OWNER[r.d.owner].cls}>{OWNER[r.d.owner].label}</span>
            <ChevronRight size={16} className="mchev2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PIPELINE BOARD                                                     */
/* ------------------------------------------------------------------ */
function BoardView({ rows, onOpen }) {
  const cols = MILESTONES.map((name, i) => ({
    name, i,
    items: rows.filter((r) => (r.d.placed ? 9 : r.d.action.ms) === i),
  })).filter((c) => c.i !== 0); // skip "Joined" (transient)

  return (
    <div className="board">
      {cols.map((c) => (
        <div key={c.i} className="bcol">
          <div className="bcolhead">
            {c.name}<span className="bcount">{c.items.length}</span>
          </div>
          <div className="bcolbody">
            {c.items.map((r) => (
              <div key={r.m.id} className={"bcard " + OWNER[r.d.owner].cls} onClick={() => onOpen(r.m.id)}>
                <div className="bname">{r.m.name}</div>
                <div className="bindustry">{r.m.industry}</div>
                <div className="bfoot">
                  <span className={"owner sm " + OWNER[r.d.owner].cls}>{OWNER[r.d.owner].label}</span>
                  {r.d.overdue && <span className="bflag od">{ago(r.d.dInStage)}</span>}
                  {r.d.atRisk && <span className="bflag risk">quiet</span>}
                </div>
              </div>
            ))}
            {c.items.length === 0 && <div className="bempty">—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MEMBER DRAWER  (the profile + the journey spine)                   */
/* ------------------------------------------------------------------ */
  function Drawer({ row, onClose, onAdvance, onBack, onTouch, onPatch, onRemove }) {
  const { m, d } = row;
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dtop">
          <button className="iconbtn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="dhead">
          <div className="dtitle">
            <h2>{m.name}</h2>
            <span className={"owner " + OWNER[d.owner].cls}>{OWNER[d.owner].label}</span>
          </div>
          <div className="dsub">{m.industry} · {m.visa} · joined {fmtDate(m.joinDate)}</div>
          <div className="dcontact">
            {m.email && <a href={"mailto:" + m.email}><Mail size={13} />{m.email}</a>}
            {m.phone && <span><Phone size={13} />{m.phone}</span>}
            {m.uni && <span><GraduationCap size={13} />{m.uni}</span>}
          </div>
        </div>

        {/* Primary action */}
        {!d.placed ? (
          <div className={"actbar " + OWNER[d.owner].cls}>
            <div className="actinfo">
              <span className="actnow">{d.action.label}</span>
              <span className="actmeta">
                {d.ball === "us" ? OWNER[d.owner].label + " · " : "Member · "}
                {ago(d.dInStage)} in stage
                {d.overdue && " · overdue"}
              </span>
            </div>
            <button className={"cta " + OWNER[d.owner].cls} onClick={() => onAdvance(m.id)}>
              {d.action.done} <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="actbar done">
            <div className="actinfo"><span className="actnow"><Trophy size={15} /> Placed — success story</span></div>
          </div>
        )}

        {/* Journey spine */}
        <div className="spine">
          {MILESTONES.map((name, i) => {
            const st = milestoneState(m.pos, i);
            return (
              <div key={i} className={"step " + st}>
                <div className="stepdot">{st === "done" ? <Check size={12} /> : st === "current" ? <span className="pulse" /> : null}</div>
                <div className="steptxt">
                  <span className="stepname">{name}</span>
                  {st === "current" && <span className="stephint">{d.action.label}</span>}
                </div>
                {i < MILESTONES.length - 1 && <div className={"stepline " + (st === "done" ? "filled" : "")} />}
              </div>
            );
          })}
        </div>

        <div className="drow">
          <button className="ghost" onClick={() => onTouch(m.id)}><Sparkles size={14} /> Log activity</button>
          {m.pos > 0 && <button className="ghost" onClick={() => onBack(m.id)}><Undo2 size={14} /> Move back a step</button>}
          <button className="ghost" onClick={() => setEdit((s) => !s)}>{edit ? "Done editing" : "Edit details"}</button>
          <button className="ghost danger" onClick={() => onRemove(m.id)}><X size={14} /> Remove member</button>
        </div>

        {/* Details */}
        <div className="details">
          <Field label="Target roles" value={m.roles} edit={edit} onChange={(v) => onPatch(m.id, { roles: v })} />
          <div className="frow">
            <Field label="Industry" value={m.industry} edit={edit} onChange={(v) => onPatch(m.id, { industry: v })} half />
            <Field label="University" value={m.uni} edit={edit} onChange={(v) => onPatch(m.id, { uni: v })} half />
          </div>
          <div className="frow">
            <Field label="Visa" value={m.visa} edit={edit} onChange={(v) => onPatch(m.id, { visa: v })} half />
            <Field label="Phone" value={m.phone} edit={edit} onChange={(v) => onPatch(m.id, { phone: v })} half placeholder="—" />
          </div>
          <label className="lintoggle">
            <input type="checkbox" checked={!!m.linkedin} onChange={(e) => onPatch(m.id, { linkedin: e.target.checked })} />
            LinkedIn profile rebuilt
          </label>
          <div className="notes">
            <label>Notes</label>
            <textarea value={m.notes} placeholder="Context, preferences, anything the next handoff should know…"
              onChange={(e) => onPatch(m.id, { notes: e.target.value })} />
          </div>
          <div className="meta2">
            <span>Joined {fmtDate(m.joinDate)}</span>
            <span>Last activity {ago(d.dInactive)} ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, edit, onChange, half, placeholder }) {
  return (
    <div className={"field" + (half ? " half" : "")}>
      <label>{label}</label>
      {edit
        ? <input value={value} onChange={(e) => onChange(e.target.value)} />
        : <div className="fval">{value || placeholder || "—"}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ADD MEMBER                                                         */
/* ------------------------------------------------------------------ */
function AddModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", email: "", visa: "Graduate", uni: "", industry: "", roles: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim().length > 0;
  return (
    <div className="backdrop center" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mtop"><h3>Add member</h3><button className="iconbtn" onClick={onClose}><X size={18} /></button></div>
        <p className="msub">They start at <b>Joined</b>. The onboarding review lands in the VA queue automatically.</p>
        <div className="mform">
          <div className="field"><label>Name</label><input autoFocus value={f.name} onChange={set("name")} placeholder="Full name" /></div>
          <div className="frow">
            <div className="field half"><label>Email</label><input value={f.email} onChange={set("email")} placeholder="name@email.com" /></div>
            <div className="field half"><label>Visa</label>
              <select value={f.visa} onChange={set("visa")}>
                <option>Graduate</option><option>Skilled Worker</option><option>Student</option><option>Other</option>
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="field half"><label>Industry</label><input value={f.industry} onChange={set("industry")} placeholder="e.g. Finance" /></div>
            <div className="field half"><label>University</label><input value={f.uni} onChange={set("uni")} placeholder="University" /></div>
          </div>
          <div className="field"><label>Target roles</label><input value={f.roles} onChange={set("roles")} placeholder="e.g. Analyst, Associate" /></div>
        </div>
        <div className="mactions">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!valid} onClick={() => onSave(f)}>Add to pipeline</button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, count }) {
  return (
    <button className={"navitem" + (active ? " active" : "")} onClick={onClick}>
      {icon}<span>{label}</span>{typeof count === "number" && <span className="navcount">{count}</span>}
    </button>
  );
}

function Loading() {
  return (
    <>
      <style>{CSS}</style>
      <div className="loading"><div className="spin" />Loading your pipeline…</div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#fbfbfa; --surface:#ffffff; --panel:#f6f6f4; --panel2:#f0f0ed;
  --ink:#1c1b1a; --ink2:#6b6a67; --ink3:#a3a29e; --line:#eceae6;
  --me:#5b52e0; --me-t:#eeedfd;
  --va:#0e9384; --va-t:#e2f4f1;
  --member:#c2740b; --member-t:#fbf0dd;
  --risk:#dc2626; --risk-t:#fbe9e9;
  --done:#15803d; --done-t:#e6f2ea;
  --new:#2563eb; --new-t:#e8f0fe;
  --radius:12px; --shadow:0 1px 2px rgba(20,20,20,.05),0 4px 16px rgba(20,20,20,.04);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
}
.app.theme-pro{
  --bg:#eef2f7; --surface:#ffffff; --panel:#f8fafc; --panel2:#eef2f8;
  --ink:#0f172a; --ink2:#475569; --ink3:#94a3b8; --line:#dbe3ee;
  --me:#334eea; --me-t:#eaf0ff;
  --va:#0f766e; --va-t:#e0f7f4;
  --member:#b45309; --member-t:#fef2e2;
  --risk:#c2410c; --risk-t:#fff1eb;
  --done:#15803d; --done-t:#e7f8ed;
  --new:#2563eb; --new-t:#e8f0fe;
  --radius:16px; --shadow:0 14px 36px rgba(15,23,42,.08),0 2px 8px rgba(15,23,42,.04);
  font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.app{display:flex;min-height:100vh;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.app.theme-pro .sidebar{width:240px;padding:20px 16px;background:linear-gradient(180deg,#0f172a 0%,#111827 100%);border-right:1px solid rgba(148,163,184,.18)}
.app.theme-pro .brandmark{background:linear-gradient(135deg,#2563eb,#0f766e);box-shadow:0 14px 28px rgba(37,99,235,.28)}
.app.theme-pro .brandtext b,.app.theme-pro .brandtext span,.app.theme-pro .navitem,.app.theme-pro .reset{color:#e2e8f0}
.app.theme-pro .brandtext b{font-size:14px}
.app.theme-pro .brandtext span,.app.theme-pro .navcount,.app.theme-pro .reset{color:rgba(226,232,240,.72)}
.app.theme-pro .brandtext span{font-size:12px}
.app.theme-pro .navitem:hover{background:rgba(255,255,255,.06);color:#fff}
.app.theme-pro .navitem.active{background:rgba(255,255,255,.12);color:#fff}
.app.theme-pro .navitem.active .navcount{color:rgba(255,255,255,.7)}
.app.theme-pro .reset{border-color:rgba(148,163,184,.2);background:rgba(255,255,255,.04)}
.app.theme-pro .reset:hover{border-color:rgba(226,232,240,.35);color:#fff;background:rgba(255,255,255,.06)}
.app.theme-pro .topbar{padding:15px 24px;background:rgba(238,242,247,.84);backdrop-filter:blur(12px)}
.app.theme-pro .lensbtn,.app.theme-pro .themebtn{border-radius:999px}
.app.theme-pro .today{font-size:15px}
.app.theme-pro .lenslbl{font-size:12.5px}
.app.theme-pro .themebtn{border:1px solid var(--line);background:var(--surface);padding:7px 12px;font-size:12px;color:var(--ink2);cursor:pointer;font-family:inherit;font-weight:600;transition:.12s}
.app.theme-pro .themebtn:hover{border-color:var(--ink3);color:var(--ink)}
.app.theme-pro .add{border-radius:999px;padding:9px 14px;min-height:36px;box-shadow:0 10px 22px rgba(15,23,42,.14)}
.app.theme-pro .stat,.app.theme-pro .queue,.app.theme-pro .panel,.app.theme-pro .mcard,.app.theme-pro .weekday,.app.theme-pro .bcard,.app.theme-pro .drawer,.app.theme-pro .modal{box-shadow:var(--shadow)}
.app.theme-pro .mcard:hover,.app.theme-pro .bcard:hover,.app.theme-pro .minirow:hover,.app.theme-pro .qcard:hover{transform:translateY(-1px)}
.app.theme-pro .content{padding:22px 24px 56px;max-width:1320px}
.app.theme-pro .searchbox,.app.theme-pro .chip,.app.theme-pro .lensbtn,.app.theme-pro .adv,.app.theme-pro .ghost,.app.theme-pro .iconbtn,.app.theme-pro .field input,.app.theme-pro .field select,.app.theme-pro .notes textarea{border-radius:10px}
.app.theme-pro .statgrid{gap:14px}
.app.theme-pro .stat{padding:15px 16px 14px}
.app.theme-pro .stat .num{font-size:28px;letter-spacing:-1px}
.app.theme-pro .stat .lbl{font-size:12.5px;line-height:1.45}
.app.theme-pro .week{gap:12px;margin-top:18px}
.app.theme-pro .weekday{padding:14px 15px}
.app.theme-pro .weekday .wt{font-size:13.5px}
.app.theme-pro .weekday .wn{font-size:18px}
.app.theme-pro .cols,.app.theme-pro .dgrid{gap:14px}
.app.theme-pro .queue{padding:10px}
.app.theme-pro .colhead{padding:8px 10px 10px;font-size:12.5px}
.app.theme-pro .qcard{padding:10px 11px}
.app.theme-pro .panel{border-radius:14px}
.app.theme-pro .phead{padding:12px 14px}
.app.theme-pro .minirow{padding:8px 10px}
.app.theme-pro .mname{font-size:13.5px}
.app.theme-pro .mstage,.app.theme-pro .mcmeta,.app.theme-pro .pct,.app.theme-pro .bindustry,.app.theme-pro .sday,.app.theme-pro .actmeta{font-size:12.5px}
.app.theme-pro .board{gap:12px}
.app.theme-pro .bcol{width:220px;min-width:220px;padding:10px}
.app.theme-pro .drawer{width:430px}
.app.theme-pro .dhead{padding:4px 22px 16px}
.app.theme-pro .dtitle h2{font-size:21px}
.app.theme-pro .dsub{font-size:13px}
.app.theme-pro .dcontact a,.app.theme-pro .dcontact span{font-size:12.5px}
.app.theme-pro .actbar{margin:0 22px;padding:14px 15px}
.app.theme-pro .actnow{font-size:14.5px}
.app.theme-pro .spine{padding:20px 22px 8px}
.app.theme-pro .stepname{font-size:13.5px}
.app.theme-pro .stephint{font-size:12px}
.app.theme-pro .details{padding:14px 22px 36px}
.app.theme-pro .field label,.app.theme-pro .notes label{font-size:11.5px}
.app.theme-pro .fval,.app.theme-pro .field input,.app.theme-pro .field select,.app.theme-pro .notes textarea{font-size:13.5px}
.app.theme-pro .modal{width:430px}

/* sidebar */
.sidebar{width:232px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--line);
  display:flex;flex-direction:column;padding:18px 14px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px}
.brandmark{width:34px;height:34px;border-radius:9px;background:var(--ink);color:#fff;
  display:grid;place-items:center;font-weight:700;font-size:12px;letter-spacing:.5px}
.brandtext{display:flex;flex-direction:column;line-height:1.25}
.brandtext b{font-size:13.5px;font-weight:650}
.brandtext span{font-size:11.5px;color:var(--ink3)}
.nav{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.navitem{display:flex;align-items:center;gap:11px;padding:9px 11px;border:none;background:none;
  border-radius:9px;font-size:13.5px;color:var(--ink2);cursor:pointer;width:100%;text-align:left;
  font-family:inherit;transition:background .12s,color .12s}
.navitem span{flex:1;font-weight:500}
.navitem:hover{background:var(--panel);color:var(--ink)}
.navitem.active{background:var(--ink);color:#fff}
.navitem.active:hover{background:var(--ink)}
.navcount{font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums;flex:none!important}
.navitem.active .navcount{color:rgba(255,255,255,.6)}
.sidefoot{margin-top:auto;padding-top:12px}
.reset{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink3);background:none;
  border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;cursor:pointer;
  font-family:inherit;transition:.12s}
.reset:hover{color:var(--ink2);border-color:var(--ink3)}

/* main + topbar */
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:16px 26px;border-bottom:1px solid var(--line);background:rgba(251,251,250,.85);
  backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
.today{font-size:14px;font-weight:600;letter-spacing:-.1px}
.lens{display:flex;align-items:center;gap:6px}
.lenslbl{font-size:12px;color:var(--ink3);margin-right:2px}
.lensbtn{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 12px;
  font-size:12.5px;color:var(--ink2);cursor:pointer;font-family:inherit;font-weight:500;transition:.12s}
.lensbtn:hover{border-color:var(--ink3)}
.lensbtn.on{color:#fff;border-color:transparent}
.lensbtn.on.all{background:var(--ink)}
.lensbtn.on.me{background:var(--me)}
.lensbtn.on.va{background:var(--va)}
.themebtn{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 12px;
  font-size:12.5px;color:var(--ink2);cursor:pointer;font-family:inherit;font-weight:500;transition:.12s}
.themebtn:hover{border-color:var(--ink3);color:var(--ink)}
.add{display:flex;align-items:center;gap:6px;margin-left:8px;background:var(--ink);color:#fff;border:none;
  border-radius:8px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:.12s}
.add:hover{opacity:.9}
.content{padding:24px 26px 60px;max-width:1240px;width:100%}

/* stats */
.statgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 16px 14px;
  box-shadow:var(--shadow)}
.stat .num{font-size:30px;font-weight:680;letter-spacing:-1.2px;line-height:1;font-variant-numeric:tabular-nums}
.stat .lbl{font-size:12px;color:var(--ink2);margin-top:8px;line-height:1.35}
.stat.me .num{color:var(--me)} .stat.va .num{color:var(--va)}
.stat.risk .num{color:var(--risk)} .stat.new .num{color:var(--new)}

/* week strip */
.week{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}
.weekday{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;
  display:flex;flex-direction:column;gap:2px;position:relative}
.weekday .wd{font-size:11px;font-weight:700;color:var(--ink3);letter-spacing:.4px;text-transform:uppercase}
.weekday .wt{font-size:13px;font-weight:600;margin-top:1px}
.weekday .wn{position:absolute;top:12px;right:14px;font-size:19px;font-weight:700;color:var(--ink3);
  font-variant-numeric:tabular-nums}
.weekday.hot .wn{color:var(--ink)}
.weekday.istoday{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}

/* queues */
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
.queue{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:8px;box-shadow:var(--shadow)}
.colhead{display:flex;align-items:center;gap:9px;padding:10px 12px 12px;font-size:13px;font-weight:650}
.cdot{width:8px;height:8px;border-radius:50%}
.cdot.me{background:var(--me)} .cdot.va{background:var(--va)}
.ccount{margin-left:auto;font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
.qcard{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:9px;cursor:pointer;transition:background .12s}
.qcard:hover{background:var(--panel)}
.qcard.od{background:var(--risk-t)}
.qcard.od:hover{background:#f7dede}
.qmain{flex:1;min-width:0}
.qname{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:8px}
.odtag{font-size:10.5px;font-weight:700;color:var(--risk);background:#fff;border-radius:5px;padding:1px 6px}
.qact{font-size:12px;color:var(--ink2);margin-top:2px}
.adv{width:30px;height:30px;flex:none;border-radius:8px;border:1px solid var(--line);background:var(--surface);
  display:grid;place-items:center;cursor:pointer;color:var(--ink3);transition:.12s}
.adv.me:hover{background:var(--me);border-color:var(--me);color:#fff}
.adv.va:hover{background:var(--va);border-color:var(--va);color:#fff}
.qempty{padding:14px 12px 18px;font-size:12.5px;color:var(--ink3)}

/* bottom grid */
.dgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.phead{display:flex;align-items:center;gap:8px;padding:13px 15px;font-size:12.5px;font-weight:650;border-bottom:1px solid var(--line)}
.phead.wait{color:var(--member)} .phead.risk{color:var(--risk)}
.pcount{margin-left:auto;font-size:11.5px;background:var(--panel);border-radius:20px;padding:1px 8px;color:var(--ink2)}
.pbody{padding:6px}
.minirow{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:.12s}
.minirow:hover{background:var(--panel)}
.mname{font-size:13px;font-weight:600;flex:none}
.mstage{font-size:11px;color:var(--ink3)}
.mmeta{margin-left:auto;font-size:11.5px;color:var(--ink2);font-weight:500}
.mchev{color:var(--ink3)}
.pempty,.qempty{font-size:12.5px;color:var(--ink3)}
.pempty{padding:14px 12px}
.session{display:flex;align-items:center;gap:9px;padding:9px 10px}
.sdot{width:7px;height:7px;border-radius:50%;background:var(--va)}
.sname{font-size:13px;font-weight:550}
.sday{margin-left:auto;font-size:11.5px;color:var(--ink3);font-weight:600}

/* members */
.mbar{display:flex;flex-direction:column;gap:12px;margin-bottom:18px}
.searchbox{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);
  border-radius:10px;padding:0 12px;max-width:340px;color:var(--ink3)}
.searchbox input{border:none;background:none;padding:10px 0;font-size:13.5px;flex:1;outline:none;font-family:inherit;color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface);
  border-radius:20px;padding:6px 12px;font-size:12.5px;color:var(--ink2);cursor:pointer;font-family:inherit;
  font-weight:500;transition:.12s}
.chip:hover{border-color:var(--ink3)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.chipn{font-size:11px;opacity:.6;font-variant-numeric:tabular-nums}
.mlist{display:flex;flex-direction:column;gap:8px}
.mcard{display:grid;grid-template-columns:1.6fr 1.3fr 1.6fr 1.4fr auto auto;align-items:center;gap:16px;
  background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px 16px;cursor:pointer;
  transition:.12s;box-shadow:var(--shadow)}
.mcard:hover{border-color:var(--ink3);transform:translateY(-1px)}
.mcname{font-size:14px;font-weight:620;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.tag{font-size:10px;font-weight:700;border-radius:5px;padding:2px 6px;letter-spacing:.2px}
.tag.new{background:var(--new-t);color:var(--new)}
.tag.risk{background:var(--risk-t);color:var(--risk)}
.tag.od{background:var(--member-t);color:var(--member)}
.tag.done{background:var(--done-t);color:var(--done)}
.mcmeta{font-size:12.5px;color:var(--ink2)}
.mcstage{font-size:12.5px;color:var(--ink);display:flex;align-items:center;gap:8px}
.sdot2{width:7px;height:7px;border-radius:50%;flex:none}
.sdot2.me{background:var(--me)} .sdot2.va{background:var(--va)}
.sdot2.member{background:var(--member)} .sdot2.done{background:var(--done)}
.mcprog{display:flex;flex-direction:column;gap:5px}
.bar{height:5px;background:var(--panel2);border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:4px}
.bar i.me{background:var(--me)} .bar i.va{background:var(--va)}
.bar i.member{background:var(--member)} .bar i.done{background:var(--done)}
.pct{font-size:11px;color:var(--ink3)}
.owner{font-size:11px;font-weight:700;border-radius:6px;padding:3px 9px;letter-spacing:.2px}
.owner.me{background:var(--me-t);color:var(--me)}
.owner.va{background:var(--va-t);color:var(--va)}
.owner.member{background:var(--member-t);color:var(--member)}
.owner.done{background:var(--done-t);color:var(--done)}
.owner.sm{padding:2px 7px;font-size:10px}
.mchev2{color:var(--ink3)}

/* board */
.board{display:flex;gap:14px;overflow-x:auto;padding-bottom:14px}
.bcol{min-width:210px;width:210px;flex:none;background:var(--panel);border-radius:var(--radius);padding:10px}
.bcolhead{display:flex;align-items:center;font-size:12.5px;font-weight:650;padding:4px 6px 12px}
.bcount{margin-left:auto;font-size:11px;color:var(--ink3);background:var(--surface);border-radius:20px;padding:1px 8px}
.bcolbody{display:flex;flex-direction:column;gap:8px}
.bcard{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--ink3);
  border-radius:9px;padding:11px 12px;cursor:pointer;transition:.12s}
.bcard:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.bcard.me{border-left-color:var(--me)} .bcard.va{border-left-color:var(--va)}
.bcard.member{border-left-color:var(--member)} .bcard.done{border-left-color:var(--done)}
.bname{font-size:13px;font-weight:620}
.bindustry{font-size:11.5px;color:var(--ink2);margin-top:2px}
.bfoot{display:flex;align-items:center;gap:6px;margin-top:9px}
.bflag{font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px}
.bflag.od{background:var(--member-t);color:var(--member)}
.bflag.risk{background:var(--risk-t);color:var(--risk)}
.bempty{font-size:12px;color:var(--ink3);padding:8px 6px;text-align:center}

/* drawer */
.backdrop{position:fixed;inset:0;background:rgba(20,20,20,.28);z-index:40;display:flex;justify-content:flex-end;
  animation:fade .16s ease}
.backdrop.center{align-items:center;justify-content:center}
@keyframes fade{from{opacity:0}to{opacity:1}}
.drawer{width:460px;max-width:94vw;height:100vh;background:var(--surface);overflow-y:auto;
  box-shadow:-8px 0 40px rgba(20,20,20,.12);animation:slide .2s cubic-bezier(.16,1,.3,1)}
@keyframes slide{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}
.dtop{display:flex;justify-content:flex-end;padding:14px 16px 0}
.iconbtn{width:32px;height:32px;border-radius:8px;border:none;background:none;display:grid;place-items:center;
  cursor:pointer;color:var(--ink3);transition:.12s}
.iconbtn:hover{background:var(--panel);color:var(--ink)}
.dhead{padding:4px 24px 18px}
.dtitle{display:flex;align-items:center;gap:11px}
.dtitle h2{font-size:22px;font-weight:680;letter-spacing:-.5px}
.dsub{font-size:12.5px;color:var(--ink2);margin-top:5px}
.dcontact{display:flex;flex-wrap:wrap;gap:14px;margin-top:11px}
.dcontact a,.dcontact span{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--ink2);text-decoration:none}
.dcontact a:hover{color:var(--me)}
.actbar{margin:0 24px;border-radius:var(--radius);padding:15px 16px;display:flex;align-items:center;gap:14px}
.actbar.me{background:var(--me-t)} .actbar.va{background:var(--va-t)}
.actbar.member{background:var(--member-t)} .actbar.done{background:var(--done-t)}
.actinfo{flex:1;display:flex;flex-direction:column;gap:3px}
.actnow{font-size:14px;font-weight:650;display:flex;align-items:center;gap:6px}
.actmeta{font-size:11.5px;color:var(--ink2)}
.actbar.done .actnow{color:var(--done)}
.cta{display:flex;align-items:center;gap:7px;border:none;border-radius:9px;padding:11px 15px;color:#fff;
  font-size:13px;font-weight:650;cursor:pointer;font-family:inherit;transition:.12s;white-space:nowrap}
.cta.me{background:var(--me)} .cta.va{background:var(--va)} .cta.member{background:var(--member)}
.cta:hover{opacity:.9}
.spine{padding:22px 24px 8px}
.step{position:relative;padding-left:30px;padding-bottom:16px}
.step:last-child{padding-bottom:4px}
.stepdot{position:absolute;left:0;top:1px;width:18px;height:18px;border-radius:50%;border:2px solid var(--line);
  background:var(--surface);display:grid;place-items:center;color:#fff;z-index:2}
.step.done .stepdot{background:var(--done);border-color:var(--done)}
.step.current .stepdot{border-color:var(--me);background:var(--me)}
.pulse{width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.7);
  animation:pulse 1.8s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(91,82,224,.4)}70%{box-shadow:0 0 0 7px rgba(91,82,224,0)}100%{box-shadow:0 0 0 0 rgba(91,82,224,0)}}
.stepline{position:absolute;left:8px;top:20px;bottom:-2px;width:2px;background:var(--line);z-index:1}
.stepline.filled{background:var(--done)}
.steptxt{display:flex;flex-direction:column;gap:2px}
.stepname{font-size:13px;font-weight:550;color:var(--ink2)}
.step.done .stepname{color:var(--ink)}
.step.current .stepname{color:var(--ink);font-weight:680}
.stephint{font-size:11.5px;color:var(--me);font-weight:600}
.drow{display:flex;gap:8px;padding:8px 24px 4px;flex-wrap:wrap}
.ghost{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);
  border-radius:8px;padding:8px 11px;font-size:12px;color:var(--ink2);cursor:pointer;font-family:inherit;
  font-weight:500;transition:.12s}
.ghost:hover{border-color:var(--ink3);color:var(--ink)}
.ghost.danger{color:var(--risk);border-color:#f1c5c5}
.ghost.danger:hover{background:var(--risk-t);border-color:var(--risk);color:var(--risk)}
.details{padding:16px 24px 40px}
.field{margin-bottom:13px}
.field label{display:block;font-size:11px;font-weight:600;color:var(--ink3);text-transform:uppercase;
  letter-spacing:.4px;margin-bottom:5px}
.fval{font-size:13.5px;color:var(--ink)}
.field input,.field select,.notes textarea{width:100%;border:1px solid var(--line);border-radius:8px;
  padding:9px 11px;font-size:13.5px;font-family:inherit;color:var(--ink);background:var(--surface);outline:none;transition:.12s}
.field input:focus,.field select:focus,.notes textarea:focus{border-color:var(--me);box-shadow:0 0 0 3px var(--me-t)}
.frow{display:flex;gap:12px}
.field.half{flex:1}
.lintoggle{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink);margin:4px 0 16px;cursor:pointer}
.lintoggle input{width:16px;height:16px;accent-color:var(--me);cursor:pointer}
.notes label{display:block;font-size:11px;font-weight:600;color:var(--ink3);text-transform:uppercase;
  letter-spacing:.4px;margin-bottom:6px}
.notes textarea{min-height:74px;resize:vertical;line-height:1.5}
.meta2{display:flex;justify-content:space-between;margin-top:16px;font-size:11.5px;color:var(--ink3)}

/* modal */
.modal{background:var(--surface);border-radius:16px;width:460px;max-width:92vw;padding:22px 24px;
  box-shadow:0 20px 60px rgba(20,20,20,.25);animation:pop .18s cubic-bezier(.16,1,.3,1)}
@keyframes pop{from{transform:scale(.97);opacity:.5}to{transform:scale(1);opacity:1}}
.mtop{display:flex;align-items:center;justify-content:space-between}
.mtop h3{font-size:18px;font-weight:680;letter-spacing:-.3px}
.msub{font-size:12.5px;color:var(--ink2);margin:7px 0 18px;line-height:1.5}
.mform .field{margin-bottom:14px}
.mactions{display:flex;justify-content:flex-end;gap:10px;margin-top:8px}
.primary{background:var(--ink);color:#fff;border:none;border-radius:9px;padding:10px 18px;font-size:13px;
  font-weight:650;cursor:pointer;font-family:inherit;transition:.12s}
.primary:hover{opacity:.9}
.primary:disabled{opacity:.4;cursor:not-allowed}

/* loading */
.loading{height:100vh;display:flex;align-items:center;justify-content:center;gap:12px;color:var(--ink2);
  font-size:14px;background:var(--bg)}
.spin{width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--me);border-radius:50%;
  animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,a:focus-visible{
  outline:2px solid var(--me);outline-offset:1px}

@media (max-width:1080px){
  .statgrid{grid-template-columns:repeat(3,1fr)}
  .dgrid{grid-template-columns:1fr}
  .cols{grid-template-columns:1fr}
  .mcard{grid-template-columns:1fr auto;gap:10px}
  .mcmeta,.mcstage,.mcprog{grid-column:1/-1}
}
@media (max-width:720px){
  .sidebar{display:none}
  .week{grid-template-columns:repeat(2,1fr)}
  .statgrid{grid-template-columns:repeat(2,1fr)}
  .content{padding:16px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
