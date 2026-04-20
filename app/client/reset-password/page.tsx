"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ClientResetPasswordPage() {
  const [token, setToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
    setToken(value);
  }, []);

  return (
    <div
      className="min-h-screen grid place-items-center p-4"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backgroundImage: "linear-gradient(to bottom, rgba(11,19,32,0.75), rgba(11,19,32,0.78)), url('/model%201.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Card className="surface-card w-full max-w-md space-y-4 border-white/20 bg-[#0b1320]/75 p-6 text-white backdrop-blur-md">
        <div>
          <h1 className="text-xl font-semibold text-white">Reset Password</h1>
          <p className="text-sm text-slate-200">Set a new password for your member account.</p>
        </div>

        {!token ? <p className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">Invalid reset link.</p> : null}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">New Password</label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="pr-10 border-white/25 bg-white/10 text-white placeholder:text-slate-300"
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 inline-flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-300 hover:bg-white/15 hover:text-white"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">Confirm Password</label>
          <Input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
          />
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

        <Button
          type="button"
          className="w-full bg-[#00d47d] font-semibold text-[#0b1320] hover:bg-[#00d47d]/90"
          disabled={loading || !token}
          onClick={async () => {
            setLoading(true);
            setError("");
            setMessage("");
            try {
              if (password.length < 6) {
                setError("Password must be at least 6 characters.");
                return;
              }
              if (password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
              }

              const res = await fetch("/api/client/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
              });
              const json = (await res.json()) as { success: boolean; error?: string };
              if (!json.success) {
                setError(json.error ?? "Unable to reset password.");
                return;
              }
              setMessage("Password reset successful. You can now login.");
              setPassword("");
              setConfirmPassword("");
            } catch {
              setError("Unable to reset password.");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Resetting..." : "Reset Password"}
        </Button>

        <p className="text-center text-xs text-slate-200">
          Back to{" "}
          <Link href="/client/login" className="font-medium text-[#00d47d] hover:underline">
            member login
          </Link>
        </p>
      </Card>
    </div>
  );
}

