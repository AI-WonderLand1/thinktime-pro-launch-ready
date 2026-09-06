import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, limit, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Timesheet, CompanySettings } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { format, differenceInSeconds } from 'date-fns';
import { Bell, Play, Square, Building2 } from 'lucide-react';

export default function EmployeeDashboard({ user }: { user: User }) {
  const [activeSession, setActiveSession] = useState<Timesheet | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<Timesheet[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessionDuration, setSessionDuration] = useState('00:00:00');
  
  // Company Settings
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    // Fetch Company Name
    const fetchSettings = async () => {
      const settingsDoc = await getDoc(doc(db, 'settings', 'company'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as CompanySettings;
        setCompanyName(data.companyName || '');
      }
    };
    fetchSettings();
    
    // Current time clock
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Fetch active session and recent history
    const q = query(
      collection(db, 'timesheets'),
      where('userId', '==', user.id),
      orderBy('clockIn', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sheets: Timesheet[] = [];
      snapshot.forEach((doc) => {
        sheets.push({ id: doc.id, ...doc.data() } as Timesheet);
      });
      
      setRecentTimesheets(sheets);
      
      const active = sheets.find(s => s.clockOut === null);
      setActiveSession(active || null);
    });

    return () => unsubscribe();
  }, [user.id]);

  useEffect(() => {
    // Active session duration counter
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

  const handleClockIn = async () => {
    await addDoc(collection(db, 'timesheets'), {
      userId: user.id,
      clockIn: Date.now(),
      clockOut: null,
      status: 'pending',
      totalHours: 0
    });
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

  const requestNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        alert('Browser notification permission enabled. Scheduled shift reminders require a configured push/scheduling backend.');
      }
    }
  };

  const recentLoggedHours = recentTimesheets.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">{companyName || 'Employee Dashboard'}</h1>
            <h2 className="text-3xl font-light">Welcome, <span className="font-bold">{user.name.split(' ')[0]}</span></h2>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={requestNotifications}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 flex items-center gap-2 transition-colors"
            >
              <Bell className="w-4 h-4" />
              Enable Browser Alerts
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          <section className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 flex-1 flex flex-col shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Recent Timesheets</h3>
                <span className="text-xs text-slate-400">Past 10 records</span>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Clock In</th>
                      <th className="pb-3 font-medium">Clock Out</th>
                      <th className="pb-3 font-medium">Total Hours</th>
                      <th className="pb-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {recentTimesheets.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-500">No timesheets found.</td></tr>
                    ) : recentTimesheets.map((sheet) => (
                      <tr key={sheet.id} className="group hover:bg-slate-800/20">
                        <td className="py-4 text-slate-300 font-medium">
                          {format(sheet.clockIn, 'MMM dd, yyyy')}
                        </td>
                        <td className="py-4 font-mono text-slate-400">{format(sheet.clockIn, 'HH:mm')}</td>
                        <td className="py-4 font-mono text-slate-400">
                          {sheet.clockOut ? format(sheet.clockOut, 'HH:mm') : '--:--'}
                        </td>
                        <td className="py-4 font-mono text-sky-400">
                          {sheet.totalHours ? sheet.totalHours.toFixed(2) : '-'}
                        </td>
                        <td className="py-4 text-right">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                            sheet.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                            sheet.status === 'pending' ? 'bg-orange-500/10 text-orange-400' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {sheet.status === 'pending' && !sheet.clockOut ? 'active' : sheet.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="lg:col-span-1 flex flex-col gap-6">
            <div className={`rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-500 ${
              activeSession 
                ? 'bg-gradient-to-br from-orange-500 to-red-600'
                : 'bg-gradient-to-br from-sky-600 to-indigo-700'
            }`}>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
              <p className="text-white/80 text-xs font-semibold uppercase mb-1 tracking-widest">
                {activeSession ? 'Current Session' : 'Ready to Work'}
              </p>
              <h4 className="text-5xl font-mono font-bold mb-8 tracking-tighter text-white">
                {activeSession ? sessionDuration : format(currentTime, 'HH:mm:ss')}
              </h4>
              
              <div className="flex gap-2">
                {activeSession ? (
                  <button 
                    onClick={handleClockOut}
                    className="flex-1 bg-white text-red-600 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Square className="w-5 h-5" fill="currentColor" /> CLOCK OUT
                  </button>
                ) : (
                  <button 
                    onClick={handleClockIn}
                    className="flex-1 bg-white text-indigo-700 font-bold py-4 rounded-xl shadow-lg hover:bg-sky-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" fill="currentColor" /> CLOCK IN
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h4 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
                <Bell className="w-4 h-4 text-sky-400" />
                Upcoming Shifts
              </h4>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center text-sm text-slate-500">
                No upcoming shifts have been published in ThinkTime yet.
              </div>
            </div>

            <div className="mt-auto bg-slate-900/50 rounded-xl p-5 border border-slate-800/50 shadow-inner">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-medium">Recent Logged Hours</span>
                <span className="text-sm font-mono text-sky-400 font-bold">{recentLoggedHours.toFixed(1)} hrs</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">Total from the up to 10 timesheets shown on this dashboard.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
