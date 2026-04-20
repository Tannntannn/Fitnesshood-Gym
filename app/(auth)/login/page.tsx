"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (!response) {
        setError("Unable to login. Please check your internet connection and try again.");
        return;
      }
      if (response.error) {
        setError("Invalid email or password");
        return;
      }
      if (!response.ok) {
        setError("Login failed. Please try again.");
        return;
      }

      router.replace(response.url ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen grid place-items-center p-4 fade-in-up"
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
      <Card
        className="w-full max-w-md p-6 space-y-4 surface-card surface-card-interactive border-white/20 bg-[#0b1320]/75 text-white backdrop-blur-md"
        style={{ width: "100%", maxWidth: 460, padding: 24 }}
      >
        <div className="text-center">
          <div className="flex justify-center mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png?v=1"
              alt="FitnessHood logo"
              className="h-14 w-14 rounded-lg bg-slate-100 object-contain p-1.5"
              width={56}
              height={56}
              style={{ width: 56, height: 56, objectFit: "contain" }}
            />
          </div>
          <p className="text-2xl font-bold text-white">FitnessHood</p>
          <p className="text-sm text-slate-200">Admin Login</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10 border-white/25 bg-white/10 text-white placeholder:text-slate-300"
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#00d47d]/40"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full bg-[#00d47d] text-[#0b1320] hover:bg-[#00d47d]/90 transition-all duration-200 font-semibold" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
