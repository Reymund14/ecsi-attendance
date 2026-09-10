import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Hash, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ id_number: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.id_number, form.password);
      // Role-based redirect
      if (user.role === "student") navigate("/my-attendance");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-textGraphite flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-textGraphite to-gray-800 p-12">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-ecsiYellow flex items-center justify-center font-black text-textGraphite text-2xl">
            E
          </div>
          <div>
            <p className="text-white font-bold text-xl">ECSI</p>
            <p className="text-white/50 text-sm">Emmaus Christian Schools, Inc.</p>
          </div>
        </div>

        {/* Feature callouts */}
        <div className="space-y-6">
          <h2 className="text-white text-4xl font-extrabold leading-tight">
            Multi-Modal<br />
            <span className="text-ecsiYellow">Attendance</span><br />
            System
          </h2>
          {[
            { dot: "bg-ecsiYellow",  text: "RFID Card Verification" },
            { dot: "bg-ecsiGreen",   text: "AI Facial Recognition" },
            { dot: "bg-blue-400",    text: "Real-Time Proxy Detection" },
            { dot: "bg-purple-400",  text: "Live Dashboard Analytics" },
          ].map(({ dot, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <p className="text-white/70 text-sm">{text}</p>
            </div>
          ))}
        </div>

        <p className="text-white/30 text-xs">© {new Date().getFullYear()} ECSI · All rights reserved</p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-ecsiYellow flex items-center justify-center font-black text-textGraphite text-xl">
              E
            </div>
            <p className="text-white font-bold text-lg">ECSI Attendance</p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h3 className="text-2xl font-extrabold text-textGraphite mb-1">Welcome back</h3>
            <p className="text-textGray text-sm mb-7">Sign in to your account to continue.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ID Number */}
              <div>
                <label className="block text-xs font-semibold text-textGray mb-1.5">ID Number</label>
                <div className="relative">
                  <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-textGray" />
                  <input
                    type="text"
                    className="input pl-9"
                    placeholder="e.g. 2024-00001"
                    value={form.id_number}
                    onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-textGray mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-textGray" />
                  <input
                    type={showPass ? "text" : "password"}
                    className="input pl-9 pr-10"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-textGray hover:text-textGraphite"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-alertRed/10 border border-alertRed/20 rounded-lg px-4 py-2.5 text-alertRed text-sm font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
