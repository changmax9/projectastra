import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseAdminClient, createSupabaseAnonClient, hasSupabaseEnv } from "@/lib/supabase";
import { mockPasswords, mockProfiles } from "@/lib/mock-data";
import { hydrateMockStore, persistMockStore } from "@/lib/mock-store";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/password";
import type { Profile } from "@/lib/types";
import { nowIso, uid } from "@/lib/utils";

const AUTH_COOKIE = "ap_mock_profile_id";
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
      throw new Error("Invalid login credentials.");
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Signed in, but no profile row was found. Run migrations and seed again.");
    }

    cookies().set(AUTH_COOKIE, signProfileId(data.user.id), cookieOptions());
    return profile as Profile;
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

  cookies().set(AUTH_COOKIE, signProfileId(profile.id), cookieOptions());
  return profile;
}

export async function registerStudent(email: string, password: string, fullName: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (hasSupabaseEnv()) {
    const admin = createSupabaseAdminClient();
    const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers();
    if (listError) {
      throw new Error(listError.message || "Unable to check existing users.");
    }
    const existingUser = existingUsers.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (existingUser) {
      throw new Error("Email already exists.");
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "student"
      }
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to register.");
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: data.user.id,
        email: normalizedEmail,
        full_name: fullName,
        role: "student"
      })
      .select("*")
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message || "Unable to create profile.");
    }

    cookies().set(AUTH_COOKIE, signProfileId(profile.id), cookieOptions());
    return profile as Profile;
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

  cookies().set(AUTH_COOKIE, signProfileId(profile.id), cookieOptions());
  return profile;
}

export function clearAuthCookie() {
  cookies().delete(AUTH_COOKIE);
}
