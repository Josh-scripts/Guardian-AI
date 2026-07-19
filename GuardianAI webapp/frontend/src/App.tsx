import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

// Page Imports
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { LiveMap } from './pages/LiveMap';
import { Alerts } from './pages/Alerts';
import { Settings } from './pages/Settings';
import { Workers } from './pages/Workers';
import { SensorDashboard } from './pages/SensorDashboard';

// Route Guard Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: ('admin' | 'worker')[] }> = ({ children, roles }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen bg-cyber-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyber-yellow"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Workers cannot access admin sections
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Layout Wrapper
const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
  const { user } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      // Auto-collapse sidebar on smaller layouts
      if (window.innerWidth < 768) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-cyber-bg overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className="flex-1 overflow-y-auto bg-cyber-bg p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

// Dashboard Route Selector based on role
const DashboardSelector = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }
  return <WorkerDashboard />;
};

const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* Protected Routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <DashboardLayout>
            <DashboardSelector />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/live" element={
        <ProtectedRoute roles={['admin']}>
          <DashboardLayout>
            <LiveMonitoring />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/map" element={
        <ProtectedRoute roles={['admin']}>
          <DashboardLayout>
            <LiveMap />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/workers" element={
        <ProtectedRoute roles={['admin']}>
          <DashboardLayout>
            <Workers />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/alerts" element={
        <ProtectedRoute>
          <DashboardLayout>
            <Alerts />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/settings" element={
        <ProtectedRoute>
          <DashboardLayout>
            <Settings />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/sensors" element={
        <ProtectedRoute roles={['admin']}>
          <DashboardLayout>
            <SensorDashboard />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
