import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, OTRequest, PTORequest } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { Clock, CalendarDays, CheckCircle, XCircle, AlertCircle, Users } from 'lucide-react';
import { format } from 'date-fns';

export default function ManagerDashboard({ user }: { user: User }) {
  const [otRequests, setOtRequests] = useState<OTRequest[]>([]);
  const [ptoRequests, setPtoRequests] = useState<PTORequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch team members
    const fetchTeam = async () => {
      const q = query(collection(db, 'users'), where('managerId', '==', user.id));
      const snap = await getDocs(q);
      const members: User[] = [];
      snap.forEach(d => members.push({ id: d.id, ...d.data() } as User));
      setTeamMembers(members);
    };
    fetchTeam();
  }, [user.id]);

  useEffect(() => {
    // Listen for OT requests assigned to this manager
    const qOt = query(
      collection(db, 'ot_requests'),
      where('managerId', '==', user.id),
      orderBy('timestamp', 'desc')
    );

    const unsubOt = onSnapshot(qOt, (snapshot) => {
      const requests: OTRequest[] = [];
      snapshot.forEach(doc => {
        requests.push({ id: doc.id, ...doc.data() } as OTRequest);
      });
      setOtRequests(requests);
      setLoading(false);
    });

    const qPto = query(
      collection(db, 'pto_requests'),
      where('managerId', '==', user.id),
      orderBy('timestamp', 'desc')
    );

    const unsubPto = onSnapshot(qPto, (snapshot) => {
      const requests: PTORequest[] = [];
      snapshot.forEach(doc => {
        requests.push({ id: doc.id, ...doc.data() } as PTORequest);
      });
      setPtoRequests(requests);
    });

    return () => {
      unsubOt();
      unsubPto();
    };
  }, [user.id]);

  const handleApprove = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'ot_requests', requestId), {
        status: 'approved'
      });
    } catch (error) {
      console.error(error);
      alert('Failed to approve request.');
    }
  };

  const handleDeny = async (requestId: string) => {
    const reason = window.prompt("Please provide a reason for denying this overtime request:");
    if (reason === null) return; // cancelled
    
    try {
      await updateDoc(doc(db, 'ot_requests', requestId), {
        status: 'denied',
        denyReason: reason || 'No reason provided'
      });
    } catch (error) {
      console.error(error);
      alert('Failed to deny request.');
    }
  };

  const handleApprovePto = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'pto_requests', requestId), {
        status: 'approved'
      });
    } catch (error) {
      console.error(error);
      alert('Failed to approve request.');
    }
  };

  const handleDenyPto = async (requestId: string) => {
    const reason = window.prompt("Please provide a reason for denying this PTO request:");
    if (reason === null) return; 
    
    try {
      await updateDoc(doc(db, 'pto_requests', requestId), {
        status: 'denied',
        denyReason: reason || 'No reason provided'
      });
    } catch (error) {
      console.error(error);
      alert('Failed to deny request.');
    }
  };

  const pendingOtRequests = otRequests.filter(r => r.status === 'pending');
  const pastOtRequests = otRequests.filter(r => r.status !== 'pending');
  const pendingPtoRequests = ptoRequests.filter(r => r.status === 'pending');
  const pastPtoRequests = ptoRequests.filter(r => r.status !== 'pending');

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="mb-4">
          <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">Manager Portal</h1>
          <h2 className="text-3xl font-light">Team <span className="font-bold">Dashboard</span></h2>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 flex flex-col gap-6 overflow-hidden">
            
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col max-h-[50%]">
              <h3 className="text-lg font-semibold flex items-center gap-3 mb-6 shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                Action Required: Pending Requests
              </h3>
              
              <div className="flex-1 overflow-auto space-y-6 pr-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-widest">Overtime</h4>
                  {pendingOtRequests.length === 0 ? (
                    <div className="text-sm text-slate-600 italic">No pending overtime requests.</div>
                  ) : (
                    <div className="space-y-4">
                      {pendingOtRequests.map(req => (
                        <div key={req.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-200">{req.employeeName}</p>
                            <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/> {req.requestedDates}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {req.requestedShift}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 font-mono">Submitted: {format(req.timestamp, 'MMM d, h:mm a')}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button 
                              onClick={() => handleDeny(req.id)}
                              className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                            >
                              Deny
                            </button>
                            <button 
                              onClick={() => handleApprove(req.id)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-widest">PTO & Leave</h4>
                  {pendingPtoRequests.length === 0 ? (
                    <div className="text-sm text-slate-600 italic">No pending PTO requests.</div>
                  ) : (
                    <div className="space-y-4">
                      {pendingPtoRequests.map(req => (
                        <div key={req.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-200">{req.employeeName} <span className="text-xs font-normal text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full ml-2 border border-purple-500/20">{req.type}</span></p>
                            <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/> {req.startDate} to {req.endDate}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 font-mono">Submitted: {format(req.timestamp, 'MMM d, h:mm a')}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button 
                              onClick={() => handleDenyPto(req.id)}
                              className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                            >
                              Deny
                            </button>
                            <button 
                              onClick={() => handleApprovePto(req.id)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl flex-1 flex flex-col min-h-0">
              <h3 className="text-lg font-semibold flex items-center gap-3 mb-6">
                <Clock className="w-5 h-5 text-sky-400" />
                Reviewed Requests
              </h3>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#0F172A]/90 backdrop-blur pb-2 z-10">
                    <tr className="text-xs text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Employee</th>
                      <th className="pb-3 font-medium">Date & Details</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {pastOtRequests.length === 0 && pastPtoRequests.length === 0 ? (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-500">No reviewed requests yet.</td></tr>
                    ) : (
                      <>
                        {pastOtRequests.map(req => (
                          <tr key={req.id}>
                            <td className="py-4">
                              <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">Overtime</span>
                            </td>
                            <td className="py-4">
                              <span className="font-medium text-slate-200">{req.employeeName}</span>
                              <span className="text-xs text-slate-500 font-mono block">ID: {req.employeeId}</span>
                            </td>
                            <td className="py-4">
                              <span className="block text-slate-300">{req.requestedDates}</span>
                              <span className="text-xs text-slate-500">{req.requestedShift}</span>
                            </td>
                            <td className="py-4">
                              {req.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle className="w-3.5 h-3.5" /> Approved
                                </span>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                                    <XCircle className="w-3.5 h-3.5" /> Denied
                                  </span>
                                  <span className="text-xs text-slate-500 italic">"{req.denyReason}"</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {pastPtoRequests.map(req => (
                          <tr key={req.id}>
                            <td className="py-4">
                              <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">PTO: {req.type}</span>
                            </td>
                            <td className="py-4">
                              <span className="font-medium text-slate-200">{req.employeeName}</span>
                              <span className="text-xs text-slate-500 font-mono block">ID: {req.employeeId}</span>
                            </td>
                            <td className="py-4">
                              <span className="block text-slate-300">{req.startDate}</span>
                              <span className="text-xs text-slate-500">to {req.endDate}</span>
                            </td>
                            <td className="py-4">
                              {req.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle className="w-3.5 h-3.5" /> Approved
                                </span>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                                    <XCircle className="w-3.5 h-3.5" /> Denied
                                  </span>
                                  <span className="text-xs text-slate-500 italic">"{req.denyReason}"</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="flex flex-col gap-6">
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl shrink-0">
              <h3 className="text-lg font-semibold flex items-center gap-3 mb-6">
                <Users className="w-5 h-5 text-indigo-400" />
                My Direct Reports
              </h3>
              <div className="space-y-4">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-slate-500">You have no direct reports assigned.</p>
                ) : teamMembers.map(member => (
                  <div key={member.id} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold border border-indigo-500/20">
                      {member.name.substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-200">{member.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{member.employeeId}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
