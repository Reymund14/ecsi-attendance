import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Pages
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import FacultyDashboard from "./pages/FacultyDashboard";
import StudentPanel from "./pages/StudentPanel";
import Enrollment from "./pages/Enrollment";
import Reports from "./pages/Reports";

/** Route guard — redirects unauthenticated users to /login */
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

/** Redirect after login based on role */
function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "student") return <Navigate to="/my-attendance" replace />;
  return <AdminDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Root redirect */}
          <Route path="/" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />

          {/* Admin + Faculty shared dashboard */}
          <Route path="/dashboard" element={
            <ProtectedRoute roles={["super_admin", "faculty"]}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* Attendance management (faculty view) */}
          <Route path="/attendance" element={
            <ProtectedRoute roles={["super_admin", "faculty"]}>
              <FacultyDashboard />
            </ProtectedRoute>
          } />

          {/* Enrollment */}
          <Route path="/enrollment" element={
            <ProtectedRoute roles={["super_admin", "faculty", "student"]}>
              <Enrollment />
            </ProtectedRoute>
          } />

          {/* Reports */}
          <Route path="/reports" element={
            <ProtectedRoute roles={["super_admin", "faculty"]}>
              <Reports />
            </ProtectedRoute>
          } />

          {/* Proxy logs (re-uses Reports page) */}
          <Route path="/proxy-logs" element={
            <ProtectedRoute roles={["super_admin", "faculty"]}>
              <Reports />
            </ProtectedRoute>
          } />

          {/* Student panel */}
          <Route path="/my-attendance" element={
            <ProtectedRoute roles={["student"]}>
              <StudentPanel />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
