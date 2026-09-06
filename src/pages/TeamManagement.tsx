import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, addDoc, query, orderBy, onSnapshot, doc, setDoc, where, updateDoc, deleteField } from 'firebase/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { User } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { normalizeEmployeeId } from '../lib/authHelpers';
import { Users, Send, Plus, Loader2, MessageSquare, Pencil, Save, X } from 'lucide-react';

export default function TeamManagement({ user }: { user: User }) {
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Employee State
  const generateRandomId = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return String(100000 + (values[0] % 900000));
  };
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpId, setNewEmpId] = useState(generateRandomId());
  const [newEmpPay, setNewEmpPay] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'employee' | 'manager'>('employee');
  const [newEmpManagerId, setNewEmpManagerId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPay, setEditPay] = useState('');
  const [editRole, setEditRole] = useState<'employee' | 'manager'>('employee');
  const [editManagerId, setEditManagerId] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const generateTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return `Tt!${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')}`;
  };

  // Chat State
  const [chatRecipientId, setChatRecipientId] = useState(''); // employeeId
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() } as User);
      });
      setTeamMembers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const recipientId = normalizeEmployeeId(chatRecipientId);
    if (!/^\d{6}$/.test(recipientId)) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'messages'),
      where('recipientEmpId', '==', recipientId),
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: any[] = [];
      snapshot.forEach(doc => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
    return () => unsubscribe();
  }, [chatRecipientId]);

  const nextAvailableEmployeeId = () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = generateRandomId();
      if (!teamMembers.some((member) => member.employeeId === candidate)) return candidate;
    }
    return generateRandomId();
  };

  const validEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

  const openEditMember = (member: User) => {
    if (member.role === 'admin') return;
    setEditingMember(member);
    setEditName(member.name || '');
    setEditEmail(member.contactEmail || '');
    setEditPay(String(member.payRate ?? 0));
    setEditRole(member.role === 'manager' ? 'manager' : 'employee');
    setEditManagerId(member.managerId || '');
  };

  const saveMemberEdits = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingMember) return;

    const cleanName = editName.trim();
    const cleanEmail = editEmail.trim();
    const payRate = Number(editPay || 0);
    if (!cleanName) return alert('Name is required.');
    if (!validEmail(cleanEmail)) return alert('Enter a valid contact email.');
    if (!Number.isFinite(payRate) || payRate < 0 || payRate > 100000) return alert('Enter a valid hourly pay rate.');
    if (editRole === 'employee' && editManagerId === editingMember.id) return alert('A team member cannot report to themselves.');

    setIsSavingEdit(true);
    try {
      await updateDoc(doc(db, 'users', editingMember.id), {
        name: cleanName,
        contactEmail: cleanEmail,
        payRate,
        role: editRole,
        managerId: editRole === 'employee' && editManagerId ? editManagerId : deleteField(),
      });
      setEditingMember(null);
      await fetchUsers();
    } catch (error) {
      console.error('Failed to update team member:', error);
      alert('Could not save this team member.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = normalizeEmployeeId(newEmpId);
    if (!/^\d{6}$/.test(cleanId)) {
      alert('Employee ID must be exactly 6 digits.');
      return;
    }
    if (teamMembers.some((member) => member.employeeId === cleanId)) {
      alert('That Employee ID is already in use. A new ID has been generated.');
      setNewEmpId(nextAvailableEmployeeId());
      return;
    }
    if (!newEmpName.trim()) {
      alert('Full name is required.');
      return;
    }
    if (!validEmail(newEmpEmail)) {
      alert('Enter a valid contact email.');
      return;
    }
    const parsedPayRate = Number(newEmpPay || 0);
    if (!Number.isFinite(parsedPayRate) || parsedPayRate < 0 || parsedPayRate > 100000) {
      alert('Enter a valid hourly pay rate.');
      return;
    }

    setIsAdding(true);
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;
    try {
      secondaryApp = initializeApp(auth.app.options, `SecondaryApp-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      const email = `emp${cleanId}@thinktime.local`;
      
      const temporaryPassword = generateTemporaryPassword();
      const { user: newUser } = await createUserWithEmailAndPassword(secondaryAuth, email, temporaryPassword);

      try {
        await setDoc(doc(db, 'users', newUser.uid), {
          email,
          name: newEmpName.trim(),
          contactEmail: newEmpEmail.trim(),
          role: newEmpRole,
          employeeId: cleanId,
          payRate: parsedPayRate,
          ...(newEmpRole === 'employee' && newEmpManagerId ? { managerId: newEmpManagerId } : {})
        });
      } catch (profileError) {
        await deleteUser(newUser).catch(() => undefined);
        throw profileError;
      }

      await signOut(secondaryAuth);
      
      setNewEmpName('');
      setNewEmpEmail('');
      setNewEmpId(nextAvailableEmployeeId());
      setNewEmpPay('');
      setNewEmpRole('employee');
      setNewEmpManagerId('');
      alert(`Team member added successfully.\n\nEmployee ID: EMP${cleanId}\nTemporary password: ${temporaryPassword}\n\nGive this password to the employee securely and have them change it in Settings after signing in.`);
      fetchUsers(); // Refresh list
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/email-already-in-use') {
        setNewEmpId(nextAvailableEmployeeId());
        alert('That Employee ID already exists in Firebase Authentication. ThinkTime generated a new ID; try again.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        alert('Firebase Email/Password authentication is disabled. Enable it in Firebase Console → Authentication → Sign-in method.');
      } else {
        alert(err.message || 'Failed to create employee');
      }
    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => undefined);
      }
      setIsAdding(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipientId = normalizeEmployeeId(chatRecipientId);
    if (!/^\d{6}$/.test(recipientId) || !chatMessage.trim()) return;
    if (!teamMembers.some((member) => member.employeeId === recipientId)) {
      alert('Choose a valid team member before sending a message.');
      return;
    }
    
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.id,
        senderName: user.name,
        recipientEmpId: recipientId,
        text: chatMessage,
        timestamp: Date.now()
      });
      setChatMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">Administration</h1>
            <h2 className="text-3xl font-light">Team <span className="font-bold">Management</span></h2>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          
          {/* Left Column: List and Add Form */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Add Employee Form */}
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl shrink-0">
              <h3 className="text-lg font-semibold flex items-center gap-3 mb-6">
                <Plus className="w-5 h-5 text-sky-400" />
                Add New Team Member
              </h3>
              <form onSubmit={handleAddEmployee} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                  <input 
                    type="text" required value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none" 
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Contact Email</label>
                  <input
                    type="email" required value={newEmpEmail} onChange={(e) => setNewEmpEmail(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    placeholder="jane@example.com"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                  <select 
                    value={newEmpRole} onChange={(e) => setNewEmpRole(e.target.value as any)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                {newEmpRole === 'employee' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Reports To (Manager)</label>
                    <select 
                      value={newEmpManagerId} onChange={(e) => setNewEmpManagerId(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    >
                      <option value="">-- Select Manager --</option>
                      {teamMembers.filter(m => m.role === 'manager').map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Employee ID</label>
                    <input 
                      type="text" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none uppercase font-mono" 
                      placeholder="123456"
                    />
                  </div>
                )}
                
                {newEmpRole === 'employee' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Employee ID</label>
                    <input 
                      type="text" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none uppercase font-mono" 
                      placeholder="123456"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Hourly Pay ($)</label>
                  <div className="flex gap-3">
                    <input 
                      type="number" step="0.01" min="0" value={newEmpPay} onChange={(e) => setNewEmpPay(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none" 
                      placeholder="15.00"
                    />
                    <button 
                      type="submit" disabled={isAdding}
                      className="bg-sky-600 hover:bg-sky-500 text-white p-2 rounded-lg shrink-0 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {editingMember && (
              <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-indigo-500/30 shadow-xl shrink-0">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Pencil className="w-5 h-5 text-indigo-400" /> Edit Team Member</h3>
                    <p className="text-xs text-slate-500 mt-1">Employee ID EMP{editingMember.employeeId} cannot be changed because it is the login identifier.</p>
                  </div>
                  <button type="button" onClick={() => setEditingMember(null)} className="p-2 text-slate-500 hover:text-white" aria-label="Close editor"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={saveMemberEdits} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                    <input required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Contact Email</label>
                    <input type="email" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'employee' | 'manager')} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none">
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  {editRole === 'employee' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Reports To</label>
                      <select value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none">
                        <option value="">-- No Manager --</option>
                        {teamMembers.filter((member) => member.role === 'manager').map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                      </select>
                    </div>
                  ) : <div />}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Hourly Pay ($)</label>
                    <div className="flex gap-2">
                      <input type="number" step="0.01" min="0" value={editPay} onChange={(e) => setEditPay(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                      <button type="submit" disabled={isSavingEdit} className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50" title="Save changes">{isSavingEdit ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}</button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Employees List */}
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 flex-1 flex flex-col shadow-xl min-h-0">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-3">
                  <Users className="w-5 h-5 text-sky-400" />
                  Registered Employees
                </h3>
                <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-medium border border-slate-700">
                  {teamMembers.length} Members
                </span>
              </div>
              
              <div className="flex-1 overflow-auto pr-2">
                {loading ? (
                  <div className="text-center py-10 text-slate-500">Loading team data...</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0F172A]/90 backdrop-blur pb-2 z-10">
                      <tr className="text-xs text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                        <th className="pb-3 font-medium pl-2">Name</th>
                        <th className="pb-3 font-medium">EMP ID</th>
                        <th className="pb-3 font-medium">Pay Rate</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium text-right pr-2">Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-sm">
                      {teamMembers.map((member) => (
                        <tr 
                          key={member.id} 
                          className="group hover:bg-slate-800/30 transition-colors cursor-pointer"
                          onClick={() => setChatRecipientId(member.employeeId || '')}
                        >
                          <td className="py-3 pl-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase border ${
                                member.role === 'admin' 
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/20' 
                                  : member.role === 'manager'
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/20'
                                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/20'
                              }`}>
                                {member.name?.substring(0, 2) || '?'}
                              </div>
                              <div>
                                <span className="font-medium text-slate-200 block">{member.name}</span>
                                {member.managerId && (
                                  <span className="text-xs text-slate-500">
                                    Reports to: {teamMembers.find(m => m.id === member.managerId)?.name || 'Unknown'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 font-mono text-sky-400 font-medium text-xs">
                            {member.employeeId || 'N/A'}
                          </td>
                          <td className="py-3 text-emerald-400 font-mono text-xs">
                            {member.payRate ? `$${member.payRate.toFixed(2)}/hr` : '-'}
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] uppercase px-2 py-0.5 rounded-full font-bold tracking-wider ${
                              member.role === 'admin' 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                : member.role === 'manager'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="py-3 text-right pr-2">
                            {member.role !== 'admin' && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openEditMember(member); }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-indigo-500/50 hover:text-indigo-300"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Chat Box */}
          <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl flex flex-col min-h-[500px]">
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 shrink-0">
              <MessageSquare className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="font-semibold text-slate-200">Direct Message</h3>
                <p className="text-xs text-slate-500">Target Employee ID to message</p>
              </div>
            </div>
            
            <div className="p-4 shrink-0 bg-slate-900/30 border-b border-slate-800">
              <input 
                type="text" 
                value={chatRecipientId}
                onChange={(e) => setChatRecipientId(e.target.value.toUpperCase().replace(/[^0-9EMP]/g, '').slice(0, 9))}
                placeholder="Enter EMP ID (e.g. 123456)"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-sky-400 font-mono focus:border-sky-500 outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!chatRecipientId ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Enter an ID or click an employee to start chat</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-10">No messages yet. Send one below!</div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === user.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        isMe ? 'bg-sky-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 shrink-0">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a secure message..."
                  className="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-sky-500 outline-none"
                />
                <button 
                  type="submit" 
                  disabled={!chatRecipientId || !chatMessage.trim()}
                  className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:hover:bg-sky-600 text-white p-2 rounded-xl flex items-center justify-center transition-colors shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
          
        </div>
      </main>
    </div>
  );
}
