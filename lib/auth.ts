import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseAdminClient, createSupabaseAnonClient, hasSupabaseEnv } from "@/lib/supabase";
import { mockAnswers, mockPasswords, mockProfiles, mockSubmissions } from "@/lib/mock-data";
import { hydrateMockStore, persistMockStore } from "@/lib/mock-store";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/password";
import type { Profile } from "@/lib/types";
import { nowIso, uid } from "@/lib/utils";

const AUTH_COOKIE = "ap_mock_profile_id";
const SUPABASE_ACCESS_COOKIE = "ap_mock_sb_access";
const SUPABASE_REFRESH_COOKIE = "ap_mock_sb_refresh";
const isProduction = process.env.NODE_ENV === "production";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/"
  };
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "";
}

function signProfileId(profileId: string) {
  const secret = getSessionSecret();
  if (!secret) {
    if (isProduction) {
      throw new Error("SESSION_SECRET is required in production.");
    }
    return profileId;
  }

  const signature = createHmac("sha256", secret).update(profileId).digest("hex");
  return `${profileId}.${signature}`;
}

function readProfileIdFromSession(value: string | undefined) {
  if (!value) return null;

  const secret = getSessionSecret();
  if (!secret) {
    return isProduction ? null : value.split(".")[0] || null;
  }

  const [profileId, signature] = value.split(".");
  if (!profileId || !signature) return null;

  const expected = createHmac("sha256", secret).update(profileId).digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(providedBuffer, expectedBuffer) ? profileId : null;
}

function setAuthCookies(profileId: string, session?: { access_token: string; refresh_token: string }) {
  cookies().set(AUTH_COOKIE, signProfileId(profileId), cookieOptions());
  if (session?.access_token && session.refresh_token) {
    cookies().set(SUPABASE_ACCESS_COOKIE, session.access_token, cookieOptions());
    cookies().set(SUPABASE_REFRESH_COOKIE, session.refresh_token, cookieOptions());
  }
}

function getSupabaseSessionCookies() {
  const store = cookies();
  const accessToken = store.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = store.get(SUPABASE_REFRESH_COOKIE)?.value;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

async function ensureProfileForSupabaseUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: unknown };
}, fullName?: string) {
  const admin = createSupabaseAdminClient();
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Supabase user has no email address.");

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const updates: Record<string, string | null> = {};
    if (existing.email !== email) updates.email = email;
    if (!existing.full_name && fullName) updates.full_name = fullName;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = nowIso();
      const { data, error } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select("*")
        .single();
      if (error || !data) throw error || new Error("Unable to update profile.");
      return data as Profile;
    }
    return existing as Profile;
  }

  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  const { data, error } = await admin
    .from("profiles")
    .insert({
      id: user.id,
      email,
      full_name: fullName || metadataName || null,
      role: "student"
    })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Unable to create profile.");
  return data as Profile;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const id = readProfileIdFromSession(cookies().get(AUTH_COOKIE)?.value);
  if (!id) return null;

  if (hasSupabaseEnv()) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data as Profile;
  }

  await hydrateMockStore();
  return mockProfiles.find((profile) => profile.id === id) || null;
}

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

export async function requireStudentOrAdmin() {
  return requireProfile();
}

export async function signInWithEmail(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (hasSupabaseEnv()) {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });
    if (error || !data.user) {
      if (/email.*confirm|confirm.*email|not confirmed/i.test(error?.message || "")) {
        console.warn("Unverified login attempt:", normalizedEmail);
        throw new Error("Please confirm your email before signing in.");
      }
      console.warn("Supabase login failed:", error?.message || "Missing user");
      throw new Error("Invalid login credentials.");
    }
    if (!data.user.email_confirmed_at && !data.user.confirmed_at) {
      console.warn("Supabase returned an unverified user session:", normalizedEmail);
      throw new Error("Please confirm your email before signing in.");
    }

    const profile = await ensureProfileForSupabaseUser(data.user);

    setAuthCookies(data.user.id, data.session || undefined);
    return profile;
  }

  await hydrateMockStore();
  const storedPassword = mockPasswords[normalizedEmail];
  const passwordMatches = verifyPassword(password, storedPassword);
  const legacyPasswordMatches = !isPasswordHash(storedPassword) && storedPassword === password;
  if (!passwordMatches && !legacyPasswordMatches) {
    throw new Error("Invalid mock email or password.");
  }
  if (legacyPasswordMatches) {
    mockPasswords[normalizedEmail] = hashPassword(password);
    await persistMockStore();
  }

  const profile = mockProfiles.find((item) => item.email === normalizedEmail);
  if (!profile) throw new Error("No mock profile was found.");

  setAuthCookies(profile.id);
  return profile;
}

