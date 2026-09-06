/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { User } from './lib/types';
import Login from './pages/Login';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeePortal from './pages/EmployeePortal';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import TeamManagement from './pages/TeamManagement';
import Settings from './pages/Settings';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (userDoc) => {
          setUser(userDoc.exists() ? ({ id: firebaseUser.uid, ...userDoc.data() } as User) : null);
          setLoading(false);
        },
        (error) => {
          console.error('Failed to load ThinkTime user profile:', error);
          setUser(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#020617] text-sky-500">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          !user ? <Login /> : 
          user.role === 'admin' ? <Navigate to="/admin" /> : 
          user.role === 'manager' ? <Navigate to="/manager" /> : 
          <Navigate to="/dashboard" />
        } />
        <Route path="/dashboard" element={user && user.role === 'employee' ? <EmployeeDashboard user={user} /> : <Navigate to="/" />} />
        <Route path="/portal" element={user && (user.role === 'employee' || user.role === 'manager') ? <EmployeePortal user={user} /> : <Navigate to="/" />} />
        <Route path="/admin" element={user && user.role === 'admin' ? <AdminDashboard user={user} /> : <Navigate to="/" />} />
        <Route path="/manager" element={user && user.role === 'manager' ? <ManagerDashboard user={user} /> : <Navigate to="/" />} />
        <Route path="/team" element={user && user.role === 'admin' ? <TeamManagement user={user} /> : <Navigate to="/" />} />
        <Route path="/settings" element={user ? <Settings user={user} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
