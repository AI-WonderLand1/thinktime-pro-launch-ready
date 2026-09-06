import { FormEvent, useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, authReady } from '../lib/firebase';
import { Clock, Loader2, ShieldCheck } from 'lucide-react';
import InstallAppButton from '../components/InstallAppButton';
import { employeeLoginAlias, firebaseAuthMessage, isValidEmployeeId, normalizeEmployeeId } from '../lib/authHelpers';

export default function Login() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentialsEditable, setCredentialsEditable] = useState(false);

  // Clear any values restored by browser form/session restoration. Password managers
  // can still offer saved credentials, but ThinkTime never pre-populates them itself.
  useEffect(() => {
    setEmployeeId('');
    setPassword('');
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    const cleanId = normalizeEmployeeId(employeeId);
    if (!isValidEmployeeId(cleanId)) {
      setError('Enter the 6-digit Employee ID issued by your administrator.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await authReady;
      await signInWithEmailAndPassword(auth, employeeLoginAlias(cleanId), password);
      setPassword('');
    } catch (err) {
      setPassword('');
      setError(firebaseAuthMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#020617] p-8">
      <div className="w-full max-w-md bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(14,165,233,0.4)]">
            <Clock className="w-10 h-10 text-white" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-light text-slate-100">Think<span className="font-bold text-sky-400">Time</span> Pro</h2>
          <p className="text-slate-400 text-sm mt-2">Sign in with the Employee ID issued by your administrator.</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Decoy fields reduce aggressive browser autofill without storing user data. */}
        <div aria-hidden="true" className="hidden">
          <input type="text" name="username" autoComplete="username" tabIndex={-1} />
          <input type="password" name="password" autoComplete="current-password" tabIndex={-1} />
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" data-form-type="other" className="space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-sky-400 mb-1">Employee ID</label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={9}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono uppercase"
              placeholder="EMP123456"
              name="tt-employee-code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              readOnly={!credentialsEditable}
              onFocus={() => setCredentialsEditable(true)}
              onPointerDown={() => setCredentialsEditable(true)}
            />
          </div>

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
              name="tt-session-secret"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              readOnly={!credentialsEditable}
              onFocus={() => setCredentialsEditable(true)}
              onPointerDown={() => setCredentialsEditable(true)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <InstallAppButton />

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-3 flex gap-3 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <p>Accounts are administrator-issued. ThinkTime does not display or save your password on this screen.</p>
        </div>
      </div>
    </div>
  );
}
