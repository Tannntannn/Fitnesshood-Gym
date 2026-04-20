"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ClientForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
          <h1 className="text-xl font-semibold text-white">Forgot Password</h1>
          <p className="text-sm text-slate-200">Enter your registered email to receive a reset link.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">Registered Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
          />
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

        <Button
          type="button"
          className="w-full bg-[#00d47d] font-semibold text-[#0b1320] hover:bg-[#00d47d]/90"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            setMessage("");
            try {
              const res = await fetch("/api/client/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const json = (await res.json()) as { success: boolean; error?: string; message?: string };
              if (!json.success) {
                setError(json.error ?? "Unable to process your request.");
                return;
              }
              setMessage(json.message ?? "If your email is registered, a reset link has been sent.");
            } catch {
              setError("Unable to process your request.");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Sending..." : "Send Reset Link"}
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