export async function registerStudent(
  email: string,
  password: string,
  fullName: string,
  emailRedirectTo?: string
) {
  const normalizedEmail = email.trim().toLowerCase();

  if (hasSupabaseEnv()) {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName,
          role: "student"
        }
      }
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to register.");
    }

    await ensureProfileForSupabaseUser(data.user, fullName);
    return {
      requiresEmailConfirmation: !data.session,
      emailConfirmationDisabled: Boolean(data.session)
    };
  }

  await hydrateMockStore();
  if (mockProfiles.some((item) => item.email === normalizedEmail)) {
    throw new Error("This mock email is already registered.");
  }

  const profile: Profile = {
    id: uid("profile"),
    email: normalizedEmail,
    full_name: fullName || null,
    role: "student",
    created_at: nowIso(),
    updated_at: nowIso()
  };
  mockProfiles.push(profile);
  mockPasswords[normalizedEmail] = hashPassword(password);
  await persistMockStore();

  return {
    requiresEmailConfirmation: false,
    emailConfirmationDisabled: true
  };
}

export async function resendSignupConfirmation(email: string, emailRedirectTo?: string) {
  if (!hasSupabaseEnv()) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const supabase = createSupabaseAnonClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
    options: {
      emailRedirectTo
    }
  });
  if (error) {
    console.warn("Supabase confirmation resend failed:", error.message);
  }
}

export async function updateCurrentUserEmail(newEmail: string, emailRedirectTo?: string) {
  if (!hasSupabaseEnv()) {
    throw new Error("Email changes require Supabase Auth.");
  }

  const session = getSupabaseSessionCookies();
  if (!session) {
    throw new Error("Please sign in again before changing your email.");
  }

  const supabase = createSupabaseAnonClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken
  });
  if (sessionError) {
    throw new Error("Please sign in again before changing your email.");
  }

  const { error } = await supabase.auth.updateUser(
    { email: newEmail.trim().toLowerCase() },
    { emailRedirectTo }
  );
  if (error) throw new Error(error.message);
}

export async function deleteCurrentStudentAccount(currentPassword: string) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be signed in to delete your account.");
  }
  if (profile.role === "admin") {
    throw new Error("Admin accounts cannot be deleted from this page.");
  }

  if (hasSupabaseEnv()) {
    const supabase = createSupabaseAnonClient();
    const { error: passwordError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword
    });
    if (passwordError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Account deletion password verification failed:", passwordError.message);
      }
      throw new Error("The password you entered was not correct.");
    }

    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id);
    if (deleteError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Supabase auth user deletion failed:", deleteError.message);
      }
      throw new Error("Unable to delete account. Please try again.");
    }
    return;
  }

  await hydrateMockStore();
  const storedPassword = mockPasswords[profile.email];
  const passwordMatches = verifyPassword(currentPassword, storedPassword);
  const legacyPasswordMatches = !isPasswordHash(storedPassword) && storedPassword === currentPassword;
  if (!passwordMatches && !legacyPasswordMatches) {
    throw new Error("The password you entered was not correct.");
  }

  const profileIndex = mockProfiles.findIndex((item) => item.id === profile.id);
  if (profileIndex >= 0) {
    mockProfiles.splice(profileIndex, 1);
  }
  for (let index = mockAnswers.length - 1; index >= 0; index -= 1) {
    const submission = mockSubmissions.find((item) => item.id === mockAnswers[index]?.submission_id);
    if (submission?.student_id === profile.id) {
      mockAnswers.splice(index, 1);
    }
  }
  for (let index = mockSubmissions.length - 1; index >= 0; index -= 1) {
    if (mockSubmissions[index]?.student_id === profile.id) {
      mockSubmissions.splice(index, 1);
    }
  }
  delete mockPasswords[profile.email];
  await persistMockStore();
}

export async function exchangeSupabaseCodeForAppSession(code: string) {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase Auth is not configured.");
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session?.user) {
    throw new Error(error?.message || "Unable to complete authentication.");
  }

  const profile = await ensureProfileForSupabaseUser(data.session.user);
  setAuthCookies(profile.id, data.session);
  return profile;
}

export function clearAuthCookie() {
  cookies().delete(AUTH_COOKIE);
  cookies().delete(SUPABASE_ACCESS_COOKIE);
  cookies().delete(SUPABASE_REFRESH_COOKIE);
}
