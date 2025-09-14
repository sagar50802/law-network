// client/src/components/scholar/ScholarSpace.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, fetchJSON, postJSON, authHeaders } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";

/** identity is stored as { name, email } in localStorage */
function loadIdentity() {
  try { return JSON.parse(localStorage.getItem("ln_identity") || "null"); } catch { return null; }
}
function saveIdentity(id) {
  localStorage.setItem("ln_identity", JSON.stringify(id));
}

export default function ScholarSpace() {
  const [identity, setIdentity] = useState(loadIdentity());
  const [groups, setGroups] = useState([]);
  const [active, setActive] = useState(null);   // active group object
  const [membership, setMembership] = useState(null); // my membership in active group
  const [messages, setMessages] = useState([]);
  const [since, setSince] = useState(null);
  const [pending, setPending] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [files, setFiles] = useState([]);

  // boot
  useEffect(() => { (async () => {
    const r = await fetchJSON(`${API_BASE}/api/scholar/groups`);
    if (r.success) setGroups(r.groups);
  })(); }, []);

  // fetch active group membership + messages
  useEffect(() => {
    if (!active || !identity) return;
    (async () => {
      const r1 = await fetchJSON(`${API_BASE}/api/scholar/groups/${active._id}?email=${encodeURIComponent(identity.email)}`);
      if (r1.success) setMembership(r1.membership || null);

      const url = `${API_BASE}/api/scholar/groups/${active._id}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`;
      const r2 = await fetchJSON(url);
      if (r2.success) {
        setMessages(prev => (since ? [...prev, ...r2.messages] : r2.messages));
        if (r2.messages.length) {
          setSince(r2.messages[r2.messages.length - 1].createdAt);
        }
      }
    })();
  }, [active, identity]); // initial

  // polling (3s)
  useEffect(() => {
    if (!active || !identity) return;
    const id = setInterval(async () => {
      const url = `${API_BASE}/api/scholar/groups/${active._id}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`;
      const r = await fetchJSON(url);
      if (r.success && r.messages.length) {
        setMessages(prev => [...prev, ...r.messages]);
        setSince(r.messages[r.messages.length - 1].createdAt);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [active, identity, since]);

  const amMember = !!membership;
  const myEmail = identity?.email?.toLowerCase() || "";

  async function createGroup(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    setPending(true);
    try {
      const r = await fetchJSON(`${API_BASE}/api/scholar/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (r.success) {
        setGroups(g => [r.group, ...g]);
        setActive(r.group);
      } else { alert(r.message || "Create failed"); }
    } finally { setPending(false); }
  }

  async function joinGroup() {
    if (!identity) return alert("Please set your name & email first.");
    if (!inviteCode) return alert("Enter invite code");
    setPending(true);
    try {
      const r = await postJSON(`${API_BASE}/api/scholar/groups/${active._id}/join`, {
        name: identity.name, email: identity.email, inviteCode: inviteCode.toUpperCase(),
      });
      if (r.success) {
        setMembership(r.membership);
        setShowJoin(false);
      } else alert(r.message || "Join failed");
    } finally { setPending(false); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!identity || !amMember) return alert("Join the group first.");
    const fd = new FormData();
    fd.append("authorEmail", identity.email);
    fd.append("authorName", identity.name);
    fd.append("text", e.currentTarget.text.value || "");
    [...files].forEach(f => fd.append("files", f));

    setPending(true);
    try {
      const r = await fetch(`${API_BASE}/api/scholar/groups/${active._id}/messages`, { method: "POST", body: fd });
      const j = await r.json();
      if (j.success) {
        setMessages(prev => [...prev, j.message]);
        setSince(j.message.createdAt);
        e.currentTarget.reset();
        setFiles([]);
      } else alert(j.message || "Send failed");
    } finally { setPending(false); }
  }

  function requireIdentity() {
    const name = prompt("Your name?");
    if (!name) return;
    const email = prompt("Your email?");
    if (!email) return;
    const id = { name, email: email.toLowerCase() };
    saveIdentity(id);
    setIdentity(id);
  }

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <section className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar */}
        <aside className="md:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Scholar Space</h2>
            {!identity ? (
              <button onClick={requireIdentity} className="px-3 py-1 text-sm rounded bg-black text-white">Set Profile</button>
            ) : (
              <div className="text-xs text-gray-600">Hi, <b>{identity.name}</b></div>
            )}
          </div>

          <IfOwnerOnly>
            <form onSubmit={createGroup} className="p-3 border rounded-lg bg-white space-y-2">
              <div className="text-sm font-medium">Create Group (Admin)</div>
              <input name="name" required placeholder="Group name" className="w-full rounded border px-3 py-2" />
              <textarea name="description" placeholder="Description (optional)" className="w-full rounded border px-3 py-2" />
              <label className="text-xs text-gray-600">Deadline (optional)</label>
              <input name="deadlineAt" type="datetime-local" className="w-full rounded border px-3 py-2" />
              <button disabled={pending} className="px-3 py-2 rounded bg-blue-600 text-white w-full">
                {pending ? "Creating..." : "Create"}
              </button>
            </form>
          </IfOwnerOnly>

          <div className="border rounded-lg bg-white">
            <div className="px-3 py-2 text-sm font-medium border-b">Groups</div>
            <ul className="max-h-[50vh] overflow-auto divide-y">
              {groups.map(g => (
                <li key={g._id}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${active?._id===g._id ? "bg-gray-100" : ""}`}
                    onClick={() => { setActive(g); setMessages([]); setMembership(null); setSince(null); }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{g.name}</div>
                      <div className="text-xs text-gray-500">{g.description || "—"}</div>
                    </div>
                    {g.deadlineAt && <DeadlineBadge deadline={g.deadlineAt} />}
                  </div>
                </li>
              ))}
              {!groups.length && <li className="px-3 py-4 text-sm text-gray-500">No groups yet.</li>}
            </ul>
          </div>
        </aside>

        {/* Chat window */}
        <section className="md:col-span-2">
          <div className="border rounded-lg bg-white h-[70vh] flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <div className="font-semibold">{active ? active.name : "Pick a group"}</div>
                {active?.description && <div className="text-xs text-gray-500">{active.description}</div>}
              </div>
              {active?.deadlineAt && <DeadlineBadge big deadline={active.deadlineAt} />}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-3 space-y-3" id="chat-scroll">
              {!active && <div className="text-sm text-gray-500">Select a group to start.</div>}
              {active && !amMember && (
                <div className="text-sm text-gray-700">
                  You’re not a member of <b>{active.name}</b>. Ask for the invite code and join.
                  <div className="mt-3 flex gap-2">
                    <input value={inviteCode} onChange={e=>setInviteCode(e.target.value)}
                           placeholder="Invite code" className="rounded border px-3 py-2" />
                    <button onClick={joinGroup} disabled={pending} className="px-3 py-2 rounded bg-emerald-600 text-white">
                      {pending ? "Joining..." : "Join"}
                    </button>
                  </div>
                </div>
              )}

              {active && amMember && messages.map(m => (
                <MessageBubble key={m._id} me={m.authorEmail.toLowerCase()===myEmail} msg={m} />
              ))}
            </div>

            {/* Composer */}
            <form onSubmit={sendMessage} className="px-3 py-2 border-t flex items-center gap-2">
              <input name="text" placeholder={amMember ? "Write a message…" : "Join to message"}
                     disabled={!amMember || pending}
                     className="flex-1 rounded border px-3 py-2" />
              <label className="text-sm px-2 py-2 rounded border cursor-pointer">
                Attach
                <input type="file" className="hidden" multiple onChange={e=>setFiles(e.target.files)} />
              </label>
              <button className="px-4 py-2 rounded bg-black text-white" disabled={!amMember || pending}>
                Send
              </button>
            </form>
          </div>

          {/* Selected files preview */}
          {!!files.length && (
            <div className="mt-2 text-xs text-gray-600">
              Attachments: {[...files].map(f => f.name).join(", ")}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MessageBubble({ me, msg }) {
  const time = useMemo(() => new Date(msg.createdAt).toLocaleTimeString(), [msg.createdAt]);
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 shadow
        ${me ? "bg-black text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"}`}>
        <div className="text-[11px] opacity-70">{me ? "You" : msg.authorName}</div>
        {!!msg.text && <div className="whitespace-pre-wrap text-sm">{msg.text}</div>}
        {!!(msg.attachments||[]).length && (
          <div className="mt-1 flex flex-col gap-1">
            {msg.attachments.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="underline text-xs break-all">
                {a.filename} ({Math.round(a.size/1024)} KB)
              </a>
            ))}
          </div>
        )}
        <div className={`text-[10px] mt-1 ${me ? "text-gray-300" : "text-gray-500"}`}>{time}</div>
      </div>
    </div>
  );
}

function DeadlineBadge({ deadline, big=false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(()=>setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const end = new Date(deadline).getTime();
  const ms = Math.max(0, end - now);
  const d = Math.floor(ms/86400000), h = Math.floor((ms%86400000)/3600000), m = Math.floor((ms%3600000)/60000);
  const txt = ms<=0 ? "Deadline passed" : `${d}d ${h}h ${m}m left`;
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded ${big ? "text-sm" : "text-xs"} 
      ${ms<=0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
      ⏳ {txt}
    </span>
  );
}
