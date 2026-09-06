import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, Timesheet, CompanySettings } from '../lib/types';
import Sidebar from '../components/Sidebar';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Download, FileText, CheckCircle, Mail, FileUp, Loader2, Grid, Calendar, Send } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup } from 'firebase/auth';
import { getSavedAIRequestHeaders } from '../lib/aiClient';

async function requireGoogleResponse(response: Response, action: string) {
  if (response.ok) return response;

  const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
  throw new Error(`${action} failed (${response.status})${detail ? `: ${detail}` : ''}`);
}

export default function AdminDashboard({ user }: { user: User }) {
  const [timesheets, setTimesheets] = useState<(Timesheet & { userName?: string })[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Company Settings State
  const [companyName, setCompanyName] = useState('');
  const [llcNumber, setLlcNumber] = useState('');
  const [emailTemplate, setEmailTemplate] = useState<'standard' | 'detailed' | 'friendly'>('standard');
  
  // Date Filter State
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    // Fetch Company Settings
    const fetchSettings = async () => {
      const settingsDoc = await getDoc(doc(db, 'settings', 'company'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as CompanySettings;
        setCompanyName(data.companyName || '');
        setLlcNumber(data.llcNumber || '');
        setEmailTemplate(data.emailTemplate || 'standard');
      }
    };
    fetchSettings();

    const fetchUsers = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap: Record<string, User> = {};
      usersSnap.forEach(doc => {
        usersMap[doc.id] = { id: doc.id, ...doc.data() } as User;
      });
      setUsers(usersMap);
    };
    fetchUsers();

    const q = query(
      collection(db, 'timesheets'),
      orderBy('clockIn', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sheets: Timesheet[] = [];
      snapshot.forEach((doc) => {
        sheets.push({ id: doc.id, ...doc.data() } as Timesheet);
      });
      setTimesheets(sheets);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (id: string) => {
    await updateDoc(doc(db, 'timesheets', id), {
      status: 'approved'
    });
  };

  const getWorkspaceToken = async () => {
    if (workspaceToken) return workspaceToken;
    
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    provider.addScope('https://www.googleapis.com/auth/documents');
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    try {
      if (auth.currentUser) {
        try {
          const result = await linkWithPopup(auth.currentUser, provider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setWorkspaceToken(credential.accessToken);
            return credential.accessToken;
          }
        } catch (linkError: any) {
          if (linkError.code === 'auth/provider-already-linked') {
            const result = await reauthenticateWithPopup(auth.currentUser, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
              setWorkspaceToken(credential.accessToken);
              return credential.accessToken;
            }
          } else if (linkError.code === 'auth/credential-already-in-use') {
            throw new Error('That Google account is already linked to a different ThinkTime user. Use a different Google account or unlink it from the other Firebase user first.');
          } else {
            throw linkError;
          }
        }
      }
    } catch (error) {
      console.error("Workspace Auth Error:", error);
      alert("Could not connect to Google Workspace. Did you close the popup?");
      return null;
    }
    return null;
  };

  const fetchAIReport = async () => {
    const formattedTimesheets = timesheets.map(t => ({
      employee: users[t.userId]?.name || 'Unknown',
      clockIn: format(t.clockIn, 'MM/dd/yyyy HH:mm'),
      clockOut: t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active',
      hours: t.totalHours ? t.totalHours.toFixed(2) : 0,
      status: t.status
    }));

    const aiHeaders = await getSavedAIRequestHeaders(user.id);
    const response = await fetch('/api/generate-report', {
      method: 'POST',
      headers: aiHeaders,
      body: JSON.stringify({ companyName, llcNumber, timesheets: formattedTimesheets })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to generate AI report');
    }
    const data = await response.json();
    return data.reportText;
  };

  const exportToDocs = async () => {
    const confirmed = window.confirm("Create a new Google Doc with an AI-generated narrative report?");
    if (!confirmed) return;

    setIsExporting(true);
    try {
      const token = await getWorkspaceToken();
      if (!token) throw new Error("No access token");

      const reportText = await fetchAIReport();

      // Create Document
      const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: `${companyName || 'Company'} Timesheet Report - ${format(new Date(), 'yyyy-MM-dd')}` })
      });
      await requireGoogleResponse(createRes, 'Google Docs document creation');
      const docData = await createRes.json();
      if (!docData.documentId) throw new Error('Google Docs did not return a document ID.');

      // Insert Text
      const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docData.documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            insertText: {
              location: { index: 1 },
              text: reportText
            }
          }]
        })
      });
      await requireGoogleResponse(updateRes, 'Google Docs content update');

      alert("Successfully exported AI narrative to Google Docs!");
      window.open(`https://docs.google.com/document/d/${docData.documentId}/edit`, '_blank');
    } catch (error) {
      console.error(error);
      alert("Failed to export to Google Docs.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToSheets = async () => {
    const confirmed = window.confirm("Create a new Google Sheet with structured timesheet data?");
    if (!confirmed) return;

    setIsExporting(true);
    try {
      const token = await getWorkspaceToken();
      if (!token) throw new Error("No access token");

      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `${companyName || 'Company'} Timesheet Log - ${format(new Date(), 'yyyy-MM-dd')}`
          }
        })
      });
      await requireGoogleResponse(createRes, 'Google Sheets spreadsheet creation');
      const sheetData = await createRes.json();
      const spreadsheetId = sheetData.spreadsheetId;
      if (!spreadsheetId) throw new Error('Google Sheets did not return a spreadsheet ID.');

      const values = [
        ["Company Name:", companyName || 'N/A'],
        ["LLC / Registration #:", llcNumber || 'N/A'],
        ["Report Date:", format(new Date(), 'MM/dd/yyyy HH:mm')],
        [],
        ["Employee ID", "Employee Name", "Clock In", "Clock Out", "Hours", "Status"]
      ];

      timesheets.forEach(t => {
        values.push([
          users[t.userId]?.employeeId || t.userId.substring(0, 6),
          users[t.userId]?.name || 'Unknown',
          format(t.clockIn, 'MM/dd/yyyy HH:mm'),
          t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active',
          t.totalHours ? t.totalHours.toFixed(2) : '0',
          t.status
        ]);
      });

      const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: values })
      });
      await requireGoogleResponse(appendRes, 'Google Sheets data export');

      alert("Successfully exported structured data to Google Sheets!");
      window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank');
    } catch (error) {
      console.error(error);
      alert("Failed to export to Google Sheets.");
    } finally {
      setIsExporting(false);
    }
  };

  const generateBasicReportText = () => {
    let text = `${companyName || 'Company'} Timesheet Report\n`;
    if (llcNumber) text += `LLC/ID: ${llcNumber}\n`;
    text += `\n`;
    timesheets.forEach(t => {
      const empName = users[t.userId]?.name || 'Unknown';
      const cIn = format(t.clockIn, 'MM/dd/yyyy HH:mm');
      const cOut = t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active';
      const hrs = t.totalHours ? t.totalHours.toFixed(2) : '-';
      text += `${empName} | In: ${cIn} | Out: ${cOut} | Hrs: ${hrs} | Status: ${t.status}\n`;
    });
    return text;
  };

  const emailReport = async () => {
    const deliveryEmail = user.contactEmail?.trim();
    if (!deliveryEmail) {
      alert('Add a real contact/payroll email to the administrator profile before sending reports by Gmail.');
      return;
    }
    const confirmed = window.confirm(`Send this timesheet report to ${deliveryEmail} via Gmail?`);
    if (!confirmed) return;

    setIsExporting(true);
    try {
      const token = await getWorkspaceToken();
      if (!token) throw new Error("No access token");

      let reportText = generateBasicReportText();
      try {
        // Optionally try to use AI for the email body if possible
        reportText = await fetchAIReport();
      } catch(e) {
        console.warn("AI generation failed for email, using basic text.");
      }

      const emailLines = [
        "To: " + deliveryEmail, 
        `Subject: ${companyName || 'Company'} - Timesheet Report`,
        "",
        reportText
      ];
      
      const emailContent = emailLines.join('\n');
      const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent))).replace(/\+/g, '-').replace(/\//g, '_');

      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64EncodedEmail })
      });
      await requireGoogleResponse(gmailRes, 'Gmail report delivery');

      alert("Successfully sent AI report via Gmail!");
    } catch (error) {
      console.error(error);
      alert("Failed to send email.");
    } finally {
      setIsExporting(false);
    }
  };

  const emailEmployeePayroll = async (emp: User & { totalHours: number, grossPay: number, timesheets: Timesheet[] }) => {
    const deliveryEmail = emp.contactEmail?.trim();
    if (!deliveryEmail) {
      alert(`${emp.name} does not have a real contact/payroll email configured.`);
      return;
    }
    const confirmed = window.confirm(`Generate and send AI payroll summary to ${emp.name} (${deliveryEmail})?`);
    if (!confirmed) return;
    
    setIsExporting(true);
    try {
      const token = await getWorkspaceToken();
      if (!token) throw new Error("No access token");

      // Generate email content using the AI API
      const aiHeaders = await getSavedAIRequestHeaders(user.id);
      const response = await fetch('/api/generate-email', {
        method: 'POST',
        headers: aiHeaders,
        body: JSON.stringify({
          template: emailTemplate,
          employee: {
            name: emp.name,
            id: emp.employeeId,
            totalHours: emp.totalHours,
            payRate: emp.payRate || 0,
            grossPay: emp.grossPay
          },
          dateRange: { start: startDate, end: endDate },
          timesheets: emp.timesheets.map(t => ({
            clockIn: format(t.clockIn, 'MM/dd/yyyy HH:mm'),
            clockOut: t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active',
            hours: t.totalHours ? t.totalHours.toFixed(2) : 0
          })),
          companyName: companyName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate AI email');
      }

      const { subject, body } = await response.json();

      const emailLines = [
        "To: " + deliveryEmail, 
        `Subject: ${subject}`,
        "",
        body
      ];
      
      const emailContent = emailLines.join('\n');
      const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent))).replace(/\+/g, '-').replace(/\//g, '_');

      const payrollGmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64EncodedEmail })
      });
      await requireGoogleResponse(payrollGmailRes, 'Gmail payroll delivery');

      alert(`Successfully sent AI-generated payroll report to ${emp.name}!`);
    } catch (error) {
      console.error(error);
      alert("Failed to send employee email. Check connection.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`${companyName || 'Company'} - Timesheet Report`, 14, 15);
    if (llcNumber) {
      doc.setFontSize(10);
      doc.text(`LLC/ID: ${llcNumber}`, 14, 22);
    }
    
    const tableData = timesheets.map(t => [
      users[t.userId]?.name || 'Unknown',
      format(t.clockIn, 'MM/dd/yyyy HH:mm'),
      t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active',
      t.totalHours ? t.totalHours.toFixed(2) : '-',
      t.status
    ]);

    autoTable(doc, {
      head: [['Employee', 'Clock In', 'Clock Out', 'Hours', 'Status']],
      body: tableData,
      startY: 30
    });

    doc.save(`${companyName ? companyName + '-' : ''}timesheets.pdf`);
  };

  const exportCSV = () => {
    const headers = ['Employee ID', 'Employee Name', 'Clock In', 'Clock Out', 'Hours', 'Status'];
    const rows = timesheets.map(t => [
      users[t.userId]?.employeeId || t.userId,
      users[t.userId]?.name || 'Unknown',
      format(t.clockIn, 'MM/dd/yyyy HH:mm'),
      t.clockOut ? format(t.clockOut, 'HH:mm') : 'Active',
      t.totalHours ? t.totalHours.toFixed(2) : '0',
      t.status
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + (companyName ? `Company: ${companyName}\n` : '')
      + (llcNumber ? `LLC: ${llcNumber}\n\n` : '')
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${companyName ? companyName + '-' : ''}timesheets.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter timesheets by Date Range
  const filteredTimesheets = timesheets.filter(t => {
    if (!startDate || !endDate) return true;
    const sDate = new Date(startDate).setHours(0,0,0,0);
    const eDate = new Date(endDate).setHours(23,59,59,999);
    return t.clockIn >= sDate && t.clockIn <= eDate;
  });

  const pendingCount = filteredTimesheets.filter(t => t.status === 'pending' && t.clockOut !== null).length;

  // Calculate Payroll Summaries based on filtered timesheets
  const payrollSummaries = (Object.values(users) as User[])
    .filter(u => u.role === 'employee')
    .map(emp => {
      const empSheets = filteredTimesheets.filter(t => t.userId === emp.id);
      const totalHours = empSheets.reduce((sum, t) => sum + (t.totalHours || 0), 0);
      const payRate = emp.payRate || 0;
      const grossPay = totalHours * payRate;
      return { ...emp, totalHours, grossPay, timesheets: empSheets };
    })
    .filter(emp => emp.totalHours > 0);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#020617] text-slate-100 font-sans">
      <Sidebar user={user} />
      
      <main className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
        <header className="flex flex-col xl:flex-row xl:justify-between xl:items-end mb-4 gap-4">
          <div>
            <h1 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-1">{companyName || 'Enterprise Management'}</h1>
            <h2 className="text-3xl font-light">Employee <span className="font-bold">Timesheets</span></h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={exportCSV}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button 
              onClick={exportPDF}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 flex items-center gap-2 transition-colors"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button 
              onClick={exportToSheets}
              disabled={isExporting}
              className="bg-[#0F9D58] hover:bg-[#0B8043] px-4 py-2 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(15,157,88,0.4)] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Grid className="w-4 h-4" />}
              Sheets
            </button>
            <button 
              onClick={exportToDocs}
              disabled={isExporting}
              className="bg-[#4285F4] hover:bg-[#3367D6] px-4 py-2 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(66,133,244,0.4)] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              AI Doc
            </button>
            <button 
              onClick={emailReport}
              disabled={isExporting}
              className="bg-[#EA4335] hover:bg-[#D93025] px-4 py-2 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(234,67,53,0.4)] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Gmail
            </button>
          </div>
        </header>

          <div className="flex flex-col flex-1 gap-6">
            
            {/* Date Range & Payroll Summaries */}
            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl shrink-0 overflow-hidden">
              <div className="bg-slate-900/50 p-4 border-b border-slate-800 flex flex-wrap gap-4 items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-400" />
                  Payroll Date Range
                </h3>
                <div className="flex items-center gap-3">
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-sky-500"
                  />
                  <span className="text-slate-500 text-sm">to</span>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/20">
                    <tr className="text-xs text-slate-400 uppercase tracking-tighter border-b border-slate-800">
                      <th className="py-3 font-medium pl-6">Employee</th>
                      <th className="py-3 font-medium">Total Hours</th>
                      <th className="py-3 font-medium">Pay Rate</th>
                      <th className="py-3 font-medium text-emerald-400">Gross Pay</th>
                      <th className="py-3 font-medium text-right pr-6">Send Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {payrollSummaries.length === 0 ? (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-500">No hours logged in this date range.</td></tr>
                    ) : payrollSummaries.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 pl-6 font-medium text-slate-200">
                          {emp.name} <span className="text-xs text-slate-500 ml-2 font-mono">({emp.employeeId || 'N/A'})</span>
                        </td>
                        <td className="py-3 font-mono text-sky-400">{emp.totalHours.toFixed(2)} hrs</td>
                        <td className="py-3 font-mono text-slate-400">${(emp.payRate || 0).toFixed(2)}/hr</td>
                        <td className="py-3 font-mono text-emerald-400 font-bold">${emp.grossPay.toFixed(2)}</td>
                        <td className="py-3 text-right pr-6">
                          <button 
                            onClick={() => emailEmployeePayroll(emp)}
                            disabled={isExporting}
                            className="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Email Summary
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[#0F172A]/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 flex-1 flex flex-col shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-3">
                  Timesheet Details
                  {pendingCount > 0 && (
                    <span className="text-xs bg-sky-500/20 text-sky-400 px-2.5 py-1 rounded-full font-medium border border-sky-500/20">
                      {pendingCount} Pending
                    </span>
                  )}
                </h3>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                      <th className="pb-3 font-medium pl-2">Employee</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Hours</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {filteredTimesheets.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-500">No timesheets recorded in this range.</td></tr>
                    ) : filteredTimesheets.map((sheet) => (
                      <tr key={sheet.id} className="group hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 pl-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold uppercase border border-indigo-500/20">
                              {users[sheet.userId]?.name?.substring(0, 2) || '?'}
                            </div>
                            <div>
                              <p className="font-medium text-slate-200">{users[sheet.userId]?.name || 'Unknown'}</p>
                              <p className="text-xs text-slate-500 font-mono">ID: {users[sheet.userId]?.employeeId || sheet.userId.substring(0,6)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <p className="text-slate-300">{format(sheet.clockIn, 'MMM dd, yyyy')}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {format(sheet.clockIn, 'HH:mm')} - {sheet.clockOut ? format(sheet.clockOut, 'HH:mm') : 'Now'}
                          </p>
                        </td>
                        <td className="py-4 font-mono text-sky-400">
                          {sheet.totalHours ? sheet.totalHours.toFixed(2) : '-'}
                        </td>
                        <td className="py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                            sheet.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            sheet.status === 'pending' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {sheet.status === 'pending' && !sheet.clockOut ? (
                              <><span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span> Active</>
                            ) : sheet.status}
                          </span>
                        </td>
                        <td className="py-4 text-right pr-2">
                          {sheet.status === 'pending' && sheet.clockOut && (
                            <button 
                              onClick={() => handleApprove(sheet.id)}
                              className="text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 justify-end ml-auto text-xs font-medium"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Approve
                            </button>
                          )}
                          {sheet.status === 'approved' && (
                            <span className="text-slate-500 text-xs flex items-center gap-1 justify-end">
                              <CheckCircle className="w-4 h-4" /> Approved
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      </main>
    </div>
  );
}
