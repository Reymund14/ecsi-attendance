import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserCheck, FileText,
  Settings, LogOut, ShieldAlert, BookOpen,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = {
  super_admin: [
    { to: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { to: "/users",      label: "Users",        icon: Users },
    { to: "/enrollment", label: "Enrollment",   icon: UserCheck },
    { to: "/attendance", label: "Attendance",   icon: BookOpen },
    { to: "/proxy-logs", label: "Proxy Alerts", icon: ShieldAlert },
    { to: "/reports",    label: "Reports",      icon: FileText },
    { to: "/settings",   label: "Settings",     icon: Settings },
  ],
  faculty: [
    { to: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { to: "/attendance", label: "Attendance",   icon: BookOpen },
    { to: "/proxy-logs", label: "Proxy Alerts", icon: ShieldAlert },
    { to: "/reports",    label: "Reports",      icon: FileText },
  ],
  student: [
    { to: "/my-attendance", label: "My Attendance", icon: BookOpen },
    { to: "/enrollment",    label: "Face Setup",    icon: UserCheck },
  ],
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = NAV[user?.role] || [];

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside className="h-screen w-60 bg-textGraphite flex flex-col fixed left-0 top-0 z-30 shadow-xl">
      {/* Logo / Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ecsiYellow flex items-center justify-center font-black text-textGraphite text-lg leading-none">
            E
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ECSI</p>
            <p className="text-white/50 text-xs leading-tight">Attendance System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest px-2 mb-3">
          Navigation
        </p>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-ecsiYellow text-textGraphite"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-semibold truncate">{user?.full_name}</p>
          <p className="text-white/40 text-xs capitalize">{user?.role?.replace("_", " ")}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-alertRed/20 hover:text-alertRed transition-all duration-150"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
