import { useState, useRef, useCallback } from "react";
import { Camera, CreditCard, CheckCircle2, AlertCircle, Upload, RefreshCw } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import api from "../services/api";

const STEPS = [
  { id: "search",  label: "Find Student",   icon: "①" },
  { id: "rfid",    label: "Bind RFID Card", icon: "②" },
  { id: "face",    label: "Capture Face",   icon: "③" },
  { id: "done",    label: "Complete",       icon: "④" },
];

export default function Enrollment() {
  const [step, setStep] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [rfidUid, setRfidUid] = useState("");
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);  // { type: "success"|"error", text }
  const fileRef = useRef(null);

  // ── Search ───────────────────────────────────────────────────────────────
  async function searchUsers() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get("/users", { params: { search: searchQuery, page_size: 10 } });
      setUsers(data);
    } catch {
      setMessage({ type: "error", text: "Search failed." });
    } finally {
      setLoading(false);
    }
  }

  // ── Bind RFID ────────────────────────────────────────────────────────────
  async function bindRFID() {
    if (!rfidUid.trim()) return;
    setLoading(true);
    try {
      await api.post(`/enrollment/${selectedUser.id}/rfid`, { card_uid: rfidUid.toUpperCase() });
      setMessage({ type: "success", text: "RFID card successfully bound." });
      setStep("face");
    } catch (e) {
      setMessage({ type: "error", text: e.response?.data?.detail || "RFID binding failed." });
    } finally {
      setLoading(false);
    }
  }

  // ── Face frames upload ────────────────────────────────────────────────────
  function handleFrameFiles(e) {
    const files = Array.from(e.target.files);
    setCapturedFrames(files.slice(0, 5));
  }

  async function enrollFace() {
    if (capturedFrames.length < 1) return;
    setLoading(true);
    try {
      const fd = new FormData();
      capturedFrames.forEach((f) => fd.append("frames", f));
      await api.post(`/enrollment/${selectedUser.id}/face`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({ type: "success", text: "Face embedding enrolled successfully!" });
      setStep("done");
    } catch (e) {
      setMessage({ type: "error", text: e.response?.data?.detail || "Face enrollment failed." });
    } finally {
      setLoading(false);
    }
  }

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-screen bg-ecsiLightBg">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Student Enrollment" connected={false} />

        <main className="p-6 max-w-2xl mx-auto space-y-6">
          {/* Step progress */}
          <div className="card">
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    i < currentStepIdx
                      ? "bg-ecsiGreen text-white"
                      : i === currentStepIdx
                      ? "bg-ecsiYellow text-textGraphite"
                      : "bg-gray-100 text-textGray"
                  }`}>
                    {i < currentStepIdx ? <CheckCircle2 size={16} /> : s.icon}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    i === currentStepIdx ? "text-textGraphite" : "text-textGray"
                  }`}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIdx ? "bg-ecsiGreen" : "bg-gray-200"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
              message.type === "success"
                ? "bg-ecsiGreen/10 text-ecsiGreen border border-ecsiGreen/20"
                : "bg-alertRed/10 text-alertRed border border-alertRed/20"
            }`}>
              {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {message.text}
            </div>
          )}

          {/* Step: Search */}
          {step === "search" && (
            <div className="card space-y-4">
              <h2 className="text-base font-bold text-textGraphite">Find Student</h2>
              <div className="flex gap-3">
                <input className="input flex-1"
                  placeholder="Search by name or ID number…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                />
                <button onClick={searchUsers} className="btn-primary">Search</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {users.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setStep("rfid"); setMessage(null); }}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-ecsiYellow hover:bg-ecsiYellow/5 transition-all"
                  >
                    <div>
                      <p className="font-semibold text-textGraphite text-sm">{u.full_name}</p>
                      <p className="text-textGray text-xs">{u.id_number} · {u.role}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.has_rfid ? "bg-ecsiGreen/10 text-ecsiGreen" : "bg-gray-100 text-textGray"}`}>
                        {u.has_rfid ? "RFID ✓" : "No RFID"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.has_face ? "bg-ecsiGreen/10 text-ecsiGreen" : "bg-gray-100 text-textGray"}`}>
                        {u.has_face ? "Face ✓" : "No Face"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: RFID Bind */}
          {step === "rfid" && (
            <div className="card space-y-4">
              <h2 className="text-base font-bold text-textGraphite">Bind RFID Card</h2>
              <p className="text-sm text-textGray">
                Enrolling: <span className="font-semibold text-textGraphite">{selectedUser?.full_name}</span>
              </p>
              <div className="border-2 border-dashed border-ecsiYellow/40 rounded-xl p-6 text-center">
                <CreditCard size={36} className="mx-auto text-ecsiYellow mb-3" />
                <p className="text-sm text-textGray mb-3">
                  Tap the student's RFID card on the reader OR enter the UID manually below.
                </p>
                <input
                  className="input max-w-xs mx-auto text-center font-mono text-sm"
                  placeholder="e.g. A3F20B11"
                  value={rfidUid}
                  onChange={(e) => setRfidUid(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={bindRFID} disabled={!rfidUid || loading} className="btn-primary flex-1">
                  {loading ? "Binding…" : "Bind Card"}
                </button>
                <button onClick={() => setStep("face")} className="btn-secondary">Skip → Face</button>
              </div>
            </div>
          )}

          {/* Step: Face Capture */}
          {step === "face" && (
            <div className="card space-y-4">
              <h2 className="text-base font-bold text-textGraphite">Capture Face</h2>
              <p className="text-sm text-textGray">
                Upload <strong>5 photos</strong> of the student from slightly different angles.
                Good lighting and a clear face are essential for accurate recognition.
              </p>
              <div
                className="border-2 border-dashed border-ecsiYellow/40 rounded-xl p-6 text-center cursor-pointer hover:border-ecsiYellow transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={36} className="mx-auto text-ecsiYellow mb-2" />
                <p className="text-sm text-textGray">Click to select face images (JPEG/PNG)</p>
                <p className="text-xs text-textGray/70 mt-1">Up to 5 images · min 1 required</p>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={handleFrameFiles} />
              </div>

              {/* Thumbnails */}
              {capturedFrames.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {capturedFrames.map((f, i) => (
                    <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border-2 border-ecsiYellow">
                      <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <button onClick={() => setCapturedFrames([])}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-textGray hover:border-alertRed hover:text-alertRed transition-colors">
                    <RefreshCw size={16} />
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={enrollFace} disabled={!capturedFrames.length || loading} className="btn-primary flex-1">
                  {loading ? "Processing AI…" : `Enroll Face (${capturedFrames.length} frame${capturedFrames.length !== 1 ? "s" : ""})`}
                </button>
                <button onClick={() => setStep("search")} className="btn-secondary">Start Over</button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="card text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-ecsiGreen/10 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-ecsiGreen" />
              </div>
              <h2 className="text-xl font-extrabold text-textGraphite">Enrollment Complete!</h2>
              <p className="text-textGray text-sm">
                <span className="font-semibold">{selectedUser?.full_name}</span> is now fully enrolled
                with RFID and facial recognition active.
              </p>
              <button
                onClick={() => {
                  setStep("search");
                  setSelectedUser(null);
                  setUsers([]);
                  setRfidUid("");
                  setCapturedFrames([]);
                  setMessage(null);
                  setSearchQuery("");
                }}
                className="btn-primary mx-auto"
              >
                Enroll Another Student
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
