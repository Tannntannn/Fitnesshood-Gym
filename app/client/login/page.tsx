"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { UserRole } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ClientLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"activate" | "register" | "login">("activate");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress] = useState("");
  const [walkInRole, setWalkInRole] = useState<UserRole>("WALK_IN");
  const [accessCode, setAccessCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  /** Canonical public storage URL sent to register/activate APIs. */
  const [profileImageUrl, setProfileImageUrl] = useState("");
  /** Short-lived signed URL for <img> preview (private buckets). */
  const [profileImagePreviewUrl, setProfileImagePreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  return (
    <div
      className="min-h-screen grid place-items-center p-4 text-white"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(11,19,32,0.72), rgba(11,19,32,0.78)), url('/landing%20image.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Card className="surface-card w-full max-w-md space-y-4 border-white/15 bg-[#0f1a2a]/95 p-6 text-white shadow-xl shadow-black/40 backdrop-blur-sm">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png?v=1" alt="" className="h-12 w-12 rounded-lg bg-white/10 object-contain p-1" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">
            {mode === "activate" ? "Activate Account" : mode === "register" ? "Register Walk-in Account" : "Login"}
          </h1>
          <p className="text-sm text-slate-200">
            {mode === "activate"
              ? "For admin-registered users: set your password and upload your profile photo."
              : mode === "register"
              ? "Fill up your details, enter the admin access code, and wait for approval."
              : "Login with your registered email and password to view your QR and attendance."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/10 p-1">
          <Button
            type="button"
            variant="ghost"
            className={mode === "activate" ? "bg-[#00d47d] text-[#0b1320] shadow-sm font-semibold" : "text-slate-200"}
            onClick={() => {
              setMode("activate");
              setError("");
              setSuccess("");
              setProfileImagePreviewUrl("");
            }}
          >
            Activate
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={mode === "register" ? "bg-[#00d47d] text-[#0b1320] shadow-sm font-semibold" : "text-slate-200"}
            onClick={() => {
              setMode("register");
              setError("");
              setSuccess("");
              setProfileImagePreviewUrl("");
            }}
          >
            Register
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={mode === "login" ? "bg-[#00d47d] text-[#0b1320] shadow-sm font-semibold" : "text-slate-200"}
            onClick={() => {
              setMode("login");
              setError("");
              setSuccess("");
              setProfileImagePreviewUrl("");
            }}
          >
            Login
          </Button>
        </div>

        {mode === "register" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">First Name</label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Juan"
                className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Last Name</label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dela Cruz"
                className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Role</label>
              <select
                value={walkInRole}
                onChange={(e) => setWalkInRole(e.target.value as UserRole)}
                className="h-10 w-full rounded-md border border-white/25 bg-white/10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00d47d]/30"
              >
                <option value="WALK_IN" className="text-slate-900">Walk-in (Student)</option>
                <option value="WALK_IN_REGULAR" className="text-slate-900">Walk-in (Regular)</option>
              </select>
            </div>
          </>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">Registered Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
          />
        </div>

        {mode === "register" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Contact Number</label>
              <Input
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="09xxxxxxxxx"
                className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Address (optional)</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Your address"
                className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Admin Access Code</label>
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="WALK-XXXXXX"
                className="border-white/25 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
          </>
        ) : null}

        {mode === "register" || mode === "activate" ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Profile Picture (required)</label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="border-white/25 bg-white/10 text-slate-100 file:text-slate-100"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingImage(true);
                const formData = new FormData();
                formData.append("file", file);
                if (email.trim()) formData.append("pendingEmail", email.trim().toLowerCase());
                if (mode === "register" && accessCode.trim()) {
                  formData.append("pendingAccessCode", accessCode.trim().toUpperCase());
                }
                try {
                  const res = await fetch("/api/upload/profile", { method: "POST", body: formData });
                  const json = (await res.json()) as { success: boolean; url?: string; previewUrl?: string; error?: string };
                  if (json.success && json.url) {
                    setProfileImageUrl(json.url);
                    setProfileImagePreviewUrl(json.previewUrl?.trim() || json.url);
                  } else setError(json.error ?? "Image upload failed.");
                } catch {
                  setError("Image upload failed.");
                } finally {
                  setUploadingImage(false);
                  e.target.value = "";
                }
              }}
            />
            {uploadingImage ? <p className="text-xs text-slate-500">Uploading image...</p> : null}
            {mode === "register" ? (
              <p className="text-[11px] text-slate-400">
                Enter your <span className="font-medium text-slate-300">admin access code</span> first, then pick a photo — the server checks the code before upload.
              </p>
            ) : null}
            {profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImagePreviewUrl || profileImageUrl}
                alt="Profile preview"
                className="h-16 w-16 rounded-lg border border-slate-200 object-cover bg-white/10"
              />
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-200">Password</label>
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
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#00d47d]/40"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "login" ? (
            <p className="text-right text-xs">
              <Link href="/client/forgot-password" className="text-[#00d47d] hover:underline">
                Forgot password?
              </Link>
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <Button
          type="button"
          className="w-full bg-[#00d47d] text-[#0b1320] hover:bg-[#00d47d]/90 font-semibold"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            setSuccess("");
            try {
              const endpoint =
                mode === "activate" ? "/api/client/activate" : mode === "register" ? "/api/client/register" : "/api/client/login";
              const payload =
                mode === "activate"
                  ? { email, password, profileImageUrl }
                  : mode === "register"
                  ? { firstName, lastName, email, contactNo, address, role: walkInRole, accessCode, password, profileImageUrl }
                  : { email, password };
              const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const json = (await res.json()) as { success: boolean; error?: string };
              if (!json.success) {
                setError(json.error ?? "Unable to continue.");
                return;
              }
              if (mode === "register") {
                setSuccess("Registration submitted. Wait for admin approval, then log in.");
                setFirstName("");
                setLastName("");
                setEmail("");
                setContactNo("");
                setAddress("");
                setAccessCode("");
                setPassword("");
                setProfileImageUrl("");
                setProfileImagePreviewUrl("");
                return;
              }
              if (mode === "activate") {
                router.push("/client/dashboard");
                return;
              }
              router.push("/client/dashboard");
            } catch {
              setError(
                mode === "activate"
                  ? "Unable to activate account."
                  : mode === "register"
                    ? "Unable to submit registration."
                    : "Unable to login.",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading
            ? mode === "activate"
              ? "Activating..."
              : mode === "register"
                ? "Submitting..."
                : "Signing in..."
            : mode === "activate"
              ? "Activate Account"
              : mode === "register"
                ? "Submit Registration"
                : "Sign In"}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          Membership details, add-ons, and gym rules live on the{" "}
          <Link href="/#about" className="text-[#00d47d] hover:underline">
            public home page
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
