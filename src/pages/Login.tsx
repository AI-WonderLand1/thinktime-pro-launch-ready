import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Clock, Loader2, Copy, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (isLogin) {
        // Parse Employee ID (strip 'EMP' prefix if they typed it)
        const cleanId = employeeId.toUpperCase().replace('EMP', '').trim();
        const email = `emp${cleanId}@thinktime.local`;
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Generate a 6-digit random ID
        const generatedId = Math.floor(100000 + Math.random() * 900000).toString();
        const email = `emp${generatedId}@thinktime.local`;
        
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        
        await setDoc(doc(db, 'users', user.uid), {
          email,
          name,
          contactEmail: contactEmail.trim(),
          role: 'employee',
          employeeId: generatedId
        });
        // Sign out after registration so App reloads the completed profile on the first real login.
        await auth.signOut();
        
        setNewEmployeeId(`EMP${generatedId}`);
        setContactEmail('');
        setIsLogin(true);
        setEmployeeId(`EMP${generatedId}`);
        setPassword('');
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid Employee ID or Password.');
      } else {
        setError(err.message || 'An error occurred. Make sure Email/Password auth is enabled.');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (newEmployeeId) {
      navigator.clipboard.writeText(newEmployeeId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#020617] p-8">
      <div className="w-full max-w-md bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(14,165,233,0.4)]">
            <Clock className="w-10 h-10 text-white" />
          </div>
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-light text-slate-100">Think<span className="font-bold text-sky-400">Time</span> Pro</h2>
          <p className="text-slate-400 text-sm mt-2">{isLogin ? 'Sign in with your Employee ID' : 'Register a new employee account'}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {newEmployeeId && isLogin && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl relative">
            <p className="text-emerald-400 text-sm font-medium mb-2">Account created successfully! Your Employee ID is:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/30 p-2 rounded text-emerald-300 font-mono text-lg text-center tracking-wider">
                {newEmployeeId}
              </code>
              <button 
                onClick={copyToClipboard}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                title="Copy ID"
              >
                {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-emerald-500/80 mt-2 text-center">Save this ID. You will need it to sign in.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-sky-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                placeholder="John Doe"
              />
            </div>
          )}

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-sky-400 mb-1">Contact / Payroll Email</label>
              <input
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                placeholder="you@example.com"
                autoComplete="email"
              />
              <p className="text-[11px] text-slate-500 mt-1">Used for payroll/contact messages. Your Employee ID remains your sign-in name.</p>
            </div>
          )}
          
          {isLogin && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-sky-400 mb-1">Employee ID</label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono uppercase"
                placeholder="EMP123456"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-sky-400 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
              placeholder="••••••••"
            />
          </div>


          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Generate Employee ID & Register')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setNewEmployeeId(null);
            }}
            className="text-sm text-slate-400 hover:text-sky-400 transition-colors"
          >
            {isLogin ? "Don't have an ID? Employee sign up" : 'Already have an ID? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
