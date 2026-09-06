import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Timesheet } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { format, differenceInSeconds } from 'date-fns';
import { Play, Square, Radio, CalendarClock, Send, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function EmployeePortal({ user }: { user: User }) {
  const [activeSession, setActiveSession] = useState<Timesheet | null>(null);
  const [sessionDuration, setSessionDuration] = useState('00:00:00');
  const [messages, setMessages] = useState<any[]>([]);
  
  // OT Request State
  const [otDates, setOtDates] = useState('');
  const [otShift, setOtShift] = useState('');
  const [isSubmittingOt, setIsSubmittingOt] = useState(false);
  const [myOtRequests, setMyOtRequests] = useState<any[]>([]);

  // PTO Request State
  const [ptoType, setPtoType] = useState('Vacation');
  const [ptoStart, setPtoStart] = useState('');
  const [ptoEnd, setPtoEnd] = useState('');
  const [isSubmittingPto, setIsSubmittingPto] = useState(false);
  const [myPtoRequests, setMyPtoRequests] = useState<any[]>([]);
  
  // Scheduling is not backed by Firestore in this release, so do not display fake shifts.
  const schedules: { id: string; date: string; shift: string }[] = [];

  useEffect(() => {
    // Listen for direct messages to this employee
    if (!user.employeeId) return;
    
    const qMessages = query(
      collection(db, 'messages'),
      where('recipientEmpId', '==', user.employeeId),
      orderBy('timestamp', 'asc')
    );
    
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs: any[] = [];
      snapshot.forEach(doc => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      // We reverse it to show newest at top if we want, or map normally
      setMessages(msgs.reverse());
    });

    const q = query(
      collection(db, 'timesheets'),
      where('userId', '==', user.id),
      orderBy('clockIn', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sheets: Timesheet[] = [];
      snapshot.forEach((doc) => {
        sheets.push({ id: doc.id, ...doc.data() } as Timesheet);
      });
      const active = sheets.find(s => s.clockOut === null);
      setActiveSession(active || null);
    });

    const qOt = query(
      collection(db, 'ot_requests'),
      where('userId', '==', user.id),
      orderBy('timestamp', 'desc')
    );

    const unsubOt = onSnapshot(qOt, (snapshot) => {
      const reqs: any[] = [];
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() }));
      setMyOtRequests(reqs);
    });

    const qPto = query(
      collection(db, 'pto_requests'),
      where('userId', '==', user.id),
      orderBy('timestamp', 'desc')
    );

    const unsubPto = onSnapshot(qPto, (snapshot) => {
      const reqs: any[] = [];
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() }));
      setMyPtoRequests(reqs);
    });

    return () => {
      unsubscribe();
      unsubMessages();
      unsubOt();
      unsubPto();
    };
  }, [user.id, user.employeeId]);

  useEffect(() => {
    if (!activeSession) {
      setSessionDuration('00:00:00');
      return;
    }
    const interval = setInterval(() => {
      const diffInSeconds = differenceInSeconds(new Date(), new Date(activeSession.clockIn));
      const hours = Math.floor(diffInSeconds / 3600);
      const minutes = Math.floor((diffInSeconds % 3600) / 60);
      const seconds = diffInSeconds % 60;
      setSessionDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const [isClockingIn, setIsClockingIn] = useState(false);

  const handleClockIn = async () => {
    setIsClockingIn(true);
    try {
      let location = null;
      if ('geolocation' in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (e) {
          console.warn("Could not get geolocation", e);
          const proceed = window.confirm("Could not determine your location. Clock in anyway?");
          if (!proceed) {
            setIsClockingIn(false);
            return;
          }
        }
      }

      await addDoc(collection(db, 'timesheets'), {
        userId: user.id,
        clockIn: Date.now(),
        clockOut: null,
        status: 'pending',
        totalHours: 0,
        ...(location ? { location } : {})
      });
    } catch (e) {
      console.error(e);
      alert("Failed to clock in");
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeSession) return;
    const clockOutTime = Date.now();
    const totalHours = (clockOutTime - activeSession.clockIn) / (1000 * 60 * 60);
    await updateDoc(doc(db, 'timesheets', activeSession.id), {
      clockOut: clockOutTime,
      totalHours: totalHours
    });
  };

  const handleOtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.managerId) {
      alert('You must be assigned to a Manager to request overtime.');
      return;
    }
    
    setIsSubmittingOt(true);
    try {
      await addDoc(collection(db, 'ot_requests'), {
        userId: user.id,
        employeeName: user.name,
        employeeId: user.employeeId,
        managerId: user.managerId,
        requestedDates: otDates,
        requestedShift: otShift,
        status: 'pending',
        timestamp: Date.now()
      });
      setOtDates('');
      setOtShift('');
      alert('Overtime request submitted to your manager.');
    } catch (err) {
      console.error(err);
      alert('Failed to submit overtime request.');
    } finally {
      setIsSubmittingOt(false);
    }
  };

  const handlePtoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.managerId) {
      alert('You must be assigned to a Manager to request PTO.');
      return;
    }
    if (!ptoStart || !ptoEnd) {
      alert('Please provide start and end dates.');
      return;
    }
    
    setIsSubmittingPto(true);
    try {
      await addDoc(collection(db, 'pto_requests'), {
        userId: user.id,
        employeeName: user.name,
        employeeId: user.employeeId,
        managerId: user.managerId,
        type: ptoType,
        startDate: ptoStart,
        endDate: ptoEnd,
        status: 'pending',
        timestamp: Date.now()
      });
      setPtoStart('');
      setPtoEnd('');
      alert('PTO request submitted to your manager.');
    } catch (err) {
      console.error(err);
      alert('Failed to submit PTO request.');
    } finally {
      setIsSubmittingPto(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">My Portal</h1>
            <h2 className="text-3xl font-light">Action <span className="font-bold">Center</span></h2>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* Action Center - Clock In / Out */}
          <section className="flex flex-col gap-6">
            <div className={`rounded-2xl p-8 shadow-xl relative overflow-hidden transition-all duration-500 ${
              activeSession 
                ? 'bg-gradient-to-br from-orange-500 to-red-600'
                : 'bg-gradient-to-br from-emerald-500 to-teal-700'
            }`}>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
              <p className="text-white/90 text-sm font-semibold uppercase mb-2 tracking-widest">
                {activeSession ? 'Shift in Progress' : 'Ready to Start?'}
              </p>
              <h4 className="text-6xl font-mono font-bold mb-10 tracking-tighter text-white">
                {activeSession ? sessionDuration : '00:00:00'}
              </h4>
              
              <div className="flex gap-4">
                <button 
                  onClick={handleClockIn}
                  disabled={!!activeSession || isClockingIn}
                  className={`flex-1 font-bold py-5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-3 text-lg ${
                    !activeSession ? 'bg-white text-teal-700 hover:bg-teal-50' : 'bg-white/20 text-white/50 cursor-not-allowed'
                  }`}
                >
                  {isClockingIn ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" fill="currentColor" />} 
                  {isClockingIn ? 'VERIFYING LOC...' : 'CLOCK IN'}
                </button>
                <button 
                  onClick={handleClockOut}
                  disabled={!activeSession}
                  className={`flex-1 font-bold py-5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-3 text-lg ${
                    activeSession ? 'bg-white text-red-600 hover:bg-slate-50' : 'bg-white/20 text-white/50 cursor-not-allowed'
                  }`}
                >
                  <Square className="w-6 h-6" fill="currentColor" /> CLOCK OUT
                </button>
              </div>
            </div>

            {/* Messages & Tasks */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-lg flex-1 overflow-hidden flex flex-col">
              <h4 className="text-sm font-semibold mb-6 flex items-center gap-2 text-slate-300 uppercase tracking-widest shrink-0">
                <Radio className="w-4 h-4 text-sky-400" />
                Direct Messages & Tasks
              </h4>
              <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                {messages.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-500">No new messages from Admin.</div>
                ) : (
                  messages.map((m: any) => (
                    <div key={m.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs text-sky-400 font-bold">{m.senderName || 'Admin'}</p>
                        <p className="text-[10px] text-slate-500">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <p className="text-sm text-slate-200">{m.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Schedule & Timing */}
          <section className="flex flex-col gap-6">
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-lg flex-1">
              <h4 className="text-sm font-semibold mb-6 flex items-center gap-2 text-slate-300 uppercase tracking-widest">
                <CalendarClock className="w-4 h-4 text-emerald-400" />
                My Schedule & Times
              </h4>
              <div className="space-y-3">
                {schedules.length === 0 ? (
                  <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500 text-center">
                    No scheduled shifts have been published in ThinkTime yet.
                  </div>
                ) : schedules.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="font-medium text-slate-200">{s.date}</span>
                    </div>
                    <span className="text-sm font-mono text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
                      {s.shift}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* PTO & Leave Requests */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-lg flex-1 overflow-hidden flex flex-col">
              <h4 className="text-sm font-semibold mb-6 flex items-center gap-2 text-slate-300 uppercase tracking-widest shrink-0">
                <CalendarClock className="w-4 h-4 text-purple-400" />
                PTO & Leave Requests
              </h4>
              
              <form onSubmit={handlePtoSubmit} className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Leave Type</label>
                  <select 
                    value={ptoType} onChange={e => setPtoType(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                  >
                    <option>Vacation</option>
                    <option>Sick Leave</option>
                    <option>Personal</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                    <input 
                      type="date" required value={ptoStart} onChange={e => setPtoStart(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
                    <input 
                      type="date" required value={ptoEnd} onChange={e => setPtoEnd(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
                <button 
                  type="submit" disabled={isSubmittingPto}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> Request Leave
                </button>
              </form>

              <div className="space-y-3 overflow-y-auto flex-1">
                {myPtoRequests.length === 0 ? (
                  <div className="text-center py-4 text-sm text-slate-500">No leave requests submitted.</div>
                ) : myPtoRequests.map(req => (
                  <div key={req.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-200">{req.type}</p>
                      <p className="text-xs text-slate-400">{req.startDate} to {req.endDate}</p>
                    </div>
                    <div>
                      {req.status === 'pending' && <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">Pending</span>}
                      {req.status === 'approved' && <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Approved</span>}
                      {req.status === 'denied' && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3"/> Denied</span>
                          <span className="text-[10px] text-slate-500">"{req.denyReason}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* OT Requests */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-lg flex-1 overflow-hidden flex flex-col">
              <h4 className="text-sm font-semibold mb-6 flex items-center gap-2 text-slate-300 uppercase tracking-widest shrink-0">
                <Clock className="w-4 h-4 text-indigo-400" />
                Overtime Requests
              </h4>
              
              <form onSubmit={handleOtSubmit} className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Requested Dates</label>
                    <input 
                      type="text" required value={otDates} onChange={e => setOtDates(e.target.value)}
                      placeholder="e.g., Oct 12 - Oct 14"
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Requested Shift</label>
                    <input 
                      type="text" required value={otShift} onChange={e => setOtShift(e.target.value)}
                      placeholder="e.g., 5PM - 10PM"
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
                <button 
                  type="submit" disabled={isSubmittingOt}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> Request Overtime
                </button>
              </form>

              <div className="space-y-3 overflow-y-auto flex-1">
                {myOtRequests.length === 0 ? (
                  <div className="text-center py-4 text-sm text-slate-500">No overtime requests submitted.</div>
                ) : myOtRequests.map(req => (
                  <div key={req.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-200">{req.requestedDates}</p>
                      <p className="text-xs text-slate-400">{req.requestedShift}</p>
                    </div>
                    <div>
                      {req.status === 'pending' && <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">Pending</span>}
                      {req.status === 'approved' && <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Approved</span>}
                      {req.status === 'denied' && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3"/> Denied</span>
                          <span className="text-[10px] text-slate-500">"{req.denyReason}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
