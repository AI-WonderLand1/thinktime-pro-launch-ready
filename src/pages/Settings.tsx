import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { User, CompanySettings } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { Building2, Save, Loader2, UserCircle, Users, Key, BrainCircuit, Eye, EyeOff, PlugZap, Trash2, ShieldCheck } from 'lucide-react';
import { AI_DEFAULT_MODELS, AI_PROVIDER_LABELS, AIProvider, AISettings, clearAISettings, loadAISettings, saveAISettings } from '../lib/aiSettings';
import { buildAIRequestHeaders } from '../lib/aiClient';

export default function Settings({ user }: { user: User }) {
  const [companyName, setCompanyName] = useState('');
  const [llcNumber, setLlcNumber] = useState('');
  const [emailTemplate, setEmailTemplate] = useState<'standard' | 'detailed' | 'friendly'>('standard');
  const [isSaving, setIsSaving] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [isResetting, setIsResetting] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings(user.id));
  const [showAIKey, setShowAIKey] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileContactEmail, setProfileContactEmail] = useState(user.contactEmail || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user.role === 'admin') {
      const fetchSettings = async () => {
        const settingsDoc = await getDoc(doc(db, 'settings', 'company'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data() as CompanySettings;
          setCompanyName(data.companyName || '');
          setLlcNumber(data.llcNumber || '');
          setEmailTemplate(data.emailTemplate || 'standard');
        }
      };
      
      const fetchEmployees = async () => {
        const q = query(collection(db, 'users'), where('role', '==', 'employee'));
        const snap = await getDocs(q);
        const emps: User[] = [];
        snap.forEach(d => emps.push({ id: d.id, ...d.data() } as User));
        setEmployees(emps);
      };
      
      fetchSettings();
      fetchEmployees();
    }
  }, [user.role]);

  const handleAIProviderChange = (provider: AIProvider) => {
    setAiSettings((current) => ({
      ...current,
      provider,
      model: AI_DEFAULT_MODELS[provider],
      baseUrl: provider === 'custom' ? current.baseUrl : '',
    }));
    setAiStatus(null);
  };

  const saveAIProviderSettings = () => {
    if (!aiSettings.apiKey.trim()) {
      setAiStatus({ type: 'error', message: 'Enter an API key before saving.' });
      return;
    }
    if (!aiSettings.model.trim()) {
      setAiStatus({ type: 'error', message: 'Enter the model name you want ThinkTime to use.' });
      return;
    }
    if (aiSettings.provider === 'custom' && !aiSettings.baseUrl.trim()) {
      setAiStatus({ type: 'error', message: 'Custom providers require an HTTPS base URL.' });
      return;
    }

    try {
      saveAISettings(user.id, aiSettings);
      setAiStatus({
        type: 'success',
        message: aiSettings.rememberKey
          ? 'AI settings saved on this browser.'
          : 'AI settings saved for this session. The API key will be cleared when the browser session ends.',
      });
    } catch {
      setAiStatus({ type: 'error', message: 'This browser blocked local storage. The AI settings could not be saved.' });
    }
  };

  const testAIProvider = async () => {
    setIsTestingAI(true);
    setAiStatus(null);
    try {
      const headers = await buildAIRequestHeaders(aiSettings);
      const response = await fetch('/api/ai/test', { method: 'POST', headers, body: '{}' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'AI connection test failed.');
      setAiStatus({ type: 'success', message: `Connected to ${AI_PROVIDER_LABELS[aiSettings.provider]} using ${aiSettings.model}.` });
    } catch (error) {
      setAiStatus({ type: 'error', message: error instanceof Error ? error.message : 'AI connection test failed.' });
    } finally {
      setIsTestingAI(false);
    }
  };

  const removeAIProviderSettings = () => {
    clearAISettings(user.id);
    setAiSettings({
      provider: 'gemini',
      apiKey: '',
      model: AI_DEFAULT_MODELS.gemini,
      baseUrl: '',
      rememberKey: false,
    });
    setAiStatus({ type: 'success', message: 'Saved AI credentials were removed from this browser.' });
  };


  const saveProfileContactEmail = async () => {
    const value = profileContactEmail.trim();
    if (!value || !value.includes('@')) {
      alert('Enter a valid contact/payroll email address.');
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.id), { contactEmail: value });
      alert('Contact email updated.');
    } catch (error) {
      console.error(error);
      alert('Failed to update contact email.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const changeOwnPassword = async () => {
    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('The new passwords do not match.');
      return;
    }
    if (!auth.currentUser) {
      alert('Your session expired. Sign in again.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      alert('Password changed successfully.');
    } catch (error: any) {
      console.error(error);
      const message = error?.code === 'auth/requires-recent-login'
        ? 'For security, sign out and sign back in before changing your password.'
        : (error?.message || 'Failed to change password.');
      alert(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handlePasswordReset = async (emp: User) => {
    setIsResetting(emp.id);
    try {
      if (emp.email?.endsWith('@thinktime.local')) {
        alert('This is an Employee-ID-only account, so Firebase cannot deliver a password-reset email to its internal @thinktime.local login alias. Use the Firebase Authentication console to recover this account.');
      } else if (emp.email) {
        await sendPasswordResetEmail(auth, emp.email);
        alert(`Password reset email sent for ${emp.name}.`);
      } else {
        alert("This employee doesn't have a valid email address attached.");
      }
    } catch (error: any) {
      console.error(error);
      alert(`Failed to send password reset email: ${error.message}`);
    } finally {
      setIsResetting(null);
    }
  };

  const saveCompanySettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'company'), {
        companyName,
        llcNumber,
        emailTemplate
      });
      alert('Company settings saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">Configuration</h1>
          <h2 className="text-3xl font-light">System <span className="font-bold">Settings</span></h2>
        </header>

        <div className="max-w-3xl space-y-8">
          {/* Personal Settings (For all) */}
          <section className="bg-[#0F172A]/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-3">
              <UserCircle className="w-5 h-5 text-indigo-400" />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                <input type="text" value={user.name} disabled className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 cursor-not-allowed opacity-70" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Employee ID</label>
                <input type="text" value={user.employeeId || 'N/A'} disabled className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono cursor-not-allowed opacity-70" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Login Alias</label>
                <input type="text" value={user.email} disabled className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 cursor-not-allowed opacity-70" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Contact / Payroll Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={profileContactEmail}
                    onChange={(e) => setProfileContactEmail(e.target.value)}
                    className="min-w-0 flex-1 bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <button
                    type="button"
                    onClick={saveProfileContactEmail}
                    disabled={isSavingProfile}
                    className="shrink-0 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
                    title="Save contact email"
                  >
                    {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                <input type="text" value={user.role.toUpperCase()} disabled className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 cursor-not-allowed opacity-70" />
              </div>
            </div>
          </section>

          <section className="bg-[#0F172A]/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-3">
              <Key className="w-5 h-5 text-emerald-400" />
              Password & Security
            </h3>
            <p className="text-sm text-slate-400 mb-6">Change the password for your current ThinkTime account.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">New Password</label>
                <input
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                />
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={changeOwnPassword}
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                Change Password
              </button>
            </div>
          </section>

          {/* Company Settings (Admin Only) */}
          {user.role === 'admin' && (
            <section className="bg-[#0F172A]/80 backdrop-blur-md border border-sky-900/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
              
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-sky-400" />
                Company Settings
              </h3>
              
              <div className="space-y-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Company Name</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">LLC / Sole Prop ID</label>
                    <input 
                      type="text" 
                      value={llcNumber}
                      onChange={(e) => setLlcNumber(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                      placeholder="12345-6789"
                    />
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-800">
                  <h4 className="text-sm font-medium text-slate-300 mb-4">Payroll Email Template</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Template: Standard */}
                    <div 
                      onClick={() => setEmailTemplate('standard')}
                      className={`cursor-pointer border-2 rounded-xl p-1 transition-all ${emailTemplate === 'standard' ? 'border-sky-500 bg-sky-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'}`}
                    >
                      <div className="aspect-[4/3] bg-slate-950 rounded-lg p-3 flex flex-col gap-2">
                        <div className="h-2 w-1/3 bg-slate-800 rounded"></div>
                        <div className="h-1.5 w-1/4 bg-slate-800 rounded"></div>
                        <div className="h-px w-full bg-slate-800 my-1"></div>
                        <div className="h-1.5 w-full bg-slate-800 rounded"></div>
                        <div className="h-1.5 w-5/6 bg-slate-800 rounded"></div>
                        <div className="h-1.5 w-4/6 bg-slate-800 rounded"></div>
                      </div>
                      <div className="text-center mt-2 pb-1">
                        <p className="text-xs font-semibold text-slate-200">Standard</p>
                        <p className="text-[10px] text-slate-500">Clean & Direct</p>
                      </div>
                    </div>

                    {/* Template: Detailed */}
                    <div 
                      onClick={() => setEmailTemplate('detailed')}
                      className={`cursor-pointer border-2 rounded-xl p-1 transition-all ${emailTemplate === 'detailed' ? 'border-sky-500 bg-sky-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'}`}
                    >
                      <div className="aspect-[4/3] bg-slate-950 rounded-lg p-3 flex flex-col gap-1.5">
                        <div className="h-2 w-1/2 bg-sky-900 rounded mb-1"></div>
                        <div className="flex gap-2">
                          <div className="h-8 w-8 bg-slate-800 rounded-sm"></div>
                          <div className="flex-1 flex flex-col gap-1">
                             <div className="h-1.5 w-full bg-slate-800 rounded"></div>
                             <div className="h-1.5 w-full bg-slate-800 rounded"></div>
                             <div className="h-1.5 w-3/4 bg-slate-800 rounded"></div>
                          </div>
                        </div>
                        <div className="h-px w-full bg-slate-800 my-1"></div>
                        <div className="h-3 w-1/3 bg-emerald-900 rounded"></div>
                      </div>
                      <div className="text-center mt-2 pb-1">
                        <p className="text-xs font-semibold text-slate-200">Detailed</p>
                        <p className="text-[10px] text-slate-500">Comprehensive Breakdown</p>
                      </div>
                    </div>

                    {/* Template: Friendly */}
                    <div 
                      onClick={() => setEmailTemplate('friendly')}
                      className={`cursor-pointer border-2 rounded-xl p-1 transition-all ${emailTemplate === 'friendly' ? 'border-sky-500 bg-sky-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'}`}
                    >
                      <div className="aspect-[4/3] bg-slate-950 rounded-lg p-3 flex flex-col gap-2 items-center justify-center text-center">
                        <div className="h-6 w-6 rounded-full bg-indigo-900 mb-1"></div>
                        <div className="h-2 w-1/2 bg-slate-700 rounded"></div>
                        <div className="h-1.5 w-3/4 bg-slate-800 rounded"></div>
                        <div className="h-1.5 w-2/3 bg-slate-800 rounded"></div>
                      </div>
                      <div className="text-center mt-2 pb-1">
                        <p className="text-xs font-semibold text-slate-200">Friendly</p>
                        <p className="text-[10px] text-slate-500">Warm & Conversational</p>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-slate-800">
                  <button 
                    onClick={saveCompanySettings}
                    disabled={isSaving}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-medium py-2.5 px-6 rounded-lg shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Company Details
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* AI BYOK Settings (Admin Only) */}
          {user.role === 'admin' && (
            <section className="bg-[#0F172A]/80 backdrop-blur-md border border-indigo-500/25 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-3">
                      <BrainCircuit className="w-5 h-5 text-indigo-400" />
                      AI / Bring Your Own Key
                    </h3>
                    <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                      Connect ThinkTime&apos;s report and payroll-writing tools to your own AI provider. Your key is never written to Firestore.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 rounded-full px-3 py-1.5 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    BYOK
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">AI Provider</label>
                    <select
                      value={aiSettings.provider}
                      onChange={(e) => handleAIProviderChange(e.target.value as AIProvider)}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      {Object.entries(AI_PROVIDER_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Model</label>
                    <input
                      type="text"
                      value={aiSettings.model}
                      onChange={(e) => setAiSettings((current) => ({ ...current, model: e.target.value }))}
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="Provider model ID"
                      autoComplete="off"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
                    <div className="relative">
                      <input
                        type={showAIKey ? 'text' : 'password'}
                        value={aiSettings.apiKey}
                        onChange={(e) => setAiSettings((current) => ({ ...current, apiKey: e.target.value }))}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg pl-4 pr-12 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="Paste your provider API key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAIKey((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
                        aria-label={showAIKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showAIKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {aiSettings.provider === 'custom' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">OpenAI-compatible Base URL</label>
                      <input
                        type="url"
                        value={aiSettings.baseUrl}
                        onChange={(e) => setAiSettings((current) => ({ ...current, baseUrl: e.target.value }))}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="https://provider.example.com/v1"
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>

                <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aiSettings.rememberKey}
                    onChange={(e) => setAiSettings((current) => ({ ...current, rememberKey: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm text-slate-200">Remember API key on this device</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Off by default. When off, the key is kept only for this browser session. When on, it is stored in this browser&apos;s local storage.
                    </span>
                  </span>
                </label>

                {aiStatus && (
                  <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${aiStatus.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                    {aiStatus.message}
                  </div>
                )}

                <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={removeAIProviderSettings}
                    className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Key
                  </button>
                  <button
                    type="button"
                    onClick={testAIProvider}
                    disabled={isTestingAI}
                    className="px-4 py-2.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isTestingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                    Test Connection
                  </button>
                  <button
                    type="button"
                    onClick={saveAIProviderSettings}
                    className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                  >
                    <Save className="w-4 h-4" />
                    Save AI Settings
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Account Recovery Section (Admin Only) */}
          {user.role === 'admin' && (
            <section className="bg-[#0F172A]/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-3">
                <Users className="w-5 h-5 text-indigo-400" />
                Employee Account Recovery
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Find employee IDs here. ID-only accounts use an internal @thinktime.local authentication alias, so password recovery for those accounts must currently be performed by an administrator in Firebase Authentication.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                      <th className="pb-3 font-medium pl-2">Name</th>
                      <th className="pb-3 font-medium">Employee ID</th>
                      <th className="pb-3 font-medium text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {employees.length === 0 ? (
                      <tr><td colSpan={3} className="py-6 text-center text-slate-500">No employees found.</td></tr>
                    ) : employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 pl-2 font-medium text-slate-200">
                          {emp.name}
                        </td>
                        <td className="py-3">
                          <code className="bg-black/30 px-2 py-1 rounded text-emerald-400 font-mono text-xs tracking-wider border border-emerald-500/20">
                            {emp.employeeId || 'N/A'}
                          </code>
                        </td>
                        <td className="py-3 text-right pr-2">
                          <button 
                            onClick={() => handlePasswordReset(emp)}
                            disabled={isResetting === emp.id}
                            className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isResetting === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
